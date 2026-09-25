// ═══════════════════════════════════════════════════════════════════════════
// videoJobs.js — in-process job registry for the 45s video pipeline
//
// ROOT CAUSE this file exists to fix:
//   The job Map used to live at module scope inside the route file. Next.js
//   hot-reloads route modules in dev on every save, which creates a FRESH
//   module instance — and with it a fresh, empty Map. A job started before an
//   edit became unreachable straight afterwards, so the browser's very next
//   poll got a 404 "Job not found" and the UI reported failure on a render
//   that was actually still running fine.
//
//   Pinning the registry to globalThis makes it survive module reloads, which
//   is the standard Next.js pattern for dev-time singletons.
//
// Scope note: this is a single-process store, which is the right fit for a
// locally-run app. It is not shared across multiple server instances.
// ═══════════════════════════════════════════════════════════════════════════

const JOB_KEY = Symbol.for("scenica.videoJobs");
const FILE_KEY = Symbol.for("scenica.videoFiles");

// Finished jobs are evicted after this long to bound memory on a long dev session.
const JOB_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_JOBS = 40;

function jobStore() {
  if (!globalThis[JOB_KEY]) globalThis[JOB_KEY] = new Map();
  return globalThis[JOB_KEY];
}

function fileStore() {
  if (!globalThis[FILE_KEY]) globalThis[FILE_KEY] = new Map();
  return globalThis[FILE_KEY];
}

function prune() {
  const store = jobStore();
  const now = Date.now();

  for (const [id, job] of store) {
    const finishedAt = job.finishedAtMs;
    if (finishedAt && now - finishedAt > JOB_TTL_MS) store.delete(id);
  }

  // Hard cap as a backstop, oldest first.
  if (store.size > MAX_JOBS) {
    const ordered = [...store.entries()].sort((a, b) => (a[1].createdAtMs || 0) - (b[1].createdAtMs || 0));
    for (const [id] of ordered.slice(0, store.size - MAX_JOBS)) store.delete(id);
  }
}

export function createJob(jobId, initial = {}) {
  prune();
  const job = {
    jobId,
    status: "queued",
    stage: "queued",
    message: "Queued for generation.",
    progress: 0,
    segments: [],
    warnings: [],
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now(),
    ...initial
  };
  jobStore().set(jobId, job);
  return job;
}

export function updateJob(jobId, updates = {}) {
  const store = jobStore();
  const current = store.get(jobId);
  if (!current) return null;
  const next = { ...current, ...updates, jobId, updatedAt: new Date().toISOString() };
  if (updates.status === "completed" || updates.status === "failed") {
    next.finishedAtMs = Date.now();
  }
  store.set(jobId, next);
  return next;
}

export function getJob(jobId) {
  return jobStore().get(jobId) || null;
}

export function registerVideoFile(key, filePath) {
  fileStore().set(key, filePath);
}

export function getVideoFile(key) {
  return fileStore().get(key) || null;
}
