// ═══════════════════════════════════════════════════════════════════════════
// videoPlan.js — the 3 x 15s generation plan for a fixed 45-second film
//
// THE ARCHITECTURAL RULE (verified against Fal's published schema):
//   Seedance 2.0 accepts `duration` of "auto" or 4-15 SECONDS. Fifteen seconds
//   is the hard ceiling. A single 45-second request is therefore not merely
//   slow or expensive — it is rejected by the model. That is why the earlier
//   "one long request" implementation failed, and why the only correct shape
//   is three 15-second clips stitched into one 45-second master.
//
//   Seedance 2.5 does allow up to 30s, but 30 < 45, so the 3 x 15 structure
//   still holds for every supported tier. Never special-case a single call.
//
// Model tiers (endpoint ids confirmed from fal.ai model API pages):
//   bytedance/seedance-2.0/fast/reference-to-video  — cheapest, for testing
//   bytedance/seedance-2.0/reference-to-video       — standard
//   bytedance/seedance-2.5/reference-to-video       — final quality
//
// All three take the same input shape: `prompt`, `image_urls` (referenced in
// the prompt as @Image1, @Image2, ...), `duration`, `resolution`,
// `aspect_ratio`. NOTE: there is no `num_frames`, `width` or `height` — the
// old code sent those and Fal rejects unknown fields with a 422.
// ═══════════════════════════════════════════════════════════════════════════

export const SEGMENT_DURATION = 15;
export const TOTAL_SECONDS = 45;
export const SEGMENT_COUNT = 3;
export const SEGMENT_A_END = 15;
export const SEGMENT_B_END = 30;
export const SEGMENT_C_END = 45;

export const SEGMENT_WINDOWS = [
  { key: "A", index: 0, start: 0, end: 15, label: "0:00–0:15" },
  { key: "B", index: 1, start: 15, end: 30, label: "0:15–0:30" },
  { key: "C", index: 2, start: 30, end: 45, label: "0:30–0:45" }
];

export const MODEL_TIERS = [
  {
    id: "bytedance/seedance-2.0/fast/reference-to-video",
    mode: "test",
    label: "Test — Seedance 2.0 Fast",
    description: "Cheapest pass. Use this to validate the 3 x 15s flow before spending on the final render.",
    maxResolution: "720p"
  },
  {
    id: "bytedance/seedance-2.0/reference-to-video",
    mode: "standard",
    label: "Standard — Seedance 2.0",
    description: "Full Seedance 2.0 quality at 15s per clip.",
    maxResolution: "1080p"
  },
  {
    id: "bytedance/seedance-2.5/reference-to-video",
    mode: "production",
    label: "Final — Seedance 2.5",
    description: "Highest fidelity and strongest identity retention. Use for the deliverable.",
    maxResolution: "1080p"
  }
];

export const DEV_MODEL = MODEL_TIERS[0].id;
export const PROD_MODEL = MODEL_TIERS[2].id;

export function getVideoModel(mode = "test") {
  const tier = MODEL_TIERS.find((entry) => entry.mode === mode || entry.id === mode);
  return (tier || MODEL_TIERS[0]).id;
}

export function isSupportedModel(modelId) {
  return MODEL_TIERS.some((tier) => tier.id === modelId);
}

// ── small helpers ──────────────────────────────────────────────────────────

function safeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normaliseName(value) {
  return safeText(value);
}

function meaningful(value) {
  const text = safeText(value);
  if (!text) return "";
  if (/^(unspecified|unknown|n\/a|none)$/i.test(text)) return "";
  // The extraction pass marks guesses with an "(Inferred) " prefix; that is
  // useful on the characters page but is noise inside a generation prompt.
  return text.replace(/^\(inferred\)\s*/i, "");
}

// ═══════════════════════════════════════════════════════════════════════════
// Scene → segment assignment
//
// Prefers the timing that dialogueLock already attached (scene.segment, or
// startSecond). Falls back to an even split so the plan still works for
// scripts produced by the fallback path, which carry no timing at all.
// ═══════════════════════════════════════════════════════════════════════════

