// ═══════════════════════════════════════════════════════════════════════════
// falQueue.js — non-blocking Fal.ai access via the QUEUE API
//
// ROOT CAUSE this file exists to fix:
//   The old code called `https://fal.run/<model>` — Fal's SYNCHRONOUS endpoint.
//   It holds the HTTP connection open until the video is fully rendered.
//   Seedance takes minutes per 15-second clip, so three sequential fal.run
//   calls inside one request handler meant a single HTTP request had to stay
//   alive for ~10+ minutes. Node's default socket timeouts, the Next dev
//   server, and any proxy in between all drop that connection long before it
//   finishes — which is the "generation waited synchronously and failed if a
//   step stalled" symptom.
//
//   The fix is Fal's queue API:
//     POST https://queue.fal.run/<model>            -> { request_id, status_url, response_url }
//     GET  <status_url>                             -> { status: IN_QUEUE | IN_PROGRESS | COMPLETED }
//     GET  <response_url>                           -> the actual payload
//   Each HTTP call is short. We poll on OUR schedule and can report progress,
//   so nothing ever blocks for longer than a couple of seconds.
// ═══════════════════════════════════════════════════════════════════════════

const QUEUE_BASE = "https://queue.fal.run";
const REST_BASE = "https://rest.alpha.fal.ai";

export function getFalKey() {
  const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!key) {
    throw new Error("FAL_KEY is missing. Add it to scenica/.env.local and restart the dev server.");
  }
  return key;
}

function authHeaders(key, extra = {}) {
  return { Authorization: `Key ${key}`, ...extra };
}

// Fal reports an exhausted balance as a 403 with a specific body. Surfacing it
// verbatim saves a long debugging detour — the code is fine, the account isn't.
function describeFalError(status, bodyText) {
  const body = String(bodyText || "").slice(0, 500);

  if (status === 403 && /exhausted balance/i.test(body)) {
    return "Fal.ai rejected the request: the account balance is exhausted. Top up at fal.ai/dashboard/billing, then retry — no code change will get past this.";
  }
  if (status === 401) {
    return "Fal.ai rejected the API key (401). Check FAL_KEY in scenica/.env.local.";
  }

  // This is the specific case that looks like a schema/payload error but
  // isn't one: the request completed and Fal actually RENDERED the clip, then
  // its output-side classifier blocked delivery because the rendered pixels
  // resembled protected material (422, type "content_policy_violation",
  // cause "copyright"). Confirmed to fire on fully generic, original prompts
  // — e.g. "a bunny holding a poster" was blocked though nothing in it
  // referenced real IP — because printed/branded-looking objects (posters,
  // signs, screens, packaging, book/album covers) are the single biggest
  // false-positive trigger for this class of classifier. Retrying the same
  // clip with a strengthened "keep it blank/abstract" prompt (see
  // videoPlan.CONTENT_SAFETY_RULE_STRICT) is the effective fix, not editing
  // the story for real-world names.
  if (status === 422 && /content_policy_violation/i.test(body)) {
    const causeMatch = body.match(/"cause"\s*:\s*"([^"]+)"/i);
    const cause = causeMatch ? causeMatch[1] : "content policy";
    return (
      `Fal.ai rendered this clip but blocked delivery: the output was flagged for a possible ${cause} violation. ` +
      "This commonly fires as a false positive on printed/branded-looking objects in frame — a poster, sign, " +
      "screen, package, or book/album cover — even when the story itself is entirely original. " +
      "The system already retries once automatically with an instruction to render any such object as blank; " +
      "if it still fails after that, try describing the object without the word 'poster'/'sign'/'screen', or regenerate."
    );
  }
  if (status === 422) {
    return `Fal.ai rejected the request payload (422 validation error): ${body}`;
  }

  return `Fal.ai request failed (${status}): ${body}`;
}

function isContentPolicyViolation(bodyText) {
  return /content_policy_violation/i.test(String(bodyText || ""));
}

