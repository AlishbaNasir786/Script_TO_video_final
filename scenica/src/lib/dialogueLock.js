// ═══════════════════════════════════════════════════════════════════════════
// dialogueLock.js
//
// Purpose: make the dialogue shown on the CHARACTERS page (page 2) the single
// source of truth, and guarantee the SCRIPT page (page 3) shows the exact same
// words — not a paraphrase.
//
// Also attaches the timing + segment data the VIDEO stage needs for a fixed
// 45-second output rendered as 30s + 15s Seedance generations.
//
// This file is purely additive. It does not modify any existing behaviour
// unless you call these functions from /api/generate/route.js.
// ═══════════════════════════════════════════════════════════════════════════

const WORDS_PER_SECOND = 2.5;   // natural on-camera delivery rate
const TOTAL_SECONDS    = 45;
const SEGMENT_A_END    = 30;    // Seedance generates 30s natively; cut goes here

// ── helpers ────────────────────────────────────────────────────────────────

function normalise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[""'']/g, "'")
    .replace(/[.,!?;:]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function overlapScore(a, b) {
  const setA = new Set(normalise(a).split(" ").filter(w => w.length > 2));
  const setB = new Set(normalise(b).split(" ").filter(w => w.length > 2));
  if (!setA.size || !setB.size) return 0;
  let hits = 0;
  for (const w of setA) if (setB.has(w)) hits++;
  return hits / Math.max(setA.size, setB.size);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. lockDialogueToCanonical
//
// THE CORE FIX.
//
// The existing applyDialogueMap() corrects the SPEAKER of a scene's dialogue
// line but leaves the TEXT exactly as Claude's screenplay pass wrote it. Since
// the screenplay pass is a second, independent generation, its wording drifts
// from the canonical quotes on page 2 — different punctuation, contractions,
// dropped or added words.
//
// This function goes further: when a scene line matches a canonical quote, it
// REPLACES the scene text with the canonical text. Page 2 and page 3 then read
// identically, character for character.
//
// Anything that cannot be matched is flagged rather than silently kept, so you
// can see mismatches in the API response instead of discovering them in the
// finished video.
// ═══════════════════════════════════════════════════════════════════════════

export function lockDialogueToCanonical(scenes, canonicalDialogue) {
  if (!Array.isArray(scenes) || !Array.isArray(canonicalDialogue) || canonicalDialogue.length === 0) {
    return { scenes, unmatched: [], replacedCount: 0 };
  }

  // Each canonical quote may only be consumed once.
  const pool = canonicalDialogue.map((d, i) => ({
    index: i,
    speaker: String(d.speaker || "").trim().toUpperCase(),
    quote: String(d.quote || "").trim(),
    used: false
  }));

  const unmatched = [];
  let replacedCount = 0;

  const claim = (sceneText, sceneSpeaker) => {
    const target = normalise(sceneText);
    const speaker = String(sceneSpeaker || "").trim().toUpperCase();

    // Pass 1 — exact normalised match, same speaker
    let hit = pool.find(p => !p.used && p.speaker === speaker && normalise(p.quote) === target);
    if (hit) return hit;

    // Pass 2 — exact normalised match, any speaker (speaker gets corrected)
    hit = pool.find(p => !p.used && normalise(p.quote) === target);
    if (hit) return hit;

    // Pass 3 — strong fuzzy match, same speaker. Threshold deliberately high:
    // a loose threshold is what let paraphrases through before.
    let best = null;
    let bestScore = 0;
    for (const p of pool) {
      if (p.used || p.speaker !== speaker) continue;
      const score = overlapScore(p.quote, sceneText);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best && bestScore >= 0.75) return best;

    return null;
  };

  const lockedScenes = scenes.map(scene => ({
    ...scene,
    dialogue: (scene.dialogue || []).map(line => {
      if (!line || !line.text) return line;

      const hit = claim(line.text, line.character);
      if (!hit) {
        unmatched.push({ speaker: line.character, text: line.text });
        return { ...line, canonical: false };
      }

      hit.used = true;
      const changed = hit.quote !== line.text;
      if (changed) replacedCount++;

      return {
        ...line,
        character: hit.speaker,   // canonical speaker
        text: hit.quote,          // canonical WORDS — this is the fix
        canonical: true
      };
    })
  }));

  return { scenes: lockedScenes, unmatched, replacedCount };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. attachTiming
//
// Gives every scene a start/end second and a segment label.
//
// Speaking time comes from word count. Whatever is left of the 45 seconds is
// distributed across scenes as action/breathing room, so the total always
// lands on exactly 45.
//
// segment: "A" = 0-30s  (first Seedance generation)
//          "B" = 30-45s (second generation, stitched with FFmpeg)
// ═══════════════════════════════════════════════════════════════════════════

export function attachTiming(scenes) {
  if (!Array.isArray(scenes) || scenes.length === 0) return { scenes, totalSpokenWords: 0 };

  const spokenPerScene = scenes.map(sc =>
    (sc.dialogue || []).reduce((sum, d) => sum + wordCount(d.text), 0)
  );

  const totalSpokenWords = spokenPerScene.reduce((a, b) => a + b, 0);
  const totalSpeakingSecs = totalSpokenWords / WORDS_PER_SECOND;
  const actionBudget = Math.max(0, TOTAL_SECONDS - totalSpeakingSecs);
  const actionPerScene = actionBudget / scenes.length;

  let cursor = 0;
  const timed = scenes.map((sc, i) => {
    const speaking = spokenPerScene[i] / WORDS_PER_SECOND;
    const duration = speaking + actionPerScene;
    const start = cursor;
    let end = i === scenes.length - 1 ? TOTAL_SECONDS : cursor + duration;
    cursor = end;

    return {
      ...sc,
      startSecond: Math.round(start * 10) / 10,
      endSecond: Math.round(end * 10) / 10,
      durationSeconds: Math.round((end - start) * 10) / 10,
      spokenWords: spokenPerScene[i],
      segment: start < SEGMENT_A_END ? "A" : "B"
    };
  });

  return { scenes: timed, totalSpokenWords };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. validateFortyFive
//
// Returns warnings rather than throwing, so a script is never blocked — but
// problems surface in the API response where you can act on them.
//
// The seam checks matter specifically for the video stage: if a dialogue line
// straddles the 30-second mark, the character's voice will audibly change
// mid-sentence at the stitch, and no amount of post-processing fixes that.
// ═══════════════════════════════════════════════════════════════════════════

export function validateFortyFive(scenes, totalSpokenWords, unmatched) {
  const warnings = [];

  if (totalSpokenWords < 85) {
    warnings.push(`Dialogue is short: ${totalSpokenWords} words (~${(totalSpokenWords / WORDS_PER_SECOND).toFixed(1)}s). Target 85-95 for 45s.`);
  }
  if (totalSpokenWords > 95) {
    warnings.push(`Dialogue is long: ${totalSpokenWords} words (~${(totalSpokenWords / WORDS_PER_SECOND).toFixed(1)}s). Target 85-95 for 45s.`);
  }

  if (unmatched && unmatched.length > 0) {
    warnings.push(`${unmatched.length} script line(s) do not match any character-page dialogue. Page 2 and page 3 will disagree on these.`);
  }

  // Does any scene straddle the 30s cut?
  const straddling = (scenes || []).filter(
    sc => sc.startSecond < SEGMENT_A_END && sc.endSecond > SEGMENT_A_END
  );
  if (straddling.length > 0) {
    warnings.push(`Scene ${straddling.map(s => s.id).join(", ")} crosses the 30s stitch point. Voice will change mid-scene. Restructure so a scene boundary lands on 30s.`);
  }

  const segmentA = (scenes || []).filter(s => s.segment === "A");
  const segmentB = (scenes || []).filter(s => s.segment === "B");
  if (segmentB.length === 0) {
    warnings.push("All scenes fall in segment A. Nothing to render in the second 15s generation.");
  }

  return {
    warnings,
    segmentA: segmentA.map(s => s.id),
    segmentB: segmentB.map(s => s.id),
    totalSpokenWords,
    estimatedSpeakingSeconds: Math.round((totalSpokenWords / WORDS_PER_SECOND) * 10) / 10
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. runDialogueLock — convenience wrapper. Call this one from route.js.
// ═══════════════════════════════════════════════════════════════════════════

export function runDialogueLock(scenes, canonicalDialogue) {
  const locked = lockDialogueToCanonical(scenes, canonicalDialogue);
  const timed = attachTiming(locked.scenes);
  const report = validateFortyFive(timed.scenes, timed.totalSpokenWords, locked.unmatched);

  return {
    scenes: timed.scenes,
    timingReport: {
      ...report,
      canonicalReplacements: locked.replacedCount,
      unmatchedLines: locked.unmatched
    }
  };
}