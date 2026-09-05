// ═══════════════════════════════════════════════════════════════════════════
// /api/video — queued, pollable 3 x 15s → 45s generation pipeline
//
// POST  /api/video            → validates, starts a background job, returns a
//                               jobId in ~50ms. Never blocks on Fal.
// GET   /api/video?jobId=...  → job status (queued → generating → downloading
//                               → stitching → completed | failed)
// GET   /api/video?key=...    → streams the finished 45-second MP4
//
// WHY IT IS SHAPED THIS WAY — the three failures this replaces:
//
//   1. "one 45s request" — Seedance's `duration` maxes out at 15s, so a 45s
//      request is rejected by the model, not merely slow. Three 15s clips
//      stitched with ffmpeg is the only way to reach 45s.
//
//   2. "blocking request" — the old handler awaited three synchronous
//      https://fal.run/... calls inside a single HTTP request, holding the
//      connection open for 10+ minutes. Now the handler returns immediately
//      and the work continues in the background against Fal's QUEUE API,
//      with the browser polling for status.
//
//   3. "ffmpeg not found on Windows" — webpack rewrote ffmpeg-static's
//      __dirname. Fixed by serverExternalPackages in next.config.ts plus the
//      verifying resolver in lib/ffmpegPath.js.
//
// Continuity strategy, in descending order of strength:
//   a. The last frame of clip N is extracted with ffmpeg, uploaded to Fal
//      storage, and passed to clip N+1 as a reference image with an explicit
//      "start from this exact frame" instruction. This is what actually holds
//      faces, clothing, set and lighting together across a cut.
//   b. The same character portraits are passed as @ImageN references to all
//      three clips.
//   c. An identical cast bible plus explicit HANDOFF IN / HANDOFF OUT text in
//      every prompt.
//   (a) degrades to (b)+(c) silently if the upload fails — continuity gets
//   weaker, the job still completes.
// ═══════════════════════════════════════════════════════════════════════════

import { promises as fs } from "fs";
import { NextResponse } from "next/server";

import { submitToQueue, waitForQueueResult, uploadToFalStorage, getFalKey } from "@/lib/falQueue";
import {
  assertFfmpegAvailable,
  createJobWorkDir,
  downloadClip,
  extractLastFrame,
  extractFirstFrame,
  compareContinuity,
  stitchLocalClips,
  cleanupWorkDir
} from "@/lib/videoStitch";
import { createJob, updateJob, getJob, registerVideoFile, getVideoFile } from "@/lib/videoJobs";
import {
  SEGMENT_COUNT,
  SEGMENT_DURATION,
  SEGMENT_WINDOWS,
  TOTAL_SECONDS,
  isSupportedModel,
  getVideoModel,
  buildCastBible,
  buildSegmentPrompt,
  assignScenesToSegments,
  verifyScriptCoverage
} from "@/lib/videoPlan";

// The product requirement is that generation looks like one continuous film —
// the user is never shown clip counts, segment labels, provider names, or
// pipeline stages. These are the only strings the client ever sees while a
// job runs; everything more specific (clip numbers, Fal queue state, ffmpeg
// strategy, per-boundary continuity scores) stays server-side in console logs
// for diagnostics.
const PUBLIC_MESSAGE = {
  queued: "Preparing your video...",
  generating: "Creating your video...",
  stitching: "Finalizing your video...",
  completed: "Your video is ready.",
  failed: "We couldn't generate your video."
};

function sanitizeErrorForUser(rawMessage) {
  const text = String(rawMessage || "");
  if (/exhausted balance/i.test(text)) return "The video service is temporarily unavailable. Please try again later.";
  if (/API key/i.test(text)) return "The video service is not configured correctly. Please contact support.";
  if (/content_policy_violation|copyright/i.test(text)) return "We couldn't finish generating your video. Please try again.";
  if (/ffmpeg|duration|stitch|normalise|measure/i.test(text)) return "We couldn't finish preparing your video. Please try again.";
  if (/no scenes were supplied/i.test(text)) return text; // this one is directly actionable by the user, keep it
  return "Something went wrong while generating your video. Please try again.";
}

