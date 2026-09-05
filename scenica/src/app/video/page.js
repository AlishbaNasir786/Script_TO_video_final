"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getReferenceImageUrls, MODEL_TIERS, TOTAL_SECONDS } from "@/lib/videoPlan";

// ═══════════════════════════════════════════════════════════════════════════
// This page deliberately shows almost nothing about how generation works.
// The product requirement is that the finished video reads as one continuous
// film — so there is no per-clip breakdown, no stage names, no provider
// jargon, and no diagnostic notes. The only things rendered while a job runs
// are: a progress percentage and one short, plain-language status line
// (both of which the server already returns pre-sanitized — see
// PUBLIC_MESSAGE in the API route). On completion, only the finished video
// is shown.
// ═══════════════════════════════════════════════════════════════════════════

const JOB_STORAGE_KEY = "scenicaVideoJobId";
const POLL_INTERVAL_MS = 3000;

const panel = {
  background: "rgba(40,65,65,0.4)",
  border: "2.5px solid rgba(103,125,106,0.5)",
  borderRadius: "24px",
  padding: "28px"
};

const field = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid rgba(103,125,106,0.8)",
  background: "rgba(26,54,54,0.8)",
  color: "#D6BD98",
  fontSize: "14px"
};

const labelStyle = {
  fontSize: "12px",
  letterSpacing: "0.08em",
  color: "rgba(214,189,152,0.7)",
  textTransform: "uppercase",
  marginBottom: "10px"
};