export function assignScenesToSegments(scenes = []) {
  const list = Array.isArray(scenes) ? scenes.filter(Boolean) : [];
  const buckets = [[], [], []];
  // Internal diagnostics only — never rendered to the end user. The product
  // requirement is that generation itself is invisible; these are for logs.
  const diagnostics = [];

  if (list.length === 0) return { buckets, diagnostics, segmentPhases: [null, null, null] };

  const hasTiming = list.some(
    (scene) => scene.segment === "A" || scene.segment === "B" || scene.segment === "C" || Number.isFinite(Number(scene.startSecond))
  );

  if (!hasTiming) {
    diagnostics.push("scenes carried no timing data — split evenly across the three segments");
    list.forEach((scene, i) => {
      const bucket = Math.min(2, Math.floor((i * SEGMENT_COUNT) / list.length));
      buckets[bucket].push(scene);
    });
  } else {
    list.forEach((scene) => {
      const start = Number(scene.startSecond ?? 0);
      const end = Number(scene.endSecond ?? start);

      let index;
      if (scene.segment === "A") index = 0;
      else if (scene.segment === "B") index = 1;
      else if (scene.segment === "C") index = 2;
      else if (start < SEGMENT_A_END) index = 0;
      else if (start < SEGMENT_B_END) index = 1;
      else index = 2;

      if (start < SEGMENT_A_END && end > SEGMENT_A_END) {
        diagnostics.push(`scene ${scene.id ?? "?"} crosses the 0:15 stitch point`);
      } else if (start < SEGMENT_B_END && end > SEGMENT_B_END) {
        diagnostics.push(`scene ${scene.id ?? "?"} crosses the 0:30 stitch point`);
      }

      buckets[index].push(scene);
    });
  }

  // An empty segment would produce 15 seconds of unanchored invention. Borrow
  // the nearest neighbouring scene so every clip has real story content. This
  // is unconditional (both timing paths run it) because a short script — as
  // few as one scene — must still fill the full 45 seconds: the product
  // requirement is a fixed-length film regardless of how little the script
  // gives it to work with.
  for (let index = 0; index < SEGMENT_COUNT; index += 1) {
    if (buckets[index].length > 0) continue;
    const donor = buckets[index - 1]?.at(-1) || buckets[index + 1]?.[0] || list[Math.min(index, list.length - 1)];
    if (donor) {
      buckets[index].push(donor);
      diagnostics.push(`segment ${SEGMENT_WINDOWS[index].key} had no scene of its own — continued the adjacent beat`);
    }
  }

  // THE FIX for identical-looking segments: when a short script forces the
  // same scene into two or more segments (the borrow above, or an
  // even-split that lands the same scene more than once), each of those
  // segments described that scene identically — same action text, same
  // dialogue, same fallback sentences — which is why segments B and C could
  // render as visual duplicates on a short script. Track every segment that
  // shares a scene with another segment and its position in that shared
  // sequence, so the prompt builder can instruct the model to advance the
  // action forward each time instead of restating the same moment.
  const sceneKey = (scene) => (scene && scene.id !== undefined ? `id:${scene.id}` : scene);
  const segmentsByScene = new Map();
  buckets.forEach((bucket, index) => {
    bucket.forEach((scene) => {
      const key = sceneKey(scene);
      if (!segmentsByScene.has(key)) segmentsByScene.set(key, []);
      segmentsByScene.get(key).push(index);
    });
  });

  const segmentPhases = [null, null, null];
  segmentsByScene.forEach((segIndexes) => {
    const ordered = [...new Set(segIndexes)].sort((a, b) => a - b);
    if (ordered.length < 2) return;
    ordered.forEach((segIndex, phasePos) => {
      segmentPhases[segIndex] = { phaseIndex: phasePos + 1, phaseTotal: ordered.length };
    });
  });

  return { buckets, diagnostics, segmentPhases };
}

/**
 * Verify every scene the script produced actually made it into the plan
 * somewhere. Structurally this should always be true — every scene is either
 * bucketed directly or used as a donor — but this is a cheap, real assertion
 * against silent drift rather than trusting that by construction.
 */
export function verifyScriptCoverage(scenes = [], buckets = [[], [], []]) {
  const scriptIds = new Set(
    (scenes || []).map((scene, i) => (scene?.id !== undefined ? scene.id : `#${i}`))
  );
  const coveredIds = new Set();
  buckets.forEach((bucket) => {
    (bucket || []).forEach((scene, i) => {
      coveredIds.add(scene?.id !== undefined ? scene.id : `#${i}`);
    });
  });

  const missing = [...scriptIds].filter((id) => !coveredIds.has(id));
  return { complete: missing.length === 0, missingSceneIds: missing };
}