function buildFalError(status, bodyText) {
  const error = new Error(describeFalError(status, bodyText));
  const body = String(bodyText || "");
  if (isContentPolicyViolation(body)) error.code = "content_policy_violation";
  else if (status === 403 && /exhausted balance/i.test(body)) error.code = "exhausted_balance";
  else if (status === 401) error.code = "bad_api_key";
  else if (status === 422) error.code = "validation_error";
  error.terminal = true; // never worth blindly retrying as a transient network hiccup
  return error;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Submit a job to the Fal queue. Returns immediately with tracking URLs —
 * this call takes about a second regardless of how long the render will take.
 */
export async function submitToQueue(model, input) {
  const key = getFalKey();
  const response = await fetchWithTimeout(
    `${QUEUE_BASE}/${model}`,
    {
      method: "POST",
      headers: authHeaders(key, { "Content-Type": "application/json" }),
      body: JSON.stringify(input)
    },
    45000
  );

  const text = await response.text();
  if (!response.ok) {
    throw buildFalError(response.status, text);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Fal.ai returned a non-JSON queue response: ${text.slice(0, 200)}`);
  }

  const requestId = data?.request_id;
  if (!requestId) {
    throw new Error(`Fal.ai queue response did not include a request_id: ${text.slice(0, 200)}`);
  }

  return {
    requestId,
    statusUrl: data.status_url || `${QUEUE_BASE}/${model}/requests/${requestId}/status`,
    responseUrl: data.response_url || `${QUEUE_BASE}/${model}/requests/${requestId}`
  };
}

/**
 * Poll a queued job until it completes, then fetch and return its result.
 *
 * @param {object} handle              value returned by submitToQueue
 * @param {object} opts
 * @param {(info: object) => void} opts.onProgress  called on each poll tick
 * @param {number} opts.timeoutMs      give up after this long (default 20 min)
 * @param {number} opts.intervalMs     gap between polls (default 4 s)
 * @param {() => boolean} opts.isCancelled  abort hook
 */
export async function waitForQueueResult(handle, opts = {}) {
  const { onProgress, timeoutMs = 20 * 60 * 1000, intervalMs = 4000, isCancelled } = opts;
  const key = getFalKey();
  const startedAt = Date.now();

  // Transient network failures are tolerated for a stretch of WALL-CLOCK TIME,
  // not a fixed attempt count. A render runs for minutes, so a brief WiFi
  // drop, laptop sleep, or DNS blip lasting under ~3 minutes must not kill an
  // otherwise-succeeding job. (Previously this was 5 attempts at the default
  // 4s interval — under 20 seconds of tolerance, which failed a real job on
  // nothing worse than a single dropped connection.) Backoff grows on
  // repeated failures so a genuinely down network isn't hammered.
  const TRANSIENT_FAILURE_BUDGET_MS = 3 * 60 * 1000;
  let firstErrorAt = null;
  let consecutiveErrors = 0;

  for (;;) {
    if (isCancelled?.()) throw new Error("Generation cancelled.");

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Fal.ai did not finish this clip within ${Math.round(timeoutMs / 60000)} minutes. The request may still be running — check fal.ai/dashboard/requests.`
      );
    }

    let statusPayload = null;
    try {
      const statusRes = await fetchWithTimeout(handle.statusUrl, { headers: authHeaders(key) }, 30000);
      const statusText = await statusRes.text();

      if (!statusRes.ok) {
        // 4xx from the status endpoint is terminal; 5xx is worth retrying.
        if (statusRes.status < 500) throw buildFalError(statusRes.status, statusText);
        throw new Error(`transient status ${statusRes.status}`);
      }

      statusPayload = JSON.parse(statusText);
    } catch (error) {
      // .terminal is set by buildFalError for every definitive Fal rejection
      // (bad key, exhausted balance, content policy, validation). Falling
      // through to the transient-retry path below would burn up to
      // ~20 seconds silently reattempting something that will never succeed,
      // and — worse — a content_policy_violation's message no longer contains
      // the word "validation" now that it has its own clearer wording, so a
      // pure string-match check here would have let it slip through as if it
      // were a dropped connection.
      if (error.terminal) throw error;

      firstErrorAt = firstErrorAt ?? Date.now();
      consecutiveErrors += 1;
      if (Date.now() - firstErrorAt > TRANSIENT_FAILURE_BUDGET_MS) {
        throw new Error(`Lost contact with Fal.ai while waiting for the clip: ${error.message}`);
      }

      // Backoff: 4s, 8s, 16s, capped at 30s — spreads retries out instead of
      // hammering a struggling connection every 4 seconds for 3 minutes.
      const backoff = Math.min(30000, intervalMs * 2 ** (consecutiveErrors - 1));
      await sleep(backoff);
      continue;
    }

    // A status fetch that succeeds resets both the error clock and streak —
    // only CONSECUTIVE downtime counts against the budget.
    firstErrorAt = null;
    consecutiveErrors = 0;

    const status = statusPayload?.status;

    if (status === "COMPLETED") {
      const resultRes = await fetchWithTimeout(handle.responseUrl, { headers: authHeaders(key) }, 60000);
      const resultText = await resultRes.text();
      if (!resultRes.ok) throw buildFalError(resultRes.status, resultText);
      return JSON.parse(resultText);
    }

    if (status === "FAILED" || status === "ERROR") {
      throw new Error(`Fal.ai reported the clip as failed: ${JSON.stringify(statusPayload).slice(0, 300)}`);
    }

    onProgress?.({
      status,
      queuePosition: statusPayload?.queue_position ?? null,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000)
    });

    await sleep(intervalMs);
  }
}

/**
 * Upload bytes to Fal storage and return a fal-hosted URL.
 *
 * Used for the continuity anchor frame (the last frame of the previous clip).
 * Returns null rather than throwing: continuity chaining is an enhancement, so
 * a storage failure must degrade to prompt-only continuity, never fail the job.
 */
export async function uploadToFalStorage(buffer, fileName, contentType) {
  try {
    const key = getFalKey();

    const initiateRes = await fetchWithTimeout(
      `${REST_BASE}/storage/upload/initiate?storage_type=fal-cdn-v3`,
      {
        method: "POST",
        headers: authHeaders(key, { "Content-Type": "application/json" }),
        body: JSON.stringify({ content_type: contentType, file_name: fileName })
      },
      30000
    );

    if (!initiateRes.ok) return null;

    const { upload_url: uploadUrl, file_url: fileUrl } = await initiateRes.json();
    if (!uploadUrl || !fileUrl) return null;

    const putRes = await fetchWithTimeout(
      uploadUrl,
      { method: "PUT", headers: { "Content-Type": contentType }, body: buffer },
      60000
    );

    if (!putRes.ok) return null;
    return fileUrl;
  } catch {
    return null;
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
