// ═══════════════════════════════════════════════════════════════════════════
// ffmpegPath.js — reliable ffmpeg binary resolution (Windows-safe)
//
// ROOT CAUSE this file exists to fix:
//   `import ffmpegPath from "ffmpeg-static"` does NOT work inside a Next.js
//   route handler. ffmpeg-static/index.js builds its path with
//   `path.join(__dirname, "ffmpeg.exe")`. When webpack bundles the package
//   into `.next/server/app/api/...`, `__dirname` is rewritten to the BUNDLE's
//   directory, so the exported path points at a file that does not exist
//   (e.g. `.next\server\app\api\video\ffmpeg.exe`). spawn() then fails with
//   ENOENT — which is exactly the "binary path could not be found even though
//   ffmpeg-static is installed" symptom.
//
//   The primary fix is `serverExternalPackages: ["ffmpeg-static"]` in
//   next.config.ts, which stops webpack bundling it so `__dirname` stays
//   correct. This module is the defence-in-depth: it verifies the path
//   actually exists on disk and falls back through every other sane location
//   before giving up, so the stitch step can never silently break again.
// ═══════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const IS_WINDOWS = process.platform === "win32";
const EXE = IS_WINDOWS ? "ffmpeg.exe" : "ffmpeg";

let cached = null;

function isUsableFile(candidate) {
  if (!candidate || typeof candidate !== "string") return false;
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

// Walk up from a starting directory looking for node_modules/ffmpeg-static/<exe>.
// Covers monorepo / nested-install layouts and the `.next` build output, where
// process.cwd() is the app root but the module may resolve elsewhere.
function walkUpForBinary(startDir) {
  let dir = startDir;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(dir, "node_modules", "ffmpeg-static", EXE);
    if (isUsableFile(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function fromPackageResolution() {
  try {
    // Resolving package.json (not the entry point) gives us the real on-disk
    // package directory even when the entry point itself has been bundled.
    const pkgJson = require.resolve("ffmpeg-static/package.json");
    const candidate = path.join(path.dirname(pkgJson), EXE);
    if (isUsableFile(candidate)) return candidate;
  } catch {
    /* not resolvable — fall through */
  }
  return null;
}

function fromModuleExport() {
  try {
    const mod = require("ffmpeg-static");
    const value = typeof mod === "string" ? mod : mod?.default;
    if (isUsableFile(value)) return value;
  } catch {
    /* bundled or missing — fall through */
  }
  return null;
}

function fromSystemPath() {
  // Last resort: a system-wide ffmpeg (chocolatey / winget / brew / apt).
  const probe = spawnSync(EXE, ["-version"], { stdio: "ignore", shell: IS_WINDOWS });
  if (!probe.error && probe.status === 0) return EXE;
  return null;
}

/**
 * Resolve a usable ffmpeg executable path.
 * @returns {string} an absolute path, or the bare command name if ffmpeg is on PATH.
 * @throws {Error} with actionable remediation text if nothing usable is found.
 */
export function resolveFfmpegPath() {
  if (cached) return cached;

  const candidates = [
    // 1. Explicit override always wins — lets a user point at their own build.
    process.env.FFMPEG_PATH && isUsableFile(process.env.FFMPEG_PATH) ? process.env.FFMPEG_PATH : null,
    // 2. The package's own export (correct once it is not webpack-bundled).
    fromModuleExport(),
    // 3. The package directory located via package.json resolution.
    fromPackageResolution(),
    // 4. Walk up from the working directory.
    walkUpForBinary(process.cwd()),
    // 5. Walk up from this module's own location.
    walkUpForBinary(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))),
    // 6. Anything already on PATH.
    fromSystemPath()
  ];

  const found = candidates.find(Boolean);

  if (!found) {
    throw new Error(
      "ffmpeg binary could not be located. Run `npm install ffmpeg-static` inside the scenica folder, " +
        "or set FFMPEG_PATH in .env.local to the full path of an ffmpeg executable."
    );
  }

  cached = found;
  return cached;
}

/**
 * Directory used for all intermediate + final video files.
 *
 * Deliberately NOT `.next/cache` (the previous location): that directory is
 * wiped by `next build` and by dev-server cache invalidation, so finished
 * videos vanished between the job completing and the browser requesting them.
 * A stable folder under the OS temp dir survives rebuilds and is Windows-safe
 * (no spaces-in-path or permission issues in AppData\Local\Temp).
 */
export function videoWorkRoot() {
  const root = path.join(os.tmpdir(), "scenica-video");
  fs.mkdirSync(root, { recursive: true });
  return root;
}
