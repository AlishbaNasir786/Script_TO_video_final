// ═══════════════════════════════════════════════════════════════════════════
// videoStitch.js — download the three 15s clips and join them into one 45s MP4
//
// Windows-specific care taken here:
//   • The ffmpeg binary is resolved through resolveFfmpegPath(), which verifies
//     the file exists rather than trusting ffmpeg-static's bundled __dirname.
//   • ffmpeg is spawned with `cwd` set to the working directory and the concat
//     list references BARE FILENAMES. Absolute Windows paths inside a concat
//     list are a well-known source of parse failures (backslashes, drive
//     letters and the ' quoting rules interact badly); keeping the list
//     relative removes the whole class of problem.
//   • Working files live under os.tmpdir() (AppData\Local\Temp on Windows),
//     never under .next/, which gets wiped by rebuilds.
//   • spawn() is used with an explicit argv array and shell:false, so paths
//     containing spaces are passed through safely without quoting games.
// ═══════════════════════════════════════════════════════════════════════════

import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import { resolveFfmpegPath, videoWorkRoot } from "./ffmpegPath";

const TARGET_SECONDS = 45;
const DURATION_TOLERANCE = 0.05;

export function runFfmpeg(args, { cwd, timeoutMs = 10 * 60 * 1000 } = {}) {
  const binary = resolveFfmpegPath();

  return new Promise((resolve) => {
    const child = spawn(binary, args, { cwd, shell: false, windowsHide: true });

    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ ok: false, code: null, stderr: `${stderr}\nffmpeg timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    // ffmpeg writes everything informational to stderr; cap it so a long run
    // cannot balloon memory while still keeping the tail for diagnostics.
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 60000) stderr = stderr.slice(-40000);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, code: null, stderr: `Failed to launch ffmpeg at "${binary}": ${error.message}` });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stderr });
    });
  });
}

// ffmpeg-static ships no ffprobe, so read the duration out of ffmpeg's own
// banner. `-f null -` decodes the file and reports the true output duration,
// which is more reliable than the container header for concatenated files.
async function probeMedia(file, cwd) {
  const result = await runFfmpeg(["-hide_banner", "-i", file, "-f", "null", "-"], { cwd, timeoutMs: 120000 });
  const text = result.stderr || "";

  let seconds = null;
  const timeMatches = [...text.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  if (timeMatches.length > 0) {
    const last = timeMatches.at(-1);
    seconds = Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
  } else {
    const durationMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (durationMatch) {
      seconds = Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]);
    }
  }

  return {
    seconds: Number.isFinite(seconds) ? Math.round(seconds * 100) / 100 : null,
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(text),
    raw: text
  };
}

export async function downloadTo(url, targetPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download generated clip (${response.status}) from ${url.slice(0, 120)}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error(`Downloaded clip was empty: ${url.slice(0, 120)}`);
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}

/**
 * Grab the final frame of a clip as a JPEG.
 *
 * This is the continuity anchor: it is handed to the next segment as a
 * reference image so clip N+1 literally starts from the last frame of clip N.
 * `-sseof -0.5` seeks half a second from the end, `-update 1` keeps
 * overwriting a single output image so we end up with the last decoded frame.
 */
export async function extractLastFrame(videoPath, outputPath, cwd) {
  const result = await runFfmpeg(
    ["-y", "-hide_banner", "-sseof", "-0.5", "-i", videoPath, "-update", "1", "-frames:v", "1", "-q:v", "3", outputPath],
    { cwd, timeoutMs: 120000 }
  );

  if (!result.ok) return null;
  try {
    const stat = await fs.stat(path.resolve(cwd || ".", outputPath));
    return stat.size > 0 ? path.resolve(cwd || ".", outputPath) : null;
  } catch {
    return null;
  }
}

/** Grab the first frame of a clip as a JPEG — the counterpart to extractLastFrame. */
export async function extractFirstFrame(videoPath, outputPath, cwd) {
  const result = await runFfmpeg(
    ["-y", "-hide_banner", "-i", videoPath, "-frames:v", "1", "-q:v", "3", outputPath],
    { cwd, timeoutMs: 60000 }
  );

  if (!result.ok) return null;
  try {
    const stat = await fs.stat(path.resolve(cwd || ".", outputPath));
    return stat.size > 0 ? path.resolve(cwd || ".", outputPath) : null;
  } catch {
    return null;
  }
}

/**
 * Automated continuity check across a stitch boundary.
 *
 * Compares the handoff frame (last frame of clip N, the same image sent to
 * Fal as clip N+1's reference) against clip N+1's actual first frame, using
 * ffmpeg's SSIM filter (1.0 = pixel-identical, 0 = unrelated). This is a real,
 * automated verification that the cut is visually continuous — cast, costume,
 * set and lighting intact across the join — rather than trusting the prompt
 * instructions to have worked.
 *
 * Diagnostic only: logged for QA, never blocks the job or reaches the UI. An
 * SSIM heuristic on a single frame pair can false-positive on a deliberate
 * camera move, so it is not safe to fail generation on this alone.
 */
export async function compareContinuity(frameAPath, frameBPath, cwd) {
  const result = await runFfmpeg(
    ["-hide_banner", "-i", frameAPath, "-i", frameBPath, "-lavfi", "ssim", "-f", "null", "-"],
    { cwd, timeoutMs: 30000 }
  );
  const match = result.stderr.match(/All:([\d.]+)/);
  return match ? Number(match[1]) : null;
}

async function writeConcatList(workDir, fileNames) {
  const listPath = path.join(workDir, "concat.txt");
  // Bare filenames only — see the Windows note at the top of this file.
  const body = fileNames.map((name) => `file '${name}'`).join("\n");
  await fs.writeFile(listPath, `${body}\n`, "utf8");
  return "concat.txt";
}

/**
 * Join clips into one file. Three strategies, each a fallback for the last:
 *
 *   1. concat demuxer + stream copy — instant and lossless. Works whenever the
 *      clips share codec parameters, which they do when all three come from
 *      the same model at the same settings (the normal case).
 *   2. concat demuxer + re-encode — handles timestamp/bitrate mismatches.
 *   3. concat FILTER with explicit scaling and audio normalisation — the only
 *      approach that survives clips with different resolutions or a clip that
 *      came back without an audio track.
 *
 * The old code only ever tried strategy 1 and reported its stderr as a fatal
 * error, so any parameter mismatch between clips killed the whole job.
 */
async function concatClips(workDir, fileNames, outputName, probes) {
  const listName = await writeConcatList(workDir, fileNames);
  const attempts = [];

  // Strategy 1 — stream copy.
  let result = await runFfmpeg(
    ["-y", "-hide_banner", "-f", "concat", "-safe", "0", "-i", listName, "-c", "copy", "-movflags", "+faststart", outputName],
    { cwd: workDir }
  );
  if (result.ok) return { strategy: "stream-copy", attempts };
  attempts.push({ strategy: "stream-copy", stderr: result.stderr.slice(-600) });

  // Strategy 2 — re-encode through the demuxer.
  result = await runFfmpeg(
    [
      "-y", "-hide_banner",
      "-f", "concat", "-safe", "0", "-i", listName,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      outputName
    ],
    { cwd: workDir }
  );
  if (result.ok) return { strategy: "demuxer-reencode", attempts };
  attempts.push({ strategy: "demuxer-reencode", stderr: result.stderr.slice(-600) });

  // Strategy 3 — concat filter, normalising every stream first.
  const everyClipHasAudio = probes.every((probe) => probe.hasAudio);
  const inputs = fileNames.flatMap((name) => ["-i", name]);

  const videoChains = fileNames
    .map((_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`)
    .join(";");

  let filter;
  let maps;
  if (everyClipHasAudio) {
    const audioChains = fileNames.map((_, i) => `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`).join(";");
    const pairs = fileNames.map((_, i) => `[v${i}][a${i}]`).join("");
    filter = `${videoChains};${audioChains};${pairs}concat=n=${fileNames.length}:v=1:a=1[vout][aout]`;
    maps = ["-map", "[vout]", "-map", "[aout]"];
  } else {
    // At least one clip has no audio track — join video only rather than
    // failing outright. A silent master is far better than no master.
    const chain = fileNames.map((_, i) => `[v${i}]`).join("");
    filter = `${videoChains};${chain}concat=n=${fileNames.length}:v=1:a=0[vout]`;
    maps = ["-map", "[vout]"];
  }

  result = await runFfmpeg(
    [
      "-y", "-hide_banner",
      ...inputs,
      "-filter_complex", filter,
      ...maps,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      ...(everyClipHasAudio ? ["-c:a", "aac", "-b:a", "192k"] : []),
      "-movflags", "+faststart",
      outputName
    ],
    { cwd: workDir, timeoutMs: 15 * 60 * 1000 }
  );
  if (result.ok) return { strategy: "concat-filter", attempts, audioDropped: !everyClipHasAudio };
  attempts.push({ strategy: "concat-filter", stderr: result.stderr.slice(-600) });

  const detail = attempts.map((a) => `[${a.strategy}] ${a.stderr}`).join("\n---\n");
  throw new Error(`ffmpeg could not stitch the three clips. Attempts:\n${detail}`);
}

/**
 * Force the master to exactly 45.00 seconds.
 *
 * Seedance returns clips that are very close to but not always precisely 15s,
 * so three of them can land at 44.8 or 45.2. "Exactly 45 seconds" is a hard
 * product requirement, not a best-effort target — so unlike most steps in
 * this file, this one does not degrade gracefully. If the file is off target
 * and the corrective ffmpeg pass itself fails, this throws rather than
 * quietly shipping a master of the wrong length.
 */
async function enforceExactDuration(workDir, inputName, outputName, actualSeconds, hasAudio) {
  const delta = actualSeconds - TARGET_SECONDS;
  if (Math.abs(delta) <= DURATION_TOLERANCE) return { adjusted: false, outputName: inputName };

  const args = ["-y", "-hide_banner", "-i", inputName];

  if (delta > 0) {
    args.push("-t", String(TARGET_SECONDS));
  } else {
    const padSeconds = Math.abs(delta).toFixed(3);
    args.push("-vf", `tpad=stop_mode=clone:stop_duration=${padSeconds}`);
    if (hasAudio) args.push("-af", "apad");
    args.push("-t", String(TARGET_SECONDS));
  }

  args.push(
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    ...(hasAudio ? ["-c:a", "aac", "-b:a", "192k"] : ["-an"]),
    "-movflags", "+faststart",
    outputName
  );

  const result = await runFfmpeg(args, { cwd: workDir, timeoutMs: 10 * 60 * 1000 });
  if (!result.ok) {
    throw new Error(
      `Could not normalise the final video to exactly ${TARGET_SECONDS}s (was ${actualSeconds}s): ${result.stderr.slice(-300)}`
    );
  }
  return { adjusted: true, outputName };
}

/**
 * Create the per-job working directory. The runner creates this up front so
 * each clip can be downloaded (and its last frame extracted for continuity)
 * as soon as it finishes, rather than downloading everything again at the end.
 */
export async function createJobWorkDir(jobId) {
  const root = videoWorkRoot();
  const workDir = path.join(root, `job-${jobId}`);
  await fs.mkdir(workDir, { recursive: true });
  return workDir;
}

/** Download one finished clip into the job working directory. */
export async function downloadClip(workDir, url, segmentIndex) {
  const name = `segment-${segmentIndex + 1}.mp4`;
  await downloadTo(url, path.join(workDir, name));
  return name;
}

/** Verify ffmpeg is usable. Called before any credits are spent. */
export function assertFfmpegAvailable() {
  return resolveFfmpegPath();
}

export async function cleanupWorkDir(workDir) {
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Concat → duration-normalise → publish, from clips already on disk.
 *
 * @param {string} workDir
 * @param {string[]} fileNames  bare filenames inside workDir, in story order
 * @param {(msg: string) => void} onProgress
 * @returns {Promise<{key: string, url: string, filePath: string, durationSeconds: number, strategy: string, warnings: string[]}>}
 */
export async function stitchLocalClips(workDir, fileNames, onProgress = () => {}) {
  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    throw new Error("No generated clips were supplied to the stitch step.");
  }

  const binary = resolveFfmpegPath();
  const root = videoWorkRoot();
  const warnings = [];

  onProgress("Inspecting clips...");
  const probes = [];
  for (const name of fileNames) {
    const probe = await probeMedia(name, workDir);
    probes.push(probe);
  }

  probes.forEach((probe, i) => {
    if (probe.seconds && Math.abs(probe.seconds - 15) > 1.5) {
      warnings.push(`Clip ${i + 1} came back at ${probe.seconds}s rather than 15s.`);
    }
  });

  onProgress("Stitching the three clips into one 45-second master...");
  const stitchedName = "stitched.mp4";
  const { strategy, audioDropped } = await concatClips(workDir, fileNames, stitchedName, probes);
  if (audioDropped) warnings.push("At least one clip had no audio track, so the master was assembled without audio.");

  const stitchedProbe = await probeMedia(stitchedName, workDir);

  // A duration we could not even measure is not a duration we can guarantee.
  // "Exactly 45 seconds" is a hard requirement, so an unverifiable master is
  // a failure, not a silent pass.
  if (stitchedProbe.seconds === null) {
    throw new Error("Could not measure the stitched master's duration — cannot confirm it meets the 45-second requirement.");
  }

  let finalName = stitchedName;
  let finalSeconds = stitchedProbe.seconds;

  onProgress("Finalizing your video...");
  const adjusted = await enforceExactDuration(workDir, stitchedName, "final-45s.mp4", stitchedProbe.seconds, stitchedProbe.hasAudio);
  if (adjusted.adjusted) {
    finalName = adjusted.outputName;
    const finalProbe = await probeMedia(finalName, workDir);
    if (finalProbe.seconds === null) {
      throw new Error("Could not verify the final video's duration after normalisation.");
    }
    finalSeconds = finalProbe.seconds;
  }

  // Hard gate: never publish a file outside the 45s tolerance. enforceExactDuration
  // already throws on failure, so reaching here with a bad duration would mean a
  // logic error above — checked explicitly rather than trusted.
  if (Math.abs(finalSeconds - TARGET_SECONDS) > DURATION_TOLERANCE) {
    throw new Error(`Final video duration is ${finalSeconds}s, outside the required 45s ± ${DURATION_TOLERANCE}s tolerance.`);
  }

  // Publish to a stable path so the file survives the working directory and
  // any subsequent rebuild.
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const publishedPath = path.join(root, `final-${key}.mp4`);
  await fs.copyFile(path.join(workDir, finalName), publishedPath);

  return {
    key,
    url: `/api/video?key=${key}`,
    filePath: publishedPath,
    durationSeconds: finalSeconds,
    strategy,
    ffmpegPath: binary,
    warnings
  };
}
