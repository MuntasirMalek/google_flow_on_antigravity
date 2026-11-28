---
name: flow-restart
description: >-
  Stop stuck Flow jobs, reset Chrome CDP downloads, and reload the Flow project tab or
  cleanly relaunch the dedicated Flow Chrome/Brave browser via flow_restart. Triggered via
  the /flow-restart slash command or when Flow downloads/generations stall.
---

# Restart Google Flow (`/flow-restart`)

Recover cleanly from a stuck generation, broken download channel, or sleep-disconnected session using the `flow` MCP server's `flow_restart` tool — without disconnecting Antigravity.

## Procedure

1. Pick the restart mode from the user's request:
   - Default (`/flow-restart` or `/flow-restart soft`): call `flow_restart({ mode: "soft" })` — stops any running/queued jobs, resets the browser CDP download monitor, and reloads the active Flow project tab in English (~3s).
   - Full browser relaunch (`/flow-restart browser` or `/flow-restart hard` or if soft restart didn't unstick Chrome downloads): call `flow_restart({ mode: "browser" })` — stops all jobs, cleanly closes and relaunches the dedicated Flow Chrome/Brave profile (re-enabling `automatic_downloads` and `prompt_for_download: false`), and reopens the exact Flow project URL (~8s).
   - Pass `clear_jobs: true` if the user also asked to clear old job history.
2. Confirm concisely:
   - Report the reopened Flow project URL, signed-in status, and how many stuck jobs were stopped.
   - If finished assets were waiting in Flow before the restart, offer to fetch them with `flow_assets` / `flow_download` (0 credits) right away.
