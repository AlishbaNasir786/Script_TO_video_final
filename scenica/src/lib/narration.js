// ═══════════════════════════════════════════════════════════════════════════
// narration.js — the finished film's entire dialogue track, plus the
// subtitles that match it frame-for-frame.
//
// WHY THIS EXISTS (the three bugs it removes):
//   1. Seedance generates its own audio independently per 15s clip, with no
//      seed or voice-ID parameter, so a character's voice drifted between
//      clips. Here every character gets ONE fixed ElevenLabs voice.
//   2. A scene reused across segments (videoPlan's donor backfill) had its
//      dialogue rendered twice. attachLineTiming() walks the CANONICAL scene
//      list once, so a line physically cannot appear twice.
//   3. Placement used word-count ESTIMATES, so real speech drifted out of
//      sync and the last line could be cut mid-word at the 45s boundary.
//      Pacing is now driven by the MEASURED duration of the real audio.
//
// PACING MODEL (requirement: "pace adjusted according to the script"):
//   Every line is synthesized and measured first. The leftover time inside
//   the fixed 45s is then distributed as breathing room — a lead-in, a gap
//   after each line (a scene change gets a longer beat than a line break
//   inside one scene), and a tail-out. If the script over-runs, gaps shrink
//   first, then delivery is sped up very slightly (capped at 1.18x, which
//   is imperceptible) — a line is never cut mid-word except in an extreme
//   edge case, which is reported as a diagnostic.
// ═══════════════════════════════════════════════════════════════════════════

import { promises as fs } from "fs";
import path from "path";
import { runFfmpeg, probeMedia } from "./videoStitch.js";
import { pickVoiceId, synthesizeSpeech } from "./elevenLabs.js";

const TARGET_SECONDS = 45;
const MIN_LINE_SECONDS = 0.3;

// Pacing budget. Defaults are what a 45s film wants when the script leaves
// room; the MIN values are what it collapses to when the script runs long.
// Non-speech time is allocated as a SHARE of whatever the script leaves
// free, not as fixed constants. A script with lots of room gets a real
// establishing beat and a real closing beat; a tight script collapses to
// the minimums. Fixed defaults used to bunch all the spare time at the end,
// leaving the film silent for its last ten seconds.
const LEAD_IN_SHARE = 0.1;
const LEAD_IN_MAX = 2.5;
const LEAD_IN_MIN = 0.15;
const TAIL_OUT_SHARE = 0.2;
const TAIL_OUT_MAX = 4.5;
const TAIL_OUT_MIN = 0.25;
const GAP_MIN_SAME_SCENE = 0.18;
const GAP_MIN_SCENE_CHANGE = 0.35;
const GAP_MAX = 4.5;
// A scene change is worth twice the pause of a line break inside a scene.
const GAP_WEIGHT_SAME_SCENE = 1;
const GAP_WEIGHT_SCENE_CHANGE = 2;
// Beyond this the delivery starts to sound rushed, so we stop speeding up.
const MAX_TEMPO = 1.18;

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Flatten every scene's dialogue into one ordered timeline. The start/end
 * values here are only a first estimate used for ordering and as a fallback
 * — buildNarrationTrack() re-times everything from the real audio.
 */
export function attachLineTiming(scenes = []) {
  const list = Array.isArray(scenes) ? scenes.filter(Boolean) : [];
  const lines = [];

  list.forEach((scene, sceneIndex) => {
    const dialogue = (Array.isArray(scene?.dialogue) ? scene.dialogue : []).filter(
      (line) => line && String(line.text || "").trim()
    );
    if (dialogue.length === 0) return;

    const hasWindow = Number.isFinite(Number(scene.startSecond)) && Number.isFinite(Number(scene.endSecond));
    const windowStart = hasWindow ? Number(scene.startSecond) : (sceneIndex / list.length) * TARGET_SECONDS;
    const windowEnd = hasWindow ? Number(scene.endSecond) : ((sceneIndex + 1) / list.length) * TARGET_SECONDS;
    const windowSpan = Math.max(0.01, windowEnd - windowStart);

    const counts = dialogue.map((line) => Math.max(1, wordCount(line.text)));
    const totalWords = counts.reduce((a, b) => a + b, 0);

    let cursor = windowStart;
    dialogue.forEach((line, i) => {
      const share = counts[i] / totalWords;
      const start = cursor;
      const end = i === dialogue.length - 1 ? windowStart + windowSpan : start + windowSpan * share;
      cursor = end;

      lines.push({
        sceneId: scene.id ?? sceneIndex,
        sceneIndex,
        character: line.character,
        text: line.text,
        emotion: line.emotion,
        startSecond: round2(start),
        endSecond: round2(end)
      });
    });
  });

  return lines.sort((a, b) => a.startSecond - b.startSecond);
}