// This route spawns ffmpeg and touches the filesystem — it must not run on the
// edge runtime. maxDuration matters only on hosted platforms; locally the
// background job simply keeps running in the Node process.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Progress weighting: generation is the overwhelming majority of wall-clock
// time, so it owns 0-85% and the stitch owns the rest.
const GENERATION_PROGRESS_CEILING = 85;

function segmentProgress(segmentIndex, fraction = 0) {
  const per = GENERATION_PROGRESS_CEILING / SEGMENT_COUNT;
  return Math.round(segmentIndex * per + per * Math.min(1, Math.max(0, fraction)));
}

function extractVideoUrl(payload) {
  return (
    payload?.video?.url ||
    payload?.data?.video?.url ||
    payload?.output?.video?.url ||
    payload?.videos?.[0]?.url ||
    null
  );
}

/**
 * Submit one segment, tolerating the one genuinely ambiguous part of Fal's
 * schema: `duration` is documented as an enum of "auto" plus the numbers
 * 4-15, and different Fal endpoints have historically typed those members as
 * integers or as strings. Send the integer, and on a 422 that names duration,
 * retry once with the string form rather than failing the whole job.
 */
async function submitSegment(model, input) {
  try {
    return await submitToQueue(model, input);
  } catch (error) {
    if (/422/.test(error.message) && /duration/i.test(error.message)) {
      return submitToQueue(model, { ...input, duration: String(input.duration) });
    }
    throw error;
  }
}