// ═══════════════════════════════════════════════════════════════════════════
// The cast bible
//
// This exact block is embedded verbatim in ALL THREE prompts. Identical
// wording across segments is what stops costume/face drift — if each clip
// described the cast in its own words, each clip would render its own
// interpretation of them.
// ═══════════════════════════════════════════════════════════════════════════

export function buildCastBible(characters = [], referenceImages = []) {
  const cast = (characters || []).filter((character) => normaliseName(character?.name));
  if (cast.length === 0) {
    return {
      castNames: [],
      bible: "CAST: a single consistent protagonist. The same person must appear in every shot.",
      referenceLines: ""
    };
  }

  const refByName = new Map();
  (referenceImages || []).forEach((ref) => {
    if (ref?.name) refByName.set(normaliseName(ref.name).toUpperCase(), ref);
  });

  const lines = cast.map((character) => {
    const name = normaliseName(character.name);
    const ref = refByName.get(name.toUpperCase());
    const tag = ref ? `@Image${ref.index} is ${name}. ` : "";

    const bits = [
      meaningful(character.gender) && meaningful(character.gender) !== "Unspecified" ? meaningful(character.gender) : "",
      meaningful(character.age) ? `age ${meaningful(character.age)}` : "",
      meaningful(character.appearance),
      meaningful(character.clothing) ? `wearing ${meaningful(character.clothing)}` : ""
    ].filter(Boolean);

    return `${tag}${name}: ${bits.join(", ") || "consistent, camera-ready appearance"}. ${name} wears these exact garments in every second of the film and never changes clothes.`;
  });

  const castNames = cast.map((character) => normaliseName(character.name));

  return {
    castNames,
    bible: [
      `LOCKED CAST — exactly ${cast.length} character${cast.length === 1 ? "" : "s"} appear${cast.length === 1 ? "s" : ""} in this film: ${castNames.join(", ")}.`,
      ...lines
    ].join(" "),
    referenceLines: (referenceImages || [])
      .map((ref) => `@Image${ref.index} = ${ref.name}`)
      .join(", ")
  };
}

// The negative constraints are the same in every segment, for the same reason
// the cast bible is: consistency of instruction produces consistency of output.
const CONTINUITY_RULES = [
  "CONTINUITY LOCK — this clip is one part of a single continuous film, not a standalone video.",
  "Keep the same cast, the same faces, the same hair, the same body shapes and heights, and the same exact costumes as the reference images and the previous clip.",
  "Keep the same location, the same set dressing, the same time of day, the same weather, the same colour grade and the same lighting direction.",
  "Keep the same camera language: same lens character, same film stock, same grain, same framing discipline.",
  "DO NOT add any person who is not in the locked cast list. No extra adults, no extra children, no background crowds, no passers-by, no duplicates of a cast member in the same frame.",
  "DO NOT change anyone's clothing, hairstyle, age or ethnicity at any point. No costume changes, no wardrobe drift, no character morphing between shots.",
  "DO NOT reset the scene, cut to a different location, or restart the story. This clip continues the same unbroken take."
].join(" ");

// Any prop that resembles printed media — a poster, sign, book cover, screen,
// or package — is the single biggest trigger for Fal's post-render copyright
// classifier, because that category overlaps heavily with real trademarked
// artwork even when the prompt is entirely original (e.g. "a bunny holding a
// poster" was blocked purely because the rendered poster read as printed
// media, not because anything in the story referenced real IP). This clause
// is included in every prompt to keep the baseline trigger rate low.
const CONTENT_SAFETY_RULE =
  "Any poster, sign, paper, book, package, screen or similar printed/branded object visible in the shot must show only plain colour, abstract texture, or non-readable marks — no readable words, letters, numbers, logos, brand marks, or recognisable artwork. Do not depict any existing real-world movie, show, game, or brand design.";

// Used only for a same-segment retry after a content_policy_violation. Fal's
// classifier runs on the rendered pixels, not the prompt, so a plain retry
// with a new seed already has a real chance of passing — this strengthens
// that chance further without touching the user's actual story content.
// Deliberately does NOT name "poster", "movie", "album cover" etc. — naming a
// category to say "avoid this" still primes the model toward it (confirmed:
// an earlier version of this clause that said "don't render a movie poster"
// still got blocked). Paired with neutralizeContentRisk already having
// removed the trigger word from the scene description itself, this clause
// stays purely descriptive of the desired end state.
const CONTENT_SAFETY_RULE_STRICT =
  "CRITICAL SAFETY OVERRIDE — the previous render of this exact clip was blocked by automated content review. Any flat object the character is holding, wearing, or standing near must render as a completely plain, solid-colour, blank surface — no text, no numbers, no symbols, no pictures, no printed or displayed design of any kind on it. Everything else about the scene stays as described.";