export default function VideoPage() {
  const router = useRouter();

  const [result, setResult] = useState(null);
  const [modelId, setModelId] = useState(MODEL_TIERS[0].id);
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");

  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const pollTimer = useRef(null);

  // ── Load the script produced by the earlier stages ──────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem("scenicaResult");
    if (!stored) {
      router.push("/");
      return;
    }
    try {
      setResult(JSON.parse(stored));
    } catch {
      router.push("/");
      return;
    }
    // Resume a job that was already running if the page was reloaded. Without
    // this, a refresh during a long render looks like the job vanished.
    const existing = sessionStorage.getItem(JOB_STORAGE_KEY);
    if (existing) setJobId(existing);
  }, [router]);

  const referenceImages = useMemo(() => getReferenceImageUrls(result?.characters || []), [result]);
  const characterNames = useMemo(
    () => (result?.characters || []).map((c) => c.name).filter(Boolean),
    [result]
  );

  const selectedTier = useMemo(
    () => MODEL_TIERS.find((tier) => tier.id === modelId) || MODEL_TIERS[0],
    [modelId]
  );

  const isTerminal = job?.status === "completed" || job?.status === "failed";
  const isRunning = Boolean(jobId) && !isTerminal;

  // ── Polling ─────────────────────────────────────────────────────────────
  const poll = useCallback(async (id) => {
    try {
      const response = await fetch(`/api/video?jobId=${encodeURIComponent(id)}`, { cache: "no-store" });

      if (response.status === 404) {
        setError("Your session expired. Please start again.");
        sessionStorage.removeItem(JOB_STORAGE_KEY);
        setJobId(null);
        return true;
      }

      const data = await response.json();
      setJob(data);

      if (data.status === "failed") {
        setError(data.error || "Something went wrong while generating your video. Please try again.");
        sessionStorage.removeItem(JOB_STORAGE_KEY);
        return true;
      }
      if (data.status === "completed") {
        sessionStorage.removeItem(JOB_STORAGE_KEY);
        return true;
      }
      return false;
    } catch {
      // A single failed poll is not a failed job — generation continues on
      // the server regardless. Stay quiet and try again on the next tick.
      return false;
    }
  }, []);

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const done = await poll(jobId);
      if (cancelled || done) return;
      pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
    };

    tick();

    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [jobId, poll]);

  // ── Start a job ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!result || starting || isRunning) return;

    setStarting(true);
    setError("");
    setJob(null);

    try {
      const response = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result,
          model: modelId,
          referenceImages,
          resolution,
          aspectRatio,
          generateAudio: true
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your video could not be started. Please try again.");
      if (!data.jobId) throw new Error("Your video could not be started. Please try again.");

      sessionStorage.setItem(JOB_STORAGE_KEY, data.jobId);
      setJobId(data.jobId);
      setJob({ status: "queued", progress: 0, message: data.message });
    } catch (err) {
      setError(err.message || "Your video could not be started. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  if (!result) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(145deg,#1A3636,#162d2d)", display: "flex", alignItems: "center", justifyContent: "center", color: "#D6BD98", fontFamily: "Georgia,serif" }}>
        <div>Loading...</div>
      </div>
    );
  }

  const progress = Math.max(0, Math.min(100, Number(job?.progress) || 0));
  const showBottomProgress = starting || isRunning;

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(145deg,#1A3636 0%,#162d2d 25%,#1A3636 50%,#142b2b 75%,#0f2222 100%)", color: "#D6BD98", fontFamily: "Georgia,serif", paddingBottom: showBottomProgress ? "72px" : "0" }}>
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 56px", borderBottom: "2.5px solid rgba(103,125,106,0.6)", background: "rgba(26,54,54,0.85)" }}>
        <div style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "0.16em", backgroundImage: "linear-gradient(90deg,#D6BD98,#677D6A,#D6BD98,#677D6A,#D6BD98)", backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textTransform: "uppercase", cursor: "pointer" }} onClick={() => router.push("/")}>Scenica</div>
        <button onClick={() => router.push("/script")} style={{ padding: "10px 24px", background: "rgba(64,83,76,0.4)", border: "2px solid rgba(103,125,106,0.5)", borderRadius: "30px", color: "#D6BD98", fontSize: "13px", cursor: "pointer" }}>← Back to script</button>
      </nav>

      <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 32px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "11px", letterSpacing: "0.18em", color: "#D6BD98", border: "2.5px solid rgba(103,125,106,0.5)", padding: "5px 15px", borderRadius: "20px", marginBottom: "20px", textTransform: "uppercase", background: "rgba(64,83,76,0.4)" }}>
          <span>✦</span> Video
        </div>

        <h1 style={{ fontSize: "clamp(30px,4vw,54px)", fontWeight: "300", marginBottom: "18px" }}>
          Bring your story to life
        </h1>
        <p style={{ color: "rgba(214,189,152,0.8)", lineHeight: "1.7", maxWidth: "760px", marginBottom: "32px" }}>
          Generate a {TOTAL_SECONDS}-second cinematic video from your script, with consistent characters, costumes,
          and setting throughout.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "start" }}>
          {/* ── Left: settings ── */}
          <div style={panel}>
            <h2 style={{ fontSize: "18px", marginBottom: "18px", letterSpacing: "0.08em", textTransform: "uppercase" }}>Settings</h2>

            <label style={{ display: "block", marginBottom: "18px" }}>
              <div style={labelStyle}>Quality</div>
              <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={isRunning} style={field}>
                {MODEL_TIERS.map((tier) => (
                  <option key={tier.id} value={tier.id}>{tier.label.replace(/^(Test|Standard|Final)\s*—\s*/, "")}</option>
                ))}
              </select>
              <div style={{ marginTop: "8px", fontSize: "12px", color: "rgba(214,189,152,0.65)", lineHeight: "1.6" }}>
                {selectedTier.description}
              </div>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
              <label>
                <div style={labelStyle}>Resolution</div>
                <select value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={isRunning} style={field}>
                  <option value="480p">480p</option>
                  <option value="720p">720p</option>
                  {selectedTier.maxResolution === "1080p" && <option value="1080p">1080p</option>}
                </select>
              </label>
              <label>
                <div style={labelStyle}>Aspect ratio</div>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} disabled={isRunning} style={field}>
                  <option value="16:9">16:9 — widescreen</option>
                  <option value="9:16">9:16 — vertical</option>
                  <option value="1:1">1:1 — square</option>
                  <option value="21:9">21:9 — cinematic</option>
                </select>
              </label>
            </div>

            {characterNames.length > 0 && (
              <div style={{ marginBottom: "20px", fontSize: "13px", color: "rgba(214,189,152,0.75)", lineHeight: "1.7" }}>
                <strong>Cast:</strong> {characterNames.join(", ")}
                {referenceImages.length > 0 ? " — reference photos included for consistency." : ""}
              </div>
            )}

            {error && (
              <div style={{ marginBottom: "20px", padding: "12px 14px", borderRadius: "12px", background: "rgba(255,80,80,0.12)", border: "1px solid rgba(255,120,120,0.5)", color: "#ffd0d0", lineHeight: "1.6", fontSize: "13px" }}>
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={starting || isRunning}
              style={{
                width: "100%",
                padding: "15px 18px",
                borderRadius: "16px",
                border: "none",
                background: "linear-gradient(135deg,#40534C,#677D6A)",
                color: "#D6BD98",
                fontWeight: 700,
                fontSize: "15px",
                cursor: starting || isRunning ? "wait" : "pointer",
                opacity: starting || isRunning ? 0.7 : 1
              }}
            >
              {starting || isRunning
                ? "Generating your video..."
                : job?.status === "completed"
                  ? "Generate again"
                  : "Generate video"}
            </button>
          </div>

          {/* ── Right: result ── */}
          <div style={panel}>
            <h2 style={{ fontSize: "18px", marginBottom: "18px", letterSpacing: "0.08em", textTransform: "uppercase" }}>Your video</h2>

            {job?.status === "completed" && job.videoUrl ? (
              <div>
                <video src={job.videoUrl} controls playsInline style={{ width: "100%", borderRadius: "16px", background: "#101f1f" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px" }}>
                  <span style={{ fontSize: "12px", color: "rgba(214,189,152,0.65)" }}>
                    ✓ {Math.round(job.durationSeconds || TOTAL_SECONDS)} seconds
                  </span>
                  <a
                    href={job.videoUrl}
                    download={`scenica-video.mp4`}
                    style={{ padding: "10px 18px", borderRadius: "999px", background: "rgba(64,83,76,0.6)", border: "1px solid rgba(103,125,106,0.8)", color: "#D6BD98", fontSize: "13px", textDecoration: "none" }}
                  >
                    Download
                  </a>
                </div>
              </div>
            ) : (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "220px",
                borderRadius: "16px",
                background: "rgba(16,31,31,0.5)",
                border: "1px dashed rgba(103,125,106,0.6)",
                color: "rgba(214,189,152,0.5)",
                fontSize: "13px",
                textAlign: "center",
                padding: "24px"
              }}>
                {isRunning ? "Your video is being created..." : "Your finished video will appear here."}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Bottom progress bar — the only visible sign generation is running.
          No stage names, no clip counts: one percentage and one short line,
          both already sanitized by the API before they reach the client. ── */}
      {showBottomProgress && (
        <div style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15,34,34,0.96)",
          borderTop: "1px solid rgba(103,125,106,0.6)",
          padding: "14px 32px",
          backdropFilter: "blur(6px)"
        }}>
          <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px", color: "rgba(214,189,152,0.85)" }}>
              <span>{job?.message || "Preparing your video..."}</span>
              <span>{progress}%</span>
            </div>
            <div style={{ height: "6px", borderRadius: "999px", background: "rgba(26,54,54,0.8)", overflow: "hidden" }}>
              <div style={{
                width: `${Math.max(4, progress)}%`,
                height: "100%",
                background: "linear-gradient(90deg,#677D6A,#D6BD98)",
                transition: "width 0.6s ease"
              }} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
