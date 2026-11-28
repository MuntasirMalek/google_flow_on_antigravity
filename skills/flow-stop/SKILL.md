---
name: flow-stop
description: >-
  Immediately stop and abort all running or queued Google Flow jobs via flow_stop and unlock
  the Flow tab. Triggered via the /flow-stop slash command or when the user asks to stop or
  abort running Flow generations/downloads.
---

# Stop Running Google Flow Jobs (`/flow-stop`)

Immediately abort all active and queued Flow jobs using the `flow` MCP server's `flow_stop` tool.

## Procedure

1. Call `flow_stop({ clear_finished })`:
   - Pass `clear_finished: true` if the user also asked to clear finished/failed job history (e.g. `/flow-stop clear`); otherwise `clear_finished: false`.
2. Report concisely:
   - How many running and queued jobs were stopped.
   - Remind the user that any images/videos already rendered inside Flow are still safe in their Flow project and can be downloaded anytime with `flow_assets` + `flow_download` (0 credits).
   - If the Flow tab itself was stuck or downloads were failing, suggest `/flow-restart` (or `/flow-restart browser` for a full browser relaunch).
