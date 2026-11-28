import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export class FlowAbortedError extends Error {
  constructor(message = "Stopped by user.") {
    super(message);
    this.name = "FlowAbortedError";
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof FlowAbortedError || (err instanceof Error && err.name === "AbortError");
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = typeof signal.reason === "string" && signal.reason.trim() ? signal.reason : "Stopped by user.";
  throw new FlowAbortedError(reason);
}

export function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new FlowAbortedError(typeof signal.reason === "string" ? signal.reason : "Stopped by user."));
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new FlowAbortedError(typeof signal?.reason === "string" ? signal.reason : "Stopped by user."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface SceneParams {
  prompt: string;
  type: "video" | "image";
  max_credits: number;
  duration?: number;
  resolution?: "360p" | "720p";
  model?: string;
  aspect_ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
  variants?: number;
  variant_offset?: number;
  total_quantity?: number;
  first_frame?: string;
  first_frame_at?: number;
  last_frame?: string;
  reference_images?: string[];
  chain_from?: string;
  reference_from?: string;
  edit_asset?: string;
  agent_scenes?: string[];
  // The scene number each agent scene is saved as. A retry of scenes 7 and 12 keeps scene-07 and scene-12; without it
  // the numbers run on from file_stem.
  agent_numbers?: number[];
  // Reference images for an agent batch: attached once as ingredients in the agent composer (absolute paths, uploaded
  // once, or "asset:<title>"), with a short name each, plus which of them every scene uses (names, per scene).
  agent_refs?: { image: string; name: string }[];
  agent_scene_refs?: string[][];
  // Flow asset names of agent_refs after upload, so a retry round re-attaches without uploading again.
  agent_ref_assets?: string[];
  continue_from?: string;
  attach?: string[];
  continue_mode?: "exact" | "likeness";
  retries?: number;
  download_quality?: "original" | "720p" | "1080p" | "upscaled";
  concurrency?: number;
  output_dir: string;
  file_stem: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  params: SceneParams;
  files: string[];
  attempts: number;
  credits?: number;
  progress?: string;
  note?: string;
  error?: string;
  // Scene numbers a batch still could not make after all its own retries; flow_retry redoes just these.
  failed_scenes?: number[];
  createdAt: string;
  finishedAt?: string;
}

export type JobRunner = (job: Job, signal: AbortSignal) => Promise<string[]>;
export type BatchRunner = (jobs: Job[], concurrency: number, signal: AbortSignal) => Promise<void>;

export interface StopSummary {
  stopped_running: number;
  cancelled_queued: number;
  cleared_finished: number;
  stopped_ids: string[];
}

// Flow is driven like a careful person would: by default one generation at a time, with a
// randomised pause between them. Opt-in concurrency (2-4) overlaps independent scenes in Flow's
// normal composer (Agent off), while chained scenes remain strictly serial.
const PAUSE_MIN_MS = Number(process.env.FLOW_MCP_PAUSE_MIN_S ?? 25) * 1000;
const PAUSE_MAX_MS = Number(process.env.FLOW_MCP_PAUSE_MAX_S ?? 70) * 1000;
export const DEFAULT_CONCURRENCY = Math.max(1, Math.min(4, Math.floor(Number(process.env.FLOW_MCP_CONCURRENCY ?? 4)) || 4));

function effectiveConcurrency(job: Job): number {
  const n = job.params.concurrency ?? DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(4, Math.floor(n) || 1));
}

function isParallelEligible(job: Job): boolean {
  const p = job.params;
  return (
    effectiveConcurrency(job) > 1 &&
    !p.chain_from &&
    !p.reference_from &&
    !p.continue_from &&
    !p.agent_scenes &&
    !p.edit_asset
  );
}

export class JobQueue {
  private jobs = new Map<string, Job>();
  private working = false;
  private lastFinished = 0;
  private currentAbort: AbortController | null = null;
  private runEpoch = 0;
  pausedReason: string | null = null;

  constructor(
    private runner: JobRunner,
    private batchRunner?: BatchRunner,
  ) {}

  add(params: SceneParams): Job {
    const job: Job = {
      id: randomUUID().slice(0, 8),
      status: "queued",
      params,
      files: [],
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    // Defer starting the worker to a microtask so a synchronous loop of add() calls (like flow_generate) finishes
    // enqueuing the whole batch before work() inspects the queue for parallel grouping.
    queueMicrotask(() => void this.work());
    return job;
  }

  get busy(): boolean {
    return this.list().some((j) => j.status === "running");
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(): Job[] {
    return [...this.jobs.values()];
  }

  // Puts a failed or cancelled job back in line with the same settings and file name.
  retry(id: string): Job | undefined {
    const job = this.jobs.get(id);
    if (job && (job.status === "failed" || job.status === "cancelled")) {
      job.status = "queued";
      job.error = undefined;
      job.finishedAt = undefined;
      queueMicrotask(() => void this.work());
    }
    return job;
  }

  cancel(id: string, force = false): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.status === "queued") {
      job.status = "cancelled";
      job.progress = undefined;
      job.finishedAt = new Date().toISOString();
      return job;
    }
    if (job.status === "running") {
      if (!force) {
        throw new Error(
          `Job ${id} is currently running. Pass force: true to abort it, or call flow_stop to stop all running & queued jobs cleanly.`,
        );
      }
      // Abort the active worker cycle so the running job (and any sibling batch slot sharing the Flow tab) stops promptly.
      this.stopAll(`Cancelled job ${id}`, false);
      return job;
    }
    return job;
  }

