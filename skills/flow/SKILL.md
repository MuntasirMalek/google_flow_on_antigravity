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

2. **Handle global rule requests (`flow_defaults`)**
   - When the user says things like *"always use Omni 1.1 Flash"*, *"set global download quality to 720p"*, *"always generate 3 in parallel"*, or *"clear my global video defaults"*, call `flow_defaults`:
     - `action: "set"` with `concurrency`, `video: { ... }`, and/or `image: { ... }`
     - `action: "get"` to show current saved rules
     - `action: "clear"` with optional `scope` (`"all" | "video" | "image" | "concurrency"`) and `keys`
   - Confirm the saved rules back to the user concisely.

3. **Ask ONLY for settings that are NOT saved globally (and NOT already stated)**
   - `flow_generate` enforces all required settings in code after merging saved global defaults with per-call values.
   - Compare what the user already gave + `defaults` from step 1 against the required fields:
     - **Video scenes (`type: "video"`):**
       - `model` (`Omni 1.2 Flash`, `Omni 1.1 Flash`, `Veo 3.1 - Lite`)
       - `duration` (`3`–`15` s on Omni 1.2; `4`/`6`/`8`/`10` s on Omni 1.1; fixed `8` s on Veo 3.1)
       - `resolution` (`360p` or `720p`, for Omni models)
       - `download_quality` (`original`, `720p`, `1080p`, or `upscaled`)
       - `aspect_ratio` (`16:9` or `9:16`)
       - `quantity` (`1`–`100` takes per prompt — quantities above 4 automatically split into parallel `x4` batches!)
       - `concurrency` (`1`–`4` parallel Flow submissions)
     - **Image scenes (`type: "image"`):**
       - `model` (`latest` / `Nano Banana 2.1`, `Nano Banana Pro`, `Nano Banana 2 Lite`)
       - `aspect_ratio` (`16:9`, `9:16`, `1:1`, `4:3`, `3:4`)
       - `download_quality` (`original` 1K or `upscaled` 2K)
       - `quantity` (`1`–`100` takes per prompt — quantities above 4 automatically split into parallel `x4` batches!)
       - `concurrency` (`1`–`4` parallel submissions) — or `flow_agent_images` for large prompt lists (up to 50 distinct scenes at once).
   - If any required setting is still unset, ask the user **only** for the missing ones (use multiple-choice `ask_question` when available, and mention they can say *"save as global default"* for anything they want remembered).

4. **Confirm credit spend before paid runs**
   - Images cost **0 credits**.
   - For videos, compute and state the expected total credits before queueing (e.g. Omni 1.2 Flash 360p = 1 cr/s up to 10 s, 720p = 3 cr/s up to 10 s; Omni 1.1 Flash 360p = 4/5/6/7 cr, 720p = 7/10/12/15 cr; Veo 3.1 Lite = 10 cr).
   - Set `max_credits` per submission cleanly so `x4` split batches aren't falsely blocked while still capping overspend.

5. **Queue, wait, and report**
   - Send all scenes in one `flow_generate` call with the confirmed settings.
   - Poll with `flow_wait` until `finished: true`.
   - Report every saved file with clickable `file://` links, actual credits used, and any retryable failures (`flow_retry`).
