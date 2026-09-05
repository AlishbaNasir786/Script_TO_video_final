// ═══════════════════════════════════════════════════════════════════════════
// GET /api/video/selftest
//
// Proves the ffmpeg half of the pipeline works on this machine WITHOUT
// spending any Fal credits. It synthesises three 15-second clips with ffmpeg,
// then runs the exact same extractLastFrame + stitchLocalClips code the real
// job uses, and reports the resulting master's duration.
//
// This is deliberately an API route rather than a standalone node script: the
// ffmpeg-static failure being guarded against here only manifests INSIDE the
// Next.js bundle (webpack rewriting __dirname). A plain `node test.js` would
// pass while the app still broke, so the test has to run in the same place the
// real code does.
// ═══════════════════════════════════════════════════════════════════════════

import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { resolveFfmpegPath } from "@/lib/ffmpegPath";
import {
  runFfmpeg,
  createJobWorkDir,
  extractLastFrame,
  stitchLocalClips,
  cleanupWorkDir
} from "@/lib/videoStitch";
import { registerVideoFile } from "@/lib/videoJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request) {
  const keepOutput = new URL(request.url).searchParams.get("keep") === "1";
  const started = Date.now();
  const steps = [];
  let workDir = null;

  try {
    const ffmpegPath = resolveFfmpegPath();
    steps.push({ step: "resolve-ffmpeg", ok: true, detail: ffmpegPath });

    workDir = await createJobWorkDir(`selftest-${Date.now()}`);
    steps.push({ step: "work-dir", ok: true, detail: workDir });

    // Three distinguishable 15s clips, matching what Seedance returns:
    // 1280x720, 30fps, h264 + aac.
    const fileNames = [];
    for (let i = 0; i < 3; i += 1) {
      const name = `segment-${i + 1}.mp4`;
      const result = await runFfmpeg(
        [
          "-y", "-hide_banner",
          "-f", "lavfi", "-i", `testsrc=size=1280x720:rate=30:duration=15`,
          "-f", "lavfi", "-i", `sine=frequency=${330 + i * 110}:duration=15`,
          "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "128k",
          "-t", "15",
          name
        ],
        { cwd: workDir, timeoutMs: 180000 }
      );
      if (!result.ok) throw new Error(`Could not synthesise clip ${i + 1}: ${result.stderr.slice(-400)}`);
      fileNames.push(name);
    }
    steps.push({ step: "synthesise-3x15s-clips", ok: true, detail: fileNames.join(", ") });

    // The continuity handoff step used between clips in the real job.
    const framePath = await extractLastFrame(fileNames[0], "handoff-1.jpg", workDir);
    const frameSize = framePath ? (await fs.stat(framePath)).size : 0;
    steps.push({
      step: "extract-last-frame",
      ok: Boolean(framePath) && frameSize > 0,
      detail: framePath ? `${path.basename(framePath)} (${frameSize} bytes)` : "extraction returned null"
    });

    const stitched = await stitchLocalClips(workDir, fileNames, () => {});
    const durationOk = Math.abs(stitched.durationSeconds - 45) <= 0.05;
    steps.push({
      step: "stitch-to-45s",
      ok: durationOk,
      detail: `${stitched.durationSeconds}s via ${stitched.strategy}`
    });

    if (keepOutput) {
      registerVideoFile(stitched.key, stitched.filePath);
    } else {
      await fs.rm(stitched.filePath, { force: true }).catch(() => {});
    }

    const allOk = steps.every((step) => step.ok);

    return NextResponse.json({
      ok: allOk,
      summary: allOk
        ? "ffmpeg pipeline verified: 3 x 15s clips stitched to exactly 45s."
        : "ffmpeg pipeline has a problem — see steps.",
      ffmpegPath,
      durationSeconds: stitched.durationSeconds,
      stitchStrategy: stitched.strategy,
      stitchWarnings: stitched.warnings,
      previewUrl: keepOutput ? stitched.url : null,
      elapsedMs: Date.now() - started,
      steps
    });
  } catch (error) {
    steps.push({ step: "failed", ok: false, detail: error.message });
    return NextResponse.json(
      { ok: false, error: error.message, elapsedMs: Date.now() - started, steps },
      { status: 500 }
    );
  } finally {
    if (workDir) await cleanupWorkDir(workDir);
  }
}