  // Immediately aborts any running generation/download/pacing wait, cancels all queued & running jobs,
  // and releases the Flow tab lock so flow_assets / flow_download / flow_restart / flow_generate can run right away.
  stopAll(reason = "Stopped by user", clearFinished = false): StopSummary {
    this.runEpoch++;
    const ctrl = this.currentAbort;
    this.currentAbort = null;
    if (ctrl && !ctrl.signal.aborted) ctrl.abort(reason);
    this.pausedReason = null;
    this.working = false;
    this.lastFinished = 0;

    const now = new Date().toISOString();
    let stopped_running = 0;
    let cancelled_queued = 0;
    const stopped_ids: string[] = [];

    for (const job of this.jobs.values()) {
      if (job.status === "running" || job.status === "queued") {
        if (job.status === "running") stopped_running++;
        else cancelled_queued++;
        job.status = "cancelled";
        job.progress = undefined;
        job.note = [job.note, reason].filter(Boolean).join(" · ");
        job.finishedAt = now;
        stopped_ids.push(job.id);
      }
    }

    let cleared_finished = 0;
    if (clearFinished) {
      for (const [id, job] of this.jobs.entries()) {
        if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
          this.jobs.delete(id);
          cleared_finished++;
        }
      }
    }

    return { stopped_running, cancelled_queued, cleared_finished, stopped_ids };
  }

  clearHistory(): number {
    let cleared = 0;
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
        this.jobs.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  private async work(): Promise<void> {
    if (this.working) return;
    this.working = true;
    const myEpoch = this.runEpoch;
    const ctrl = new AbortController();
    this.currentAbort = ctrl;
    const signal = ctrl.signal;

    try {
      for (;;) {
        if (myEpoch !== this.runEpoch || signal.aborted) return;
        const queued = this.list().filter((j) => j.status === "queued");
        const job = queued[0];
        if (!job) return;
        if (this.lastFinished) {
          const pause = PAUSE_MIN_MS + Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
          const remaining = this.lastFinished + pause - Date.now();
          if (remaining > 0) {
            this.pausedReason = `pacing: next generation in ${Math.ceil(remaining / 1000)}s`;
            try {
              await sleepAbortable(remaining, signal);
            } catch (err) {
              if (isAbortError(err)) return;
              throw err;
            } finally {
              if (myEpoch === this.runEpoch) this.pausedReason = null;
            }
          }
        }
        if (myEpoch !== this.runEpoch || signal.aborted) return;
        if (job.status !== "queued") continue;

        // Collect a contiguous run of independent parallel-eligible jobs so one coordinator drives Flow's composer
        // with up to `concurrency` renders in flight while respecting chained/serial barriers.
        if (this.batchRunner && isParallelEligible(job)) {
          const run: Job[] = [];
          const cap = effectiveConcurrency(job);
          for (const candidate of this.list()) {
            if (candidate.status !== "queued") continue;
            if (!isParallelEligible(candidate)) {
              if (run.length) break;
              continue;
            }
            if (effectiveConcurrency(candidate) !== cap) break;
            run.push(candidate);
          }
          if (run.length >= 2) {
            try {
              await this.batchRunner(run, cap, signal);
            } catch (err) {
              if (isAbortError(err) || myEpoch !== this.runEpoch || signal.aborted) return;
              const msg = err instanceof Error ? err.message : String(err);
              const now = new Date().toISOString();
              for (const j of run) {
                if (j.status === "queued" || j.status === "running") {
                  j.status = "failed";
                  j.progress = undefined;
                  j.error = msg;
                  j.finishedAt = now;
                }
              }
            }
            if (myEpoch !== this.runEpoch || signal.aborted) return;
            this.lastFinished = Date.now();
            continue;
          }
        }

        job.status = "running";
        job.attempts++;
        try {
          job.files = await this.runner(job, signal);
          if (myEpoch !== this.runEpoch || signal.aborted) return;
          job.status = "done";
          job.error = undefined;
        } catch (err) {
          if (isAbortError(err) || myEpoch !== this.runEpoch || signal.aborted) return;
          job.error = err instanceof Error ? err.message : String(err);
          // Failed tiles are already retried inside Flow (its own Retry button); only an agent that produced nothing
          // is re-queued here. Timeouts are never retried automatically: they may still have spent credits.
          const retryable = /agent finished without creating/i.test(job.error);
          job.status = retryable && job.attempts <= (job.params.retries ?? 1) ? "queued" : "failed";
        }
        job.finishedAt = new Date().toISOString();
        this.lastFinished = Date.now();
      }
    } finally {
      if (myEpoch === this.runEpoch) {
        this.working = false;
        if (this.currentAbort === ctrl) this.currentAbort = null;
        this.pausedReason = null;
      }
    }
  }
}