async function runVideoGenerationJob(jobId, payload) {
  const { model, scenes, characters, referenceImages, resolution, aspectRatio, generateAudio } = payload;
  let workDir = null;

  try {
    // ── Preflight ─────────────────────────────────────────────────────────
    // Both of these throw with actionable text. Checking them BEFORE the first
    // Fal call means a missing key or a broken ffmpeg never wastes credits.
    getFalKey();
    const ffmpegBinary = assertFfmpegAvailable();

    workDir = await createJobWorkDir(jobId);

    const { buckets, diagnostics: planDiagnostics, segmentPhases } = assignScenesToSegments(scenes);
    const castBible = buildCastBible(characters, referenceImages);
    const characterImageUrls = referenceImages.map((ref) => ref.url);

    // Check 1 — script coverage: every scene the script produced must appear
    // somewhere in the plan. Structurally guaranteed by assignScenesToSegments,
    // verified here rather than assumed.
    const coverage = verifyScriptCoverage(scenes, buckets);
    if (!coverage.complete) {
      console.warn(`[video job ${jobId}] scenes missing from plan:`, coverage.missingSceneIds);
    }
    if (planDiagnostics.length > 0) {
      console.log(`[video job ${jobId}] plan notes:`, planDiagnostics);
    }

    updateJob(jobId, {
      status: "generating",
      stage: "generating",
      message: PUBLIC_MESSAGE.queued,
      progress: 1,
      ffmpegPath: ffmpegBinary
    });

    const segmentUrls = [];
    const segmentFiles = [];
    const segmentDetails = [];
    const diagnostics = [...planDiagnostics];
    const continuityScores = [];
    let continuityImageUrl = null;
    let previousHandoffFramePath = null;

    for (let index = 0; index < SEGMENT_COUNT; index += 1) {
      const window = SEGMENT_WINDOWS[index];

      // The continuity frame goes LAST in image_urls so the character
      // portraits keep their stable @Image1..@ImageN numbering across all
      // three prompts — renumbering them per segment would itself cause drift.
      const imageUrls = [...characterImageUrls];
      let continuityImageIndex = null;
      if (continuityImageUrl) {
        imageUrls.push(continuityImageUrl);
        continuityImageIndex = imageUrls.length;
      }

      // A content_policy_violation is a post-render output-classifier block,
      // not a broken request (see falQueue.js) — confirmed to false-positive
      // on fully generic content whenever a poster/sign/screen/package is in
      // frame. A second attempt with a stronger "render it blank" instruction
      // has a real chance of passing, since Fal's classifier runs on the new
      // render's actual pixels, not the prompt text. Retried once per clip;
      // a second failure is treated as genuine and surfaces to the user.
      // Was 2. Confirmed in practice that a retry which keeps the trigger
      // word (e.g. "poster") in the scene text while only ADDING a "render it
      // blank" instruction can still get blocked a second time — a
      // contradictory signal. videoPlan now also strips the trigger word
      // itself on retry (contentSafetyRetry neutralizes it in the scene
      // text), which should resolve it by attempt 2, but a 3rd attempt is
      // kept as margin since this is a real cost/time tradeoff either way.
      const MAX_CONTENT_SAFETY_ATTEMPTS = 3;
      let videoUrl = null;

      for (let attempt = 1; attempt <= MAX_CONTENT_SAFETY_ATTEMPTS; attempt += 1) {
        const isRetry = attempt > 1;

        const prompt = buildSegmentPrompt({
          segmentIndex: index,
          scenes: buckets[index],
          previousScenes: buckets[index - 1] || [],
          nextScenes: buckets[index + 1] || [],
          castBible,
          hasContinuityFrame: Boolean(continuityImageUrl),
          continuityImageIndex,
          contentSafetyRetry: isRetry,
          phase: segmentPhases[index]
        });

        if (isRetry) console.log(`[video job ${jobId}] segment ${index + 1} flagged by content filter, retrying with a stricter prompt`);

        updateJob(jobId, {
          status: "generating",
          stage: "generating",
          currentSegment: index + 1,
          message: PUBLIC_MESSAGE.generating,
          progress: segmentProgress(index, 0.05)
        });

        const input = {
          prompt,
          duration: SEGMENT_DURATION,
          resolution,
          aspect_ratio: aspectRatio,
          generate_audio: generateAudio
        };
        if (imageUrls.length > 0) input.image_urls = imageUrls;

        try {
          const handle = await submitSegment(model, input);

          updateJob(jobId, {
            message: PUBLIC_MESSAGE.generating,
            progress: segmentProgress(index, 0.1),
            falRequestId: handle.requestId
          });

          const result = await waitForQueueResult(handle, {
            onProgress: ({ status, queuePosition, elapsedSeconds }) => {
              const detail =
                status === "IN_QUEUE"
                  ? `waiting in Fal's queue${queuePosition !== null ? ` (position ${queuePosition})` : ""}`
                  : "rendering";
              updateJob(jobId, {
                message: PUBLIC_MESSAGE.generating,
                // Creep from 10% to 90% of this segment's share over ~6 minutes so
                // the bar always moves, without ever claiming the clip is done.
                progress: segmentProgress(index, 0.1 + Math.min(0.8, elapsedSeconds / 360))
              });
              if (process.env.NODE_ENV !== "production") {
                console.log(`[video job ${jobId}] segment ${index + 1}: ${status}${detail ? ` (${detail})` : ""}, ${elapsedSeconds}s elapsed`);
              }
            }
          });

          videoUrl = extractVideoUrl(result);
          if (!videoUrl) {
            throw new Error(
              `Fal returned no video URL for clip ${index + 1}. Response: ${JSON.stringify(result).slice(0, 300)}`
            );
          }
          break;
        } catch (error) {
          const canRetry = error?.code === "content_policy_violation" && attempt < MAX_CONTENT_SAFETY_ATTEMPTS;
          if (!canRetry) throw error;
          diagnostics.push(`segment ${index + 1} was blocked once by the content filter and auto-retried`);
        }
      }

      segmentUrls.push(videoUrl);
      segmentDetails.push({
        index: index + 1,
        key: window.key,
        label: window.label,
        url: videoUrl,
        sceneIds: buckets[index].map((scene) => scene?.id).filter((id) => id !== undefined)
      });

      updateJob(jobId, {
        message: PUBLIC_MESSAGE.generating,
        progress: segmentProgress(index, 0.92)
        // segments/segmentDetails intentionally NOT sent to the client here —
        // per-clip URLs are an implementation detail; only the finished
        // 45-second master is ever shown.
      });

      const fileName = await downloadClip(workDir, videoUrl, index);
      segmentFiles.push(fileName);

      // Check 2 — automated continuity verification. Compares this clip's
      // actual first frame against the handoff frame that was sent to Fal as
      // its reference, via SSIM. Diagnostic only (logged, not shown, never
      // blocks the job) — a deliberate camera move can legitimately score low
      // without the cut actually being broken.
      if (index > 0 && previousHandoffFramePath) {
        const firstFramePath = await extractFirstFrame(fileName, `first-${index + 1}.jpg`, workDir);
        if (firstFramePath) {
          const score = await compareContinuity(previousHandoffFramePath, firstFramePath, workDir);
          if (score !== null) {
            continuityScores.push({ boundary: `${index}->${index + 1}`, ssim: score });
            console.log(`[video job ${jobId}] continuity ${index}->${index + 1}: SSIM ${score.toFixed(3)}`);
            if (score < 0.35) {
              diagnostics.push(`low continuity score (${score.toFixed(2)}) between segments ${index} and ${index + 1}`);
            }
          }
        }
      }

      // ── Continuity handoff for the next clip ───────────────────────────
      if (index < SEGMENT_COUNT - 1) {
        continuityImageUrl = null;
        const framePath = await extractLastFrame(fileName, `handoff-${index + 1}.jpg`, workDir);

        if (framePath) {
          previousHandoffFramePath = framePath;
          const frameBuffer = await fs.readFile(framePath);
          const hosted = await uploadToFalStorage(frameBuffer, `handoff-${index + 1}.jpg`, "image/jpeg");
          if (hosted) {
            continuityImageUrl = hosted;
          } else {
            diagnostics.push(`could not upload handoff frame after segment ${index + 1}`);
          }
        } else {
          diagnostics.push(`could not extract handoff frame after segment ${index + 1}`);
        }
      }
    }

    // ── Stitch ────────────────────────────────────────────────────────────
    updateJob(jobId, {
      status: "stitching",
      stage: "stitching",
      message: PUBLIC_MESSAGE.stitching,
      progress: 88
    });

    const stitched = await stitchLocalClips(workDir, segmentFiles, () => {
      updateJob(jobId, { message: PUBLIC_MESSAGE.stitching, progress: 92 });
    });

    registerVideoFile(stitched.key, stitched.filePath);

    // stitchLocalClips already hard-verified the duration is within 45s ±
    // tolerance (throws otherwise) — this is a redundant, explicit re-check
    // right before marking the job complete, so "completed" can never be
    // reported for a file that doesn't meet the requirement.
    const durationOk = Math.abs(stitched.durationSeconds - TOTAL_SECONDS) <= 0.1;
    if (!durationOk) {
      throw new Error(`Final duration check failed: ${stitched.durationSeconds}s (expected ${TOTAL_SECONDS}s).`);
    }

    if (diagnostics.length > 0) console.log(`[video job ${jobId}] diagnostics:`, diagnostics);
    if (continuityScores.length > 0) console.log(`[video job ${jobId}] continuity scores:`, continuityScores);
    if (stitched.warnings?.length > 0) console.log(`[video job ${jobId}] stitch notes:`, stitched.warnings);

    updateJob(jobId, {
      status: "completed",
      stage: "completed",
      message: PUBLIC_MESSAGE.completed,
      progress: 100,
      videoUrl: stitched.url,
      videoKey: stitched.key,
      durationSeconds: stitched.durationSeconds,
      completedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[video job ${jobId}] failed:`, error);
    updateJob(jobId, {
      status: "failed",
      stage: "failed",
      message: PUBLIC_MESSAGE.failed,
      error: sanitizeErrorForUser(error?.message),
      failedAt: new Date().toISOString()
    });
    // Deliberately NOT re-thrown. The old code re-threw from a fire-and-forget
    // callback, which surfaces as an unhandled rejection and can take the dev
    // server down mid-render.
  } finally {
    if (workDir) await cleanupWorkDir(workDir);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET — job status, or the finished file
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const key = url.searchParams.get("key");

  if (jobId) {
    const job = getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { error: "Job not found. It may have expired, or the server restarted while it was running." },
        { status: 404 }
      );
    }
    // Explicit allowlist rather than strip-the-bad-fields: the product
    // requirement is that generation looks like one continuous process, so
    // nothing that names clips, segments, Fal, or ffmpeg may reach the
    // client even if a future change adds such a field to the job object.
    const publicJob = {
      jobId: job.jobId,
      status: job.status,
      message: job.message,
      progress: job.progress,
      totalSeconds: job.totalSeconds,
      videoUrl: job.videoUrl,
      durationSeconds: job.durationSeconds,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      failedAt: job.failedAt
    };
    return NextResponse.json(publicJob);
  }

  if (!key) {
    return NextResponse.json({ error: "Provide either a jobId or a video key." }, { status: 400 });
  }

  const filePath = getVideoFile(key);
  if (!filePath) {
    return NextResponse.json({ error: "Video not found or expired." }, { status: 404 });
  }

  try {
    const stat = await fs.stat(filePath);
    const range = request.headers.get("range");

    // <video> scrubbing needs byte-range support; without it the browser can
    // only play straight through and seeking silently fails.
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : stat.size - 1;

      if (Number.isNaN(start) || Number.isNaN(end) || start >= stat.size || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` }
        });
      }

      const handle = await fs.open(filePath, "r");
      try {
        const length = end - start + 1;
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, start);
        return new NextResponse(buffer, {
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(length),
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store"
          }
        });
      } finally {
        await handle.close();
      }
    }

    const file = await fs.readFile(filePath);
    return new NextResponse(file, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(file.length),
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="scenica-45s-${key}.mp4"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Video could not be served." }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST — start a job and return immediately
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON." }, { status: 400 });
  }

  const {
    result,
    model: requestedModel,
    generationMode = "test",
    referenceImages = [],
    resolution = "720p",
    aspectRatio = "16:9",
    generateAudio = true
  } = body || {};

  const scenes = Array.isArray(result?.scenes) ? result.scenes : [];
  const characters = Array.isArray(result?.characters) ? result.characters : [];

  if (scenes.length === 0) {
    return NextResponse.json(
      { error: "No scenes were supplied. Generate a script first, then return to the video stage." },
      { status: 400 }
    );
  }

  const model = isSupportedModel(requestedModel) ? requestedModel : getVideoModel(generationMode);

  // Preflight the two things that are cheap to check and expensive to discover
  // three minutes into a render.
  try {
    getFalKey();
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    assertFfmpegAvailable();
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cleanReferences = (Array.isArray(referenceImages) ? referenceImages : [])
    .filter((ref) => ref && typeof ref.url === "string" && /^https?:\/\//.test(ref.url))
    .slice(0, 8)
    .map((ref, i) => ({ index: i + 1, name: ref.name || `Character ${i + 1}`, url: ref.url }));

  const jobId = `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Everything here is either needed to run the job (model, resolution, scene
  // data passed separately below) or is stripped before the GET handler
  // returns it to the client — see the publicJob allowlist in GET. Nothing
  // about the 3-clip/ffmpeg pipeline is ever meant to reach the response.
  createJob(jobId, {
    model,
    generationMode,
    resolution,
    aspectRatio,
    totalSeconds: TOTAL_SECONDS,
    referenceCount: cleanReferences.length,
    message: PUBLIC_MESSAGE.queued
  });

  // Fire and forget. The handler returns while this keeps running in the Node
  // process — that is the entire point of the queued design. `.catch` is a
  // backstop; runVideoGenerationJob already swallows its own errors into job
  // state.
  runVideoGenerationJob(jobId, {
    model,
    scenes,
    characters,
    referenceImages: cleanReferences,
    resolution,
    aspectRatio,
    generateAudio: generateAudio !== false
  }).catch((error) => console.error(`[video job ${jobId}] unexpected:`, error));

  return NextResponse.json(
    {
      success: true,
      jobId,
      status: "queued",
      totalSeconds: TOTAL_SECONDS,
      pollUrl: `/api/video?jobId=${jobId}`,
      message: PUBLIC_MESSAGE.queued
    },
    { status: 202 }
  );
}
