---
name: flow-reset
description: >-
  Reset or clear saved Google Flow global default rules (~/.flow-mcp/defaults.json) via
  flow_defaults. Triggered via the /flow-reset slash command (supports clearing all rules,
  video only, image only, or specific keys like model, resolution, duration, download_quality).
---

# Reset Google Flow Global Defaults (`/flow-reset`)

Clear saved global rules from `~/.flow-mcp/defaults.json` using the `flow` MCP server's `flow_defaults` tool.

## Procedure

1. **Parse optional scope or keys from the user's message**
   - Plain `/flow-reset` (or `/flow-reset all`): call `flow_defaults({ action: "clear", scope: "all" })`.
   - `/flow-reset video` or `/flow-reset image` or `/flow-reset concurrency`: call `flow_defaults({ action: "clear", scope })`.
   - Specific fields (e.g. `/flow-reset resolution`, `/flow-reset video model duration`, `/flow-reset image download_quality`): pass `scope` (`"video"`, `"image"`, or `"all"`) plus `keys: [...]` (valid keys: `model`, `aspect_ratio`, `duration`, `resolution`, `download_quality`, `quantity`, `max_credits`, `concurrency`).

2. **Confirm concisely**
   - Report what was cleared and show the remaining saved defaults (or confirm all global defaults are now empty so future `/flow` calls will ask for every unset setting again, while parallel batching stays automatic).