// A retry that keeps the word "poster" in the scene description while ALSO
// instructing "but render it blank" is a contradictory signal — confirmed in
// practice to still get blocked a second time. The stronger fix is to remove
// the trigger word from the description itself for the retry attempt, not
// just add a counter-instruction on top of it. Applied only on retry; the
// user's actual story data is never modified, only the text sent to Fal for
// that one attempt.
const CONTENT_RISK_SUBSTITUTIONS = [
  [/\bposters?\b/gi, "board"],
  [/\bbillboards?\b/gi, "board"],
  [/\bbanners?\b/gi, "cloth"],
  [/\bflyers?\b/gi, "paper"],
  [/\bpamphlets?\b/gi, "paper"],
  [/\bnewspapers?\b/gi, "paper"],
  [/\bmagazines?\b/gi, "booklet"],
  [/\b(?:tv |television )?screens?\b/gi, "panel"],
  [/\bmonitors?\b/gi, "panel"],
  [/\bpackages?\b/gi, "box"],
  [/\blabels?\b/gi, "tag"],
  [/\balbum covers?\b/gi, "case"],
  [/\bbook covers?\b/gi, "cover"],
  [/\blogos?\b/gi, "mark"]
];

function neutralizeContentRisk(text) {
  let result = String(text || "");
  for (const [pattern, replacement] of CONTENT_RISK_SUBSTITUTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-segment prompt
// ═══════════════════════════════════════════════════════════════════════════

function describeScenes(scenes = [], sanitize = false) {
  return scenes
    .map((scene) => {
      const heading = safeText(scene?.heading || scene?.location);
      const rawAction = safeText(scene?.action);
      const action = sanitize ? neutralizeContentRisk(rawAction) : rawAction;
      const dialogue = (scene?.dialogue || [])
        .map((line) => {
          const who = normaliseName(line?.character);
          const rawText = safeText(line?.text);
          const text = sanitize ? neutralizeContentRisk(rawText) : rawText;
          if (!text) return "";
          return who ? `${who} says: "${text}"` : `"${text}"`;
        })
        .filter(Boolean)
        .join(" ");

      return [heading, action, dialogue].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join(" Then, ");
}

/**
 * Build the prompt for one 15-second segment.
 *
 * The handoff sentences are the important part. Segment B is told exactly how
 * segment A ended; segment C is told exactly how B ended. Without that, three
 * clips generated from three independent prompts read as three unrelated
 * videos even when the cast description is identical.
 */
export function buildSegmentPrompt({
  segmentIndex,
  scenes = [],
  previousScenes = [],
  nextScenes = [],
  castBible,
  hasContinuityFrame = false,
  continuityImageIndex = null,
  contentSafetyRetry = false,
  phase = null
}) {
  const window = SEGMENT_WINDOWS[segmentIndex];
  const beat = describeScenes(scenes, contentSafetyRetry) || "The story continues without interruption in the same location with the same cast.";

  const parts = [];

  parts.push(
    `SEGMENT ${window.key} — seconds ${window.start} to ${window.end} of a single continuous 45-second film, generated as clip ${segmentIndex + 1} of 3.`
  );

  parts.push(castBible.bible);
  if (castBible.referenceLines) {
    parts.push(`Reference images: ${castBible.referenceLines}. Match these faces and outfits exactly.`);
  }

  // Handoff INTO this segment.
  if (segmentIndex === 0) {
    parts.push(
      "This is the opening clip. Establish the location, the cast and the lighting cleanly — everything you establish here is locked for the remaining 30 seconds of the film."
    );
  } else {
    const previousBeat = describeScenes(previousScenes, contentSafetyRetry);
    parts.push(
      `HANDOFF IN: the previous clip ended with — ${previousBeat || "the same cast mid-action in this same location"}. Begin this clip at that exact moment, with the characters in the same positions, the same costumes and the same lighting. Do not re-establish or re-introduce anything; continue the take as if no cut occurred.`
    );
    if (hasContinuityFrame && continuityImageIndex) {
      parts.push(
        `@Image${continuityImageIndex} is the literal final frame of the previous clip. Start this clip from that frame: identical faces, identical clothing, identical set, identical light. Treat it as frame zero.`
      );
    }
  }

  parts.push(`ACTION IN THIS CLIP: ${beat}`);

  // The actual fix for duplicate-looking segments: when the script is too
  // short to give every segment its own beat, the SAME scene text above is
  // reused across multiple segments. Without this, those segments render as
  // near-identical clips because there is nothing telling the model that
  // time has moved on. This makes the 45-second requirement independent of
  // script length — a one-line story still produces three visually distinct,
  // forward-progressing 15-second windows instead of one clip played three
  // times.
  if (phase && phase.phaseTotal > 1) {
    const positionWord =
      phase.phaseIndex === 1 ? "the FIRST" : phase.phaseIndex === phase.phaseTotal ? "the FINAL" : "a LATER";
    parts.push(
      `TIME PROGRESSION — IMPORTANT: the story above is not long enough to fill 45 seconds on its own, so this one beat is being stretched across ${phase.phaseTotal} consecutive clips to reach the full runtime. This is ${positionWord} of those ${phase.phaseTotal} parts (part ${phase.phaseIndex} of ${phase.phaseTotal}). Do NOT show the same moment as the other part(s) — this must look like real time has passed since. Visibly advance the physical action, change body position and gesture, shift the framing or camera angle, and move the beat noticeably closer to its natural conclusion. Two consecutive parts must never look like the same instant repeated.`
    );
  }

  // Handoff OUT of this segment.
  if (segmentIndex < SEGMENT_COUNT - 1) {
    const nextBeat = describeScenes(nextScenes, contentSafetyRetry);
    parts.push(
      `HANDOFF OUT: end this clip on a stable, continuing moment that leads directly into — ${nextBeat || "the next beat of the same scene"}. Do not fade out, do not cut to black, do not resolve the scene; the film continues immediately after this clip.`
    );
  } else {
    parts.push(
      "This is the final clip. Bring the story to its resolution and settle on a clean, composed closing image. Still no new characters and no costume changes."
    );
  }

  parts.push(CONTINUITY_RULES);
  parts.push(contentSafetyRetry ? CONTENT_SAFETY_RULE_STRICT : CONTENT_SAFETY_RULE);
  parts.push(`Exactly ${SEGMENT_DURATION} seconds long. Cinematic, filmic, single continuous take.`);

  return parts.filter(Boolean).join(" ");
}

/**
 * Build the complete 3 x 15s plan. This is what the /video page renders and
 * what it POSTs to /api/video.
 */
export function buildVideoGenerationPlan(scenes = [], characters = [], options = {}) {
  const { referenceImages = [] } = options;
  const { buckets, diagnostics, segmentPhases } = assignScenesToSegments(scenes);
  const castBible = buildCastBible(characters, referenceImages);

  const segments = SEGMENT_WINDOWS.map((window, index) => ({
    key: window.key,
    index,
    startSecond: window.start,
    endSecond: window.end,
    label: window.label,
    durationSeconds: SEGMENT_DURATION,
    scenes: buckets[index],
    sceneIds: buckets[index].map((scene) => scene?.id).filter((id) => id !== undefined),
    prompt: buildSegmentPrompt({
      segmentIndex: index,
      scenes: buckets[index],
      previousScenes: buckets[index - 1] || [],
      nextScenes: buckets[index + 1] || [],
      castBible,
      phase: segmentPhases[index]
    })
  }));

  return {
    totalSeconds: TOTAL_SECONDS,
    segmentDuration: SEGMENT_DURATION,
    segmentCount: SEGMENT_COUNT,
    castNames: castBible.castNames,
    castBible: castBible.bible,
    // Internal only — the UI must not surface generation-pipeline detail to
    // the end user (the product requirement is that this looks like one
    // continuous film). Kept on the object for logs/debugging.
    diagnostics,
    segments
  };
}

/**
 * Character portraits, in a stable order, as the @ImageN reference list.
 * Fal's reference-to-video takes plain URL strings in `image_urls`.
 */
export function getReferenceImageUrls(characters = []) {
  return (characters || [])
    .map((character) => ({
      name: normaliseName(character?.name || ""),
      url: safeText(character?.imageUrl || character?.portraitUrl || character?.image || "")
    }))
    .filter((entry) => Boolean(entry.url))
    .slice(0, 8) // Seedance 2.0 allows up to 9; one slot is reserved for the continuity frame.
    .map((entry, i) => ({ ...entry, index: i + 1, name: entry.name || `Character ${i + 1}` }));
}
