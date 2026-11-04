// ═══════════════════════════════════════════════════════════════════════════
// subtitleAlignment.js — subtitles timed from the clip's REAL audio
//
// Seedance generates each 15s clip's speech itself and exposes no timing, so
// estimating when a line is spoken (word counts, TTS-measured durations)
// drifts by seconds: subtitles show up before the line is said, or over
// silence. Instead, each clip's own audio is measured:
//
//   1. Forced alignment (ElevenLabs): the clip audio + the exact lines that
//      clip was asked to speak → start/end of every character. Accurate to
//      ~0.1s when the model said the lines as written.
//   2. Verification, per line: alignment loss must be low AND the aligned
//      span must actually contain speech (ffmpeg silencedetect, free).
//      Calibration: matched speech scores ~0.5-0.6 overall (words ≤ ~1.0);
//      mismatched text scores ~3.8 (words up to ~9.5).
//   3. Fallback for lines that fail verification (model skipped or reworded
//      them): speech-to-text with word timestamps, fuzzy-matched to the line.
//   4. Last resort, only when the clip's audio cannot be measured at all:
//      the word-count estimate, kept inside the clip's own 15s window.
//
// Every step is non-fatal: a failure can cost accuracy, never the video.
// ═══════════════════════════════════════════════════════════════════════════

import { promises as fs } from "fs";
import path from "path";
import { runFfmpeg } from "./videoStitch.js";
import { forcedAlign, transcribeWords } from "./elevenLabs.js";
import { buildAssSubtitles, estimateSegmentPlacement, wrapSubtitleText } from "./narration.js";

const TOTAL_SECONDS = 45;
const SUBTITLE_MAX_LINES = 2;

// Verification thresholds (see calibration note above).
const CLIP_LOSS_MAX = 1.5;
const LINE_LOSS_MAX = 1.5;
const MIN_SPEECH_COVERAGE = 0.25;
const MIN_LINE_SPAN = 0.15;
const TRANSCRIPT_MATCH_MIN = 0.5;

// Cue display rules.
const HOLD_AFTER_SPEECH = 0.3; // keep the text up briefly after the last word
const MIN_CUE_SECONDS = 1.0; // long enough to read a short line
const GAP_BEFORE_NEXT = 0.05; // never overlap the next cue

const round2 = (value) => Math.round(value * 100) / 100;

// ── audio helpers ──────────────────────────────────────────────────────────

