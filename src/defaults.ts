import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOME_DIR } from "./chrome.js";
import type { DownloadQuality } from "./flow.js";

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";

export interface ImageDefaults {
  model?: string;
  aspect_ratio?: AspectRatio;
  download_quality?: DownloadQuality;
  quantity?: number;
}

export interface VideoDefaults extends ImageDefaults {
  duration?: number;
  resolution?: "360p" | "720p";
  max_credits?: number;
}

export interface FlowDefaults {
  concurrency?: number;
  video?: VideoDefaults;
  image?: ImageDefaults;
}

export const DEFAULTS_FILE = () => join(HOME_DIR, "defaults.json");

function cleanObj<T extends Record<string, unknown>>(obj?: T): T | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return Object.keys(out).length ? (out as T) : undefined;
}

export function loadDefaults(): FlowDefaults {
  const file = DEFAULTS_FILE();
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as FlowDefaults;
    return {
      ...(typeof raw.concurrency === "number" ? { concurrency: Math.max(1, Math.min(4, Math.floor(raw.concurrency))) } : {}),
      ...(cleanObj(raw.video as Record<string, unknown>) ? { video: cleanObj(raw.video as Record<string, unknown>) as VideoDefaults } : {}),
      ...(cleanObj(raw.image as Record<string, unknown>) ? { image: cleanObj(raw.image as Record<string, unknown>) as ImageDefaults } : {}),
    };
  } catch {
    return {};
  }
}

export function saveDefaults(next: FlowDefaults): FlowDefaults {
  const cleaned: FlowDefaults = {
    ...(typeof next.concurrency === "number" ? { concurrency: Math.max(1, Math.min(4, Math.floor(next.concurrency))) } : {}),
    ...(cleanObj(next.video as Record<string, unknown>) ? { video: cleanObj(next.video as Record<string, unknown>) as VideoDefaults } : {}),
    ...(cleanObj(next.image as Record<string, unknown>) ? { image: cleanObj(next.image as Record<string, unknown>) as ImageDefaults } : {}),
  };
  const file = DEFAULTS_FILE();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cleaned, null, 2) + "\n", "utf8");
  return cleaned;
}

export function updateDefaults(patch: FlowDefaults): FlowDefaults {
  const cur = loadDefaults();
  return saveDefaults({
    concurrency: patch.concurrency ?? cur.concurrency,
    video: { ...(cur.video ?? {}), ...(patch.video ?? {}) },
    image: { ...(cur.image ?? {}), ...(patch.image ?? {}) },
  });
}

export function clearDefaults(scope: "all" | "video" | "image" | "concurrency" = "all", keys?: string[]): FlowDefaults {
  if (scope === "all" && !keys?.length) return saveDefaults({});
  const cur = loadDefaults();
  if (scope === "concurrency") {
    delete cur.concurrency;
    return saveDefaults(cur);
  }
  if (scope === "video" || scope === "image") {
    if (!keys?.length) {
      delete cur[scope];
    } else if (cur[scope]) {
      const target = cur[scope] as Record<string, unknown>;
      for (const k of keys) delete target[k];
    }
    return saveDefaults(cur);
  }
  if (keys?.length) {
    for (const k of keys) {
      if (k === "concurrency") delete cur.concurrency;
      if (cur.video) delete (cur.video as Record<string, unknown>)[k];
      if (cur.image) delete (cur.image as Record<string, unknown>)[k];
    }
  }
  return saveDefaults(cur);
}

// Splits any requested quantity (1..100) into Flow-sized composer submissions (max x4 per submission)
// with sequential variant offsets so downloaded files number cleanly as -v1..-vN without overwriting.
export function splitQuantity(quantity: number): { variants: number; offset: number }[] {
  const total = Math.max(1, Math.floor(quantity));
  const chunks: { variants: number; offset: number }[] = [];
  let offset = 0;
  while (offset < total) {
    const take = Math.min(4, total - offset);
    chunks.push({ variants: take, offset });
    offset += take;
  }
  return chunks;
}

export interface RawSceneInput {
  type: "video" | "image";
  model?: string;
  aspect_ratio?: AspectRatio;
  duration?: number;
  resolution?: "360p" | "720p";
  download_quality?: DownloadQuality;
  quantity?: number;
  variants?: number;
  max_credits?: number;
}