/**
 * Lay measured clips out across the fixed 45 seconds.
 *
 * Pure function (no ffmpeg, no I/O) so the pacing rules are directly
 * testable. Returns the final placement plus the tempo each clip needs.
 */
export function planPacing(clips, options = {}) {
  // Defaults reproduce the original whole-film behaviour exactly. A window
  // lets the same rules lay lines out inside ONE 15s clip (see
  // estimateSegmentPlacement), and maxTempo: Infinity lets a subtitle-only
  // caller compress durations as far as needed rather than ever drop a line.
  const { windowStart = 0, windowSeconds = TARGET_SECONDS, maxTempo = MAX_TEMPO } = options;
  const diagnostics = [];
  if (clips.length === 0) return { placed: [], tempo: 1, diagnostics };

  const speechTotal = clips.reduce((sum, clip) => sum + clip.rawSeconds, 0);

  // Gap weights between consecutive lines: index i is the gap AFTER clip i.
  const gapWeights = clips.slice(0, -1).map((clip, i) =>
    clips[i + 1].sceneIndex !== clip.sceneIndex ? GAP_WEIGHT_SCENE_CHANGE : GAP_WEIGHT_SAME_SCENE
  );
  const gapMinimums = clips.slice(0, -1).map((clip, i) =>
    clips[i + 1].sceneIndex !== clip.sceneIndex ? GAP_MIN_SCENE_CHANGE : GAP_MIN_SAME_SCENE
  );
  const minGapTotal = gapMinimums.reduce((a, b) => a + b, 0);

  let tempo = 1;
  let leadIn;
  let tailOut;
  let gaps;

  // Everything in the 45s that is not speech is breathing room to allocate.
  const freeTime = windowSeconds - speechTotal;
  const minFreeNeeded = LEAD_IN_MIN + TAIL_OUT_MIN + minGapTotal;

  if (freeTime >= minFreeNeeded) {
    // Comfortable script: a proportional establishing beat and closing beat,
    // with the rest spread between lines, weighted so a scene change gets a
    // longer pause than a line break inside one scene.
    leadIn = Math.min(LEAD_IN_MAX, Math.max(LEAD_IN_MIN, freeTime * LEAD_IN_SHARE));
    tailOut = Math.min(TAIL_OUT_MAX, Math.max(TAIL_OUT_MIN, freeTime * TAIL_OUT_SHARE));

    const gapBudget = Math.max(0, freeTime - leadIn - tailOut);
    const weightTotal = gapWeights.reduce((a, b) => a + b, 0);
    gaps = gapWeights.map((weight, i) =>
      weightTotal > 0 ? Math.min(GAP_MAX, Math.max(gapMinimums[i], (gapBudget * weight) / weightTotal)) : 0
    );

    // Whatever the per-gap ceiling refused settles on the closing beat.
    const gapsUsed = gaps.reduce((a, b) => a + b, 0);
    tailOut += Math.max(0, gapBudget - gapsUsed);
  } else {
    // Tight script: collapse to minimum breathing room first.
    leadIn = LEAD_IN_MIN;
    tailOut = TAIL_OUT_MIN;
    gaps = [...gapMinimums];

    const available = windowSeconds - leadIn - tailOut - minGapTotal;
    if (speechTotal > available) {
      // Still over: speed the delivery up slightly rather than cut words.
      const needed = speechTotal / Math.max(0.01, available);
      tempo = Math.min(maxTempo, needed);
      diagnostics.push(
        `script runs ${round2(speechTotal)}s of speech in a ${windowSeconds}s window — delivery sped up ${tempo.toFixed(3)}x to fit`
      );
    }
  }

  const scaled = clips.map((clip) => ({ ...clip, seconds: clip.rawSeconds / tempo }));

  let cursor = leadIn;
  const placed = [];
  scaled.forEach((clip, i) => {
    let seconds = clip.seconds;
    const hardCeiling = windowSeconds - TAIL_OUT_MIN;
    // The epsilon keeps float rounding from "trimming" a line that fits.
    if (cursor + seconds > hardCeiling + 1e-6) {
      seconds = hardCeiling - cursor;
      if (seconds >= MIN_LINE_SECONDS) {
        diagnostics.push(`line ${i + 1} trimmed to ${round2(seconds)}s to stay inside the ${windowSeconds}s window`);
      }
    }
    if (seconds < MIN_LINE_SECONDS) {
      diagnostics.push(`line ${i + 1} ("${String(clip.text).slice(0, 40)}...") dropped — no room left in the ${windowSeconds}s window`);
      return;
    }
    placed.push({
      ...clip,
      start: round2(windowStart + cursor),
      end: round2(windowStart + cursor + seconds),
      seconds
    });
    cursor += seconds + (gaps[i] || 0);
  });

  return { placed, tempo, diagnostics };
}

