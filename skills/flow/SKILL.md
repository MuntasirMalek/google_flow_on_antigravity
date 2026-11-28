---
name: flow
description: >-
  Generate videos and images in Google Flow via the flow-mcp server, manage global Flow
  generation defaults, and assemble or download Flow media. Triggered via the /flow slash
  command or whenever the user mentions "flow" to generate AI videos/images or configure
  Google Flow defaults.
---

# Google Flow on Antigravity (`/flow`)

Use the `flow` MCP server to drive Google Flow in parallel through the normal composer (Flow Agent off), while respecting the user's saved global defaults and never guessing unspecified settings.

## Procedure

1. **Always check session & global defaults first**
   - Call `flow_status` (`detailed: true`).
   - Inspect `flow` (signed-in status, open project, plan, `credits_remaining`) and `defaults` (the user's saved global rules from `~/.flow-mcp/defaults.json`).
   - If `flow.hint` says the user is signed out, tell them to run `npm run login` in their `flow-mcp` folder and stop. If signed in with no project open, offer to open or create one with `flow_new_project`.

2. **Handle global rule, stop, and restart requests (`flow_defaults`, `flow_stop`, `flow_restart`)**
   - When the user says *"stop"*, *"cancel all"*, *"abort flow"* (or runs `/flow-stop`), call `flow_stop({})` immediately and report how many running/queued jobs were stopped.
   - When the user says *"restart flow"*, *"reload flow"*, *"relaunch flow browser"* (or runs `/flow-restart`), call `flow_restart({ mode: "browser" })` if they asked to relaunch the browser / fix broken Chrome downloads, or `flow_restart({ mode: "soft" })` otherwise.
   - When the user says things like *"always use Omni 1.1 Flash"*, *"set global download quality to 720p"*, *"always generate 3 in parallel"*, or *"clear my global video defaults"* (or runs `/flow-reset`), call `flow_defaults`:
     - `action: "set"` with `concurrency`, `video: { ... }`, and/or `image: { ... }`
     - `action: "get"` to show current saved rules
     - `action: "clear"` with optional `scope` (`"all" | "video" | "image" | "concurrency"`) and `keys`
   - Confirm the saved rules back to the user concisely.

3. **Ask ONLY for settings that are NOT saved globally (and NOT already stated)**
   - `flow_generate` enforces required settings in code after merging saved global defaults with per-call values.
   - **NEVER ask the user how many batches to run in parallel** — parallel batching (`concurrency` up to 4) is automatic by default whenever `quantity > 4` or multiple independent scenes are requested. Only change `concurrency` if the user explicitly asks or saved a global rule.
   - **NEVER ask for `quantity` if the user already stated a count** (e.g. *"9 cyberpunk dog images"* → `quantity: 9`).
   - Compare what the user already gave + `defaults` from step 1 against the required fields:
     - **Video scenes (`type: "video"`):**
       - `model` (`Omni 1.2 Flash` **(Recommended)**, `Omni 1.1 Flash`, `Veo 3.1 - Lite`)
       - `duration` (`10` s **(Recommended)**, `15` s, `8` s, `6` s, `4` s — Omni 1.2 accepts `3`–`15` s; Omni 1.1 `4`/`6`/`8`/`10` s; Veo 3.1 fixed `8` s; for longer total films like 30s, ask per-clip length e.g. `3×10s` vs `2×15s`)
       - `resolution` (`360p` **(Recommended)** or `720p`, for Omni models)
       - `download_quality` (`720p` **(Recommended)**, `original` matching gen resolution, `1080p`, or `upscaled`)
       - `aspect_ratio` (`16:9` **(Recommended)** or `9:16`)
       - `quantity` (`1` **(Recommended)**, `2`, `4`, or any number `1`–`100` — always ask variation/quantity for video unless saved globally or explicitly stated as a variation count; quantities above 4 automatically split into parallel `x4` batches)
     - **Image scenes (`type: "image"`):**
       - `model` (`latest` / `Nano Banana 2.1` **(Recommended)**, `Nano Banana Pro`, `Nano Banana 2 Lite`)
       - `aspect_ratio` (`16:9` **(Recommended)**, `9:16`, `1:1`, `4:3`, `3:4`)
       - `download_quality` (`upscaled` 2K **(Recommended)** or `original` 1K)
       - `quantity` (`1` **(Recommended)**, `2`, `4`, or `1`–`100` takes per prompt — quantities above 4 automatically split into parallel `x4` batches)
   - If any required setting above is still unset, ask ONLY those missing items — **always include the download quality option** (and for videos, always include **length** and **variation/quantity**) unless saved in global defaults. Keep it short; no filler questions. In multiple-choice prompts (`ask_question`), always put these first as `(Recommended)`:
     - **Images:** Model `Nano Banana 2.1 (latest)`, Aspect `16:9`, Download quality **`Upscaled (2K)`**, Quantity **`1`** (when unset).
     - **Videos:** Model **`Omni 1.2 Flash`**, Clip length **`10s`**, Generate quality **`360p`**, Download quality **`720p`**, Variation/quantity **`1`**, Aspect **`16:9`**.
   - **ALWAYS include one final question in that SAME prompt (`ask_question` / settings prompt) letting the user pick which (if any) of the asked settings to save as global defaults:**
     - **When 2 or more settings were asked**, make this final question **multi-select (`is_multi_select: true`)** so the user can save **only specific settings** (e.g. just `Model`, or `Model` + `Download quality`) without locking the rest:
       - Question: *"Which of these settings should I save as global defaults for future `/flow` runs?"*
       - Options:
         1. `(Recommended) None — use for this run only`
         2. `All of these settings`
         3. One option per setting actually asked in this prompt (e.g. `Model`, `Aspect ratio`, `Download quality`, `Clip length (duration)`, `Generate quality (resolution)`, `Variation / quantity` — list ONLY the fields asked above).
     - **When only 1 setting was asked**, use single-select (`is_multi_select: false`):
       - Question: *"Save this `<setting>` as a global default for future `/flow` runs?"*
       - Options:
         1. `(Recommended) No — use for this run only`
         2. `Yes — save as global default (reset anytime with /flow-reset)`
     - Never omit this question whenever asking for one or more missing settings, and **never** push it into a separate follow-up round.

4. **Save chosen global defaults (if any) & execute immediately — NEVER ask a second confirmation round**
   - Once the user answers their settings once:
     - If they picked **`All of these settings`** (or `Yes` on a 1-setting prompt), call `flow_defaults({ action: "set", ... })` for all settings asked in this prompt (under `video` or `image`).
     - If they checked **specific setting(s)** (e.g. only `Model`, or `Model` + `Download quality`, or named fields via `Other`), call `flow_defaults({ action: "set", ... })` with **ONLY those selected fields** — leave unchecked fields unsaved so `/flow` continues asking for them on future runs.
     - If they picked only **`None — use for this run only`** (or `No` / skipped), leave `~/.flow-mcp/defaults.json` unchanged.
     - Never save a one-off `quantity` that was only stated in the user's original prompt (e.g. *"make 10 thumbnails"*) unless `quantity` was asked and selected (or explicitly requested to be saved globally).
     - Queue the generation with `flow_generate` right away in the same turn — do **NOT** ask a second round of follow-up questions.
   - Images cost **0 credits** (both 1K and 2K download).
   - If the user picks `360p` generate + `1080p` download on video, execute immediately: Flow downloads its `720p Upscaled` and `flow-mcp` automatically finishes the clip to `1080p` (`1920×1080` / `1080×1920`) locally via FFmpeg at 0 extra credits (and pass `size: "1920x1080"` or `"1080x1920"` to `flow_assemble` when stitching).
   - Set `max_credits` with headroom for Flow's paid `720p` upscale on `360p` clips (e.g. `25` for a 15s 360p clip = `20` gen + `5` upscale) so downloads are never skipped. Only stop early if the user's actual credit balance is genuinely too low to cover the requested clips.

5. **Queue, wait, and report**
   - Send all scenes in one `flow_generate` call with the confirmed settings. Outputs automatically download to `~/Downloads/<project>/` (or `FLOW_MCP_OUTPUT`).
   - Poll with `flow_wait` until `finished: true`.
   - Report every downloaded file with clickable `file://` links, actual credits used, and any retryable failures (`flow_retry`).