export interface ResolvedSceneSettings {
  model: string;
  aspect_ratio: AspectRatio;
  duration?: number;
  resolution?: "360p" | "720p";
  download_quality: DownloadQuality;
  quantity: number;
  concurrency: number;
  max_credits: number;
}

export function resolveSceneSettings(
  scene: RawSceneInput,
  callConcurrency: number | undefined,
  defaults: FlowDefaults = loadDefaults(),
): { ok: true; settings: ResolvedSceneSettings; usedDefaults: string[] } | { ok: false; missing: string[]; usedDefaults: string[] } {
  const isVideo = scene.type === "video";
  const bucket: VideoDefaults = isVideo ? (defaults.video ?? {}) : (defaults.image ?? {});
  const envConcurrency = process.env.FLOW_MCP_CONCURRENCY ? Math.max(1, Math.min(4, Math.floor(Number(process.env.FLOW_MCP_CONCURRENCY)) || 1)) : undefined;

  const usedDefaults: string[] = [];
  const pick = <K extends keyof VideoDefaults>(key: K, explicit: VideoDefaults[K]): VideoDefaults[K] => {
    if (explicit !== undefined) return explicit;
    if (bucket[key] !== undefined) {
      usedDefaults.push(`${scene.type}.${String(key)}=${String(bucket[key])}`);
      return bucket[key];
    }
    return undefined;
  };

  const model = pick("model", scene.model);
  const aspect_ratio = pick("aspect_ratio", scene.aspect_ratio);
  const download_quality = pick("download_quality", scene.download_quality);
  const explicitQty = scene.quantity ?? scene.variants;
  const quantity = pick("quantity", explicitQty);

  let concurrency = callConcurrency;
  if (concurrency === undefined && defaults.concurrency !== undefined) {
    concurrency = defaults.concurrency;
    usedDefaults.push(`concurrency=${defaults.concurrency}`);
  } else if (concurrency === undefined && envConcurrency !== undefined) {
    concurrency = envConcurrency;
    usedDefaults.push(`concurrency=${envConcurrency} (env)`);
  }

  let duration: number | undefined;
  let resolution: "360p" | "720p" | undefined;
  const isVeo = Boolean(model && /\bveo\b/i.test(model));
  const isOmni = Boolean(model && /\bomni\b/i.test(model));

  if (isVideo) {
    duration = isVeo ? (scene.duration ?? 8) : pick("duration", scene.duration);
    resolution = isVeo ? undefined : pick("resolution", scene.resolution);
  }

  const missing: string[] = [];
  if (!model) missing.push(isVideo ? "model (e.g. 'Omni 1.2 Flash', 'Omni 1.1 Flash', 'Veo 3.1 - Lite')" : "model (e.g. 'latest' / 'Nano Banana 2.1', 'Nano Banana Pro', 'Nano Banana 2 Lite')");
  if (!aspect_ratio) missing.push(isVideo ? "aspect_ratio ('16:9' or '9:16')" : "aspect_ratio ('16:9', '9:16', '1:1', '4:3', '3:4')");
  if (isVideo && !isVeo && duration === undefined) missing.push("duration (seconds: 3-15 for Omni 1.2, 4/6/8/10 for Omni 1.1)");
  if (isVideo && (isOmni || !model) && !resolution) missing.push("resolution ('360p' or '720p')");
  if (!download_quality) missing.push(isVideo ? "download_quality ('original', '720p', '1080p', or 'upscaled')" : "download_quality ('original' 1K or 'upscaled' 2K)");
  if (quantity === undefined) missing.push("quantity (how many takes to generate, e.g. 1, 4, 8, 12 — auto-splits >4 into parallel x4 batches)");
  if (concurrency === undefined) missing.push("concurrency (1-4 parallel Flow submissions)");

  if (missing.length) return { ok: false, missing, usedDefaults };

  const defaultMaxCredits = isVideo ? (bucket.max_credits ?? 25) : 0;
  const max_credits = scene.max_credits ?? defaultMaxCredits;
  if (scene.max_credits === undefined && isVideo && bucket.max_credits !== undefined) {
    usedDefaults.push(`video.max_credits=${bucket.max_credits}`);
  }

  return {
    ok: true,
    usedDefaults,
    settings: {
      model: model!,
      aspect_ratio: aspect_ratio!,
      duration,
      resolution,
      download_quality: download_quality!,
      quantity: quantity!,
      concurrency: concurrency!,
      max_credits,
    },
  };
}