// Natural on-camera delivery rate, the same figure dialogueLock builds the
// script's own timing budget on. Used to estimate how long a line WOULD take
// to say when no speech is actually being synthesized.
const WORDS_PER_SECOND = 2.5;

/**
 * How long a line would take to speak, estimated from its word count.
 * Used by the subtitles-only path, where nothing measures real audio.
 */
export function estimateLineSeconds(text) {
  return Math.max(MIN_LINE_SECONDS, wordCount(text) / WORDS_PER_SECOND);
}

// ── Subtitles ──────────────────────────────────────────────────────────────

// Deliberately conservative: ~42 characters a line and at most two lines per
// cue is the standard broadcast readability limit, and it keeps the burned-in
// text small ("not too big") rather than a wall across the frame.
const SUBTITLE_MAX_CHARS_PER_LINE = 42;
const SUBTITLE_MAX_LINES = 2;

export function wrapSubtitleText(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const rows = [];
  let row = "";
  words.forEach((word) => {
    const candidate = row ? `${row} ${word}` : word;
    if (candidate.length > SUBTITLE_MAX_CHARS_PER_LINE && row) {
      rows.push(row);
      row = word;
    } else {
      row = candidate;
    }
  });
  if (row) rows.push(row);
  return rows;
}

/** Split one spoken line into readable cues, timed across its real audio span. */
export function buildSubtitleCues(placed) {
  const cues = [];

  placed.forEach((clip) => {
    const text = String(clip.text || "").trim();
    if (!text) return;

    // Wrap the whole line into display rows first, then group the rows into
    // cues. Doing it in this order is what guarantees both limits hold: no
    // row is over-long (the wrapper enforces it) and no cue shows more than
    // two rows (the grouping enforces it). Chunking by character budget
    // first could still wrap into three rows.
    const rows = wrapSubtitleText(text);
    const chunks = [];
    for (let i = 0; i < rows.length; i += SUBTITLE_MAX_LINES) {
      chunks.push(rows.slice(i, i + SUBTITLE_MAX_LINES));
    }

    // Time each cue by its share of the line's characters, so a long cue
    // stays on screen longer than a short one.
    const charsOf = (chunkRows) => chunkRows.join(" ").length;
    const totalChars = chunks.reduce((sum, c) => sum + charsOf(c), 0) || 1;
    let cursor = clip.start;
    chunks.forEach((chunkRows, i) => {
      const share = charsOf(chunkRows) / totalChars;
      const end = i === chunks.length - 1 ? clip.end : cursor + clip.seconds * share;
      cues.push({
        start: cursor,
        end: Math.min(end, clip.end),
        rows: chunkRows
      });
      cursor = end;
    });
  });

  return cues;
}

