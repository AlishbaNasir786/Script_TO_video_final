import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // There is a stray package-lock.json one level up (D:\Script_TO_video_final)
  // with no package.json beside it, so Next inferred THAT as the workspace
  // root and warned on every build. Pinning the root to this folder makes the
  // build deterministic and keeps module resolution anchored to scenica/.
  turbopack: {
    root: path.join(__dirname),
  },

  // ffmpeg-static MUST NOT be bundled by webpack.
  //
  // Its index.js resolves the binary with `path.join(__dirname, "ffmpeg.exe")`.
  // Once bundled into `.next/server/app/api/video/`, `__dirname` points at the
  // bundle rather than at node_modules/ffmpeg-static, so the exported path
  // names a file that does not exist and spawn() fails with ENOENT. This is
  // the root cause of the "ffmpeg-static is installed but the binary path
  // cannot be found" failure on Windows.
  //
  // Listing it here keeps it as a real runtime `require`, so __dirname stays
  // correct and the 82 MB executable is never copied into the build output.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