/** Extract a clip's audio as 16 kHz mono WAV. Returns the bare filename, or null if there is no audio. */
async function extractClipAudio(workDir, clipFile, outName) {
  const result = await runFfmpeg(
    ["-y", "-hide_banner", "-i", clipFile, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", outName],
    { cwd: workDir, timeoutMs: 60000 }
  );
  if (!result.ok) return null;
  try {
    const stat = await fs.stat(path.join(workDir, outName));
    return stat.size > 1000 ? outName : null;
  } catch {
    return null;
  }
}

/** Speech regions (seconds, clip-local) from ffmpeg silencedetect. Free and local. */
async function detectSpeechRegions(workDir, audioFile, durationSeconds) {
  const result = await runFfmpeg(
    ["-hide_banner", "-i", audioFile, "-af", "silencedetect=noise=-32dB:d=0.25", "-f", "null", "-"],
    { cwd: workDir, timeoutMs: 60000 }
  );
  const text = result.stderr || "";
  const silences = [];
  let open = null;
  for (const match of text.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    const value = Math.max(0, Number(match[2]));
    if (match[1] === "start") open = value;
    else if (open !== null) {
      silences.push([open, value]);
      open = null;
    }
  }
  if (open !== null) silences.push([open, durationSeconds]);

  const speech = [];
  let cursor = 0;
  for (const [start, end] of silences) {
    if (start > cursor) speech.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < durationSeconds) speech.push([cursor, durationSeconds]);
  return speech.filter(([s, e]) => e - s > 0.05);
}

function speechCoverage(regions, start, end) {
  const span = end - start;
  if (!(span > 0)) return 0;
  let covered = 0;
  for (const [s, e] of regions) covered += Math.max(0, Math.min(e, end) - Math.max(s, start));
  return covered / span;
}

// ── timing sources ─────────────────────────────────────────────────────────

/**
 * Per-line timings from a forced-alignment result. `characters` indexes 1:1
 * into the submitted text, so each line's first/last character gives its
 * span, and the per-character times are kept for splitting long lines.
 */
function timesFromAlignment(lines, text, result) {
  const chars = Array.isArray(result?.characters) ? result.characters : [];
  const words = (Array.isArray(result?.words) ? result.words : []).filter((w) => String(w.text || "").trim());
  if (chars.length !== text.length) return null; // cannot map safely

  let offset = 0;
  return lines.map((line) => {
    const charStart = text.indexOf(line.text, offset);
    const charEnd = charStart + line.text.length - 1;
    offset = charEnd + 1;

    const lineChars = chars.slice(charStart, charEnd + 1);
    const start = Number(lineChars[0]?.start);
    const end = Number(lineChars.at(-1)?.end);
    const inLine = words.filter((w) => w.start >= start - 0.01 && w.end <= end + 0.01);
    const loss = inLine.length ? inLine.reduce((sum, w) => sum + (Number(w.loss) || 0), 0) / inLine.length : Infinity;

    return { start, end, loss, charTimes: lineChars.map((c) => ({ start: Number(c.start), end: Number(c.end) })) };
  });
}

const normaliseToken = (value) => String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Match each line to the stretch of a transcript (speech-to-text words) that
 * best contains its words, scanning forward so lines keep their order.
 */
function timesFromTranscript(lines, transcriptWords) {
  const words = transcriptWords
    .filter((w) => w.type === "word" && Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => ({ token: normaliseToken(w.text), start: w.start, end: w.end }))
    .filter((w) => w.token);

  let cursor = 0;
  return lines.map((line) => {
    const tokens = line.text.split(/\s+/).map(normaliseToken).filter(Boolean);
    if (tokens.length === 0 || words.length === 0) return null;
    const wanted = new Set(tokens);
    // A little slack for words the model inserted, but tight enough not to
    // swallow the start of the next line.
    const windowSize = tokens.length + 2;

    let best = null;
    for (let s = cursor; s < words.length; s += 1) {
      const hits = [];
      for (let k = s; k < Math.min(words.length, s + windowSize); k += 1) {
        if (wanted.has(words[k].token)) hits.push({ ...words[k], index: k });
      }
      const score = new Set(hits.map((w) => w.token)).size / wanted.size;
      if (!best || score > best.score) best = { score, hits };
      if (score === 1) break;
    }
    if (!best || best.score < TRANSCRIPT_MATCH_MIN || best.hits.length === 0) return null;

    // Resume right after the last matched word, not after the whole window.
    cursor = best.hits.at(-1).index + 1;
    return { start: best.hits[0].start, end: best.hits.at(-1).end, score: best.score };
  });
}

/** Place lines that could not be measured into the free time between measured neighbours. */
function fillUntimedLines(timed, segment) {
  const windowEnd = segment.windowSeconds;
  timed.forEach((entry, i) => {
    if (entry.start !== null) return;
    const prevEnd = timed.slice(0, i).reverse().find((t) => t.start !== null)?.end ?? 0;
    const nextStart = timed.slice(i + 1).find((t) => t.start !== null)?.start ?? windowEnd;
    const words = entry.line.text.split(/\s+/).filter(Boolean).length;
    const want = Math.max(MIN_CUE_SECONDS, words / 2.5);
    const start = prevEnd + 0.1;
    entry.start = Math.min(start, Math.max(0, nextStart - 0.6));
    entry.end = Math.min(entry.start + want, Math.max(entry.start + 0.6, nextStart - 0.1));
    entry.source = "estimate";
  });
}

// ── cues ───────────────────────────────────────────────────────────────────

/**
 * Turn timed lines into display cues: at most two rows per cue, a long line
 * split at real word boundaries using the per-character times when known.
 */
function buildCues(placed) {
  const sorted = [...placed].sort((a, b) => a.start - b.start);
  const cues = [];

  sorted.forEach((line, i) => {
    const next = sorted[i + 1];
    let lineEnd = Math.max(line.end + HOLD_AFTER_SPEECH, line.start + MIN_CUE_SECONDS);
    if (next) lineEnd = Math.min(lineEnd, next.start - GAP_BEFORE_NEXT);
    lineEnd = Math.min(lineEnd, TOTAL_SECONDS);
    lineEnd = Math.max(lineEnd, line.start + 0.3);

    const rows = wrapSubtitleText(line.text);
    const chunks = [];
    for (let r = 0; r < rows.length; r += SUBTITLE_MAX_LINES) chunks.push(rows.slice(r, r + SUBTITLE_MAX_LINES));

    // Character offset of each chunk inside the line text.
    let searchFrom = 0;
    const chunkStarts = chunks.map((chunkRows) => {
      const firstWord = chunkRows[0].split(" ")[0];
      const at = line.text.indexOf(firstWord, searchFrom);
      searchFrom = at + 1;
      return Math.max(0, at);
    });

    const timeAtChar = (charIndex) => {
      if (Array.isArray(line.charTimes) && line.charTimes[charIndex]) return line.windowStart + line.charTimes[charIndex].start;
      return line.start + (line.end - line.start) * (charIndex / Math.max(1, line.text.length));
    };

    chunks.forEach((chunkRows, c) => {
      const start = c === 0 ? line.start : timeAtChar(chunkStarts[c]);
      const end = c === chunks.length - 1 ? lineEnd : timeAtChar(chunkStarts[c + 1]) - GAP_BEFORE_NEXT;
      if (end > start) cues.push({ start: round2(start), end: round2(end), rows: chunkRows });
    });
  });

  return cues;
}

// ── main entry point ───────────────────────────────────────────────────────

/**
 * Build the burned-in subtitle file for the stitched 45s film.
 *
 * @param {object} args
 * @param {{clipFile: string|null, windowStart: number, windowSeconds: number,
 *          lines: {text: string, character?: string, sceneIndex?: number}[]}[]} args.segments
 *        One entry per 15s clip: its file (bare name in workDir) and the lines it speaks.
 * @param {string} args.workDir
 * @param {boolean} args.measure  false = skip all API calls and use the estimate (no key configured)
 * @param {Function} args.align       injectable for tests (defaults to ElevenLabs forced alignment)
 * @param {Function} args.transcribe  injectable for tests (defaults to ElevenLabs speech-to-text)
 * @returns {Promise<{subtitleFileName: string|null, placed: object[], diagnostics: string[],
 *          stats: {aligned: number, transcribed: number, estimated: number}}>}
 */
export async function buildAlignedSubtitles({
  segments = [],
  workDir,
  measure = true,
  align = forcedAlign,
  transcribe = transcribeWords
}) {
  const diagnostics = [];
  const stats = { aligned: 0, transcribed: 0, estimated: 0 };
  const placedAll = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const lines = (segment?.lines || [])
      .filter((line) => line && String(line.text || "").trim())
      .map((line) => ({ ...line, text: String(line.text).replace(/\s+/g, " ").trim() }));
    if (lines.length === 0) continue;

    const tag = `clip ${index + 1}`;
    const timed = lines.map((line) => ({ line, start: null, end: null, charTimes: null, source: null }));

    let audioFile = null;
    let speechRegions = null;
    if (measure && segment.clipFile) {
      audioFile = await extractClipAudio(workDir, segment.clipFile, `subtitle-audio-${index + 1}.wav`);
      if (!audioFile) diagnostics.push(`${tag}: no audio track to measure — subtitles estimated`);
      else speechRegions = await detectSpeechRegions(workDir, audioFile, segment.windowSeconds);
    }

    const audioUsable = Boolean(audioFile) && speechRegions && speechRegions.length > 0;
    if (audioFile && !audioUsable) diagnostics.push(`${tag}: audio is silent — subtitles estimated`);

    if (audioUsable) {
      const audioBuffer = await fs.readFile(path.join(workDir, audioFile));

      // 1 + 2: forced alignment, verified per line.
      try {
        const text = lines.map((line) => line.text).join(" ");
        const result = await align(audioBuffer, text, audioFile);
        const perLine = timesFromAlignment(lines, text, result);
        const clipLoss = Number(result?.loss);

        if (!perLine) {
          diagnostics.push(`${tag}: alignment output did not map onto the text`);
        } else if (!(clipLoss <= CLIP_LOSS_MAX)) {
          diagnostics.push(`${tag}: alignment loss ${round2(clipLoss)} too high — speech does not match the script`);
        } else {
          perLine.forEach((entry, i) => {
            const coverage = speechCoverage(speechRegions, entry.start, entry.end);
            const ok =
              Number.isFinite(entry.start) &&
              Number.isFinite(entry.end) &&
              entry.end - entry.start >= MIN_LINE_SPAN &&
              entry.loss <= LINE_LOSS_MAX &&
              coverage >= MIN_SPEECH_COVERAGE;
            if (ok) Object.assign(timed[i], { start: entry.start, end: entry.end, charTimes: entry.charTimes, source: "aligned" });
            else diagnostics.push(`${tag} line ${i + 1}: alignment rejected (loss ${round2(entry.loss)}, speech ${round2(coverage)})`);
          });
        }
      } catch (error) {
        diagnostics.push(`${tag}: forced alignment failed — ${error.message}`);
      }

      // 3: speech-to-text for whatever alignment could not place.
      if (timed.some((entry) => entry.start === null)) {
        try {
          const words = await transcribe(audioBuffer, audioFile);
          const matches = timesFromTranscript(lines, words);
          matches.forEach((match, i) => {
            if (match && timed[i].start === null) Object.assign(timed[i], { start: match.start, end: match.end, source: "transcribed" });
          });
        } catch (error) {
          diagnostics.push(`${tag}: transcription fallback failed — ${error.message}`);
        }
      }
    }

    // 4: estimate.
    if (timed.every((entry) => entry.start === null)) {
      const { placed, diagnostics: notes } = estimateSegmentPlacement({ ...segment, lines, windowStart: 0 });
      notes.forEach((note) => diagnostics.push(`${tag}: ${note}`));
      // planPacing may drop a line that cannot fit; map placements back by text order.
      placed.forEach((p, i) => {
        const entry = timed.find((t) => t.start === null && t.line.text === p.text) || timed[i];
        if (entry) Object.assign(entry, { start: p.start, end: p.end, source: "estimate" });
      });
    }
    fillUntimedLines(timed, segment);

    timed.forEach((entry) => {
      stats[{ aligned: "aligned", transcribed: "transcribed", estimate: "estimated" }[entry.source]] += 1;
      placedAll.push({
        text: entry.line.text,
        character: entry.line.character,
        windowStart: segment.windowStart,
        start: segment.windowStart + entry.start,
        end: segment.windowStart + entry.end,
        charTimes: entry.charTimes,
        source: entry.source
      });
    });
  }

  if (placedAll.length === 0) return { subtitleFileName: null, placed: [], diagnostics, stats };

  const subtitleFileName = "subtitles.ass";
  await fs.writeFile(path.join(workDir, subtitleFileName), buildAssSubtitles(buildCues(placedAll)), "utf8");

  return {
    subtitleFileName,
    placed: placedAll.map((line) => ({
      text: line.text,
      character: line.character,
      start: round2(line.start),
      end: round2(line.end),
      source: line.source
    })),
    diagnostics,
    stats
  };
}