function assTime(seconds) {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.round((clamped - Math.floor(clamped)) * 100);
  const cs2 = cs === 100 ? 99 : cs;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs2).padStart(2, "0")}`;
}

function assEscape(text) {
  // Braces start an ASS override block, so they must not survive into a cue.
  return String(text).replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, " ");
}

/**
 * Build the burned-in subtitle file.
 *
 * ASS rather than SRT purely for style control: Fontsize 22 against a
 * PlayRes of 1280x720 is roughly 3% of frame height — clearly readable but
 * deliberately small, with an outline so it stays legible over bright video.
 */
export function buildAssSubtitles(cues) {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "PlayResX: 1280",
    "PlayResY: 720",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Film,Arial,22,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,1.6,0.6,2,60,60,30,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
  ];

  const events = cues
    .filter((cue) => cue.end > cue.start)
    .map((cue) => {
      const text = cue.rows.map(assEscape).join("\\N");
      return `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Film,,0,0,0,,${text}`;
    });

  return `${[...header, ...events].join("\n")}\n`;
}

/**
 * Subtitles WITHOUT any speech synthesis.
 *
 * The film is silent, so there is no audio for the captions to drift
 * against — they only have to be paced sensibly across the 45 seconds. That
 * makes a word-count estimate entirely sufficient, and it means the whole
 * subtitle feature works with no TTS provider, no API key and no cost.
 *
 * Deliberately runs the SAME planPacing() engine as the spoken path, just
 * fed estimated durations instead of measured ones, so both paths place
 * lines by identical rules and a later switch to real audio changes nothing
 * about how the film reads.
 */
export async function buildSubtitlesOnly({ lines, workDir }) {
  const spoken = (lines || []).filter((line) => line && String(line.text || "").trim());
  if (spoken.length === 0) {
    return { hasSubtitles: false, subtitleFileName: null, placed: [], diagnostics: [] };
  }

  const clips = spoken.map((line, i) => ({
    fileName: null,
    text: line.text,
    character: line.character,
    sceneIndex: Number.isFinite(line.sceneIndex) ? line.sceneIndex : i,
    rawSeconds: estimateLineSeconds(line.text)
  }));

  const { placed, diagnostics } = planPacing(clips);
  if (placed.length === 0) {
    return { hasSubtitles: false, subtitleFileName: null, placed: [], diagnostics };
  }

  const subtitleFileName = "subtitles.ass";
  await fs.writeFile(path.join(workDir, subtitleFileName), buildAssSubtitles(buildSubtitleCues(placed)), "utf8");

  return { hasSubtitles: true, subtitleFileName, placed, diagnostics };
}

/**
 * Word-count ESTIMATE of where each line falls inside ONE clip's window.
 *
 * Last-resort fallback only. The normal path (subtitleAlignment.js) measures
 * the real timing from the clip's own audio; this is used for a clip whose
 * audio could not be measured at all (no key, API down, no audio track), so
 * the film still ships subtitled. Lines stay inside the window of the clip
 * that speaks them. Pure function: no I/O, no paid calls.
 *
 * @param {{windowStart:number, windowSeconds:number, lines:{text:string, character?:string, sceneIndex?:number}[]}} segment
 * @returns {{placed: object[], diagnostics: string[]}}
 */
export function estimateSegmentPlacement(segment) {
  const spoken = (segment?.lines || []).filter((line) => line && String(line.text || "").trim());
  if (spoken.length === 0) return { placed: [], diagnostics: [] };

  const clips = spoken.map((line) => ({
    fileName: null,
    text: line.text,
    character: line.character,
    sceneIndex: Number.isFinite(line.sceneIndex) ? line.sceneIndex : 0,
    rawSeconds: estimateLineSeconds(line.text)
  }));

  return planPacing(clips, {
    windowStart: segment.windowStart,
    windowSeconds: segment.windowSeconds,
    maxTempo: Infinity
  });
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Synthesize, pace, and mix the whole dialogue track, and write the matching
 * subtitle file.
 *
 * @returns {{hasNarration: boolean, fileName: string|null, subtitleFileName: string|null,
 *            placed: object[], diagnostics: string[]}}
 */
export async function buildNarrationTrack({
  lines,
  characters = [],
  workDir,
  onProgress = () => {},
  // Injectable so the full pipeline can be exercised end-to-end without
  // spending TTS credits (see /api/video/selftest). Production always uses
  // the real ElevenLabs client.
  synthesize = synthesizeSpeech
}) {
  const spoken = (lines || []).filter((line) => line && String(line.text || "").trim());
  if (spoken.length === 0) {
    return { hasNarration: false, fileName: null, subtitleFileName: null, placed: [], diagnostics: [] };
  }

  const diagnostics = [];

  // One voice per character, decided once and reused for every line — this
  // is what keeps a character sounding like themselves across all 45s.
  const genderByName = new Map();
  (characters || []).forEach((character) => {
    if (character?.name) genderByName.set(String(character.name).trim().toUpperCase(), character.gender);
  });
  const voiceByName = new Map();
  const voiceIdFor = (characterName) => {
    const key = String(characterName || "").trim().toUpperCase();
    if (!voiceByName.has(key)) voiceByName.set(key, pickVoiceId(key, genderByName.get(key)));
    return voiceByName.get(key);
  };

  onProgress("Recording dialogue...");

  const clips = [];
  for (let i = 0; i < spoken.length; i += 1) {
    const line = spoken[i];
    const fileName = `line-${i + 1}.mp3`;

    try {
      const audio = await synthesize(line.text, voiceIdFor(line.character), line.emotion);
      await fs.writeFile(path.join(workDir, fileName), audio);
      const probe = await probeMedia(fileName, workDir);
      clips.push({
        fileName,
        text: line.text,
        character: line.character,
        sceneIndex: Number.isFinite(line.sceneIndex) ? line.sceneIndex : i,
        rawSeconds: probe.seconds ?? Math.max(MIN_LINE_SECONDS, line.endSecond - line.startSecond)
      });
    } catch (error) {
      diagnostics.push(
        `narration line ${i + 1} ("${String(line.text).slice(0, 40)}...") could not be synthesized and was skipped: ${error.message}`
      );
    }
  }

  if (clips.length === 0) {
    return { hasNarration: false, fileName: null, subtitleFileName: null, placed: [], diagnostics };
  }

  const { placed, tempo, diagnostics: pacingNotes } = planPacing(clips);
  diagnostics.push(...pacingNotes);

  if (placed.length === 0) {
    return { hasNarration: false, fileName: null, subtitleFileName: null, placed: [], diagnostics };
  }

  onProgress("Mixing the voice track...");

  // A 45.000s silence bed is input 0, so amix duration=first pins the output
  // to exactly the runtime by construction — no pad/trim pass needed.
  const inputs = ["-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo:d=${TARGET_SECONDS}`];
  placed.forEach((clip) => inputs.push("-i", clip.fileName));

  const delayChains = placed
    .map((clip, i) => {
      const steps = [];
      if (tempo !== 1) steps.push(`atempo=${tempo.toFixed(4)}`);
      steps.push(`atrim=0:${clip.seconds.toFixed(3)}`);
      steps.push(`adelay=${Math.round(clip.start * 1000)}:all=1`);
      return `[${i + 1}:a]${steps.join(",")}[d${i}]`;
    })
    .join(";");
  const mixInputs = ["[0:a]", ...placed.map((_, i) => `[d${i}]`)].join("");
  const filter = `${delayChains};${mixInputs}amix=inputs=${placed.length + 1}:duration=first:normalize=0[aout]`;

  const outputName = "narration.mp3";
  const result = await runFfmpeg(
    ["-y", "-hide_banner", ...inputs, "-filter_complex", filter, "-map", "[aout]", "-t", String(TARGET_SECONDS), outputName],
    { cwd: workDir, timeoutMs: 5 * 60 * 1000 }
  );

  if (!result.ok) {
    throw new Error(`Could not build the narration track: ${result.stderr.slice(-600)}`);
  }

  // Subtitles are generated from the SAME placement the audio used, so they
  // cannot drift from what is being said.
  const subtitleFileName = "subtitles.ass";
  await fs.writeFile(path.join(workDir, subtitleFileName), buildAssSubtitles(buildSubtitleCues(placed)), "utf8");

  return { hasNarration: true, fileName: outputName, subtitleFileName, placed, diagnostics };
}
