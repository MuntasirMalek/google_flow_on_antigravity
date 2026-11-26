# Google Flow on Antigravity (`google_flow_on_antigravity`)

Drive **Google Flow** (`flow.google.com`) directly from **Google Antigravity** (via `/flow` or plain chat), Claude, Codex, or the built-in local **Flow Studio** control panel — using your own Google AI Flow credits instead of the pay-per-use video API. No browser extension required.

> Based on [GTAI-1/flow-mcp](https://github.com/GTAI-1/flow-mcp) (ISC License), enhanced specifically for **Antigravity**, **parallel multi-clip generation**, **unlimited quantity batching**, **global user rules**, and **zero-popup Brave/Chrome automation**.

```text
Antigravity (/flow) ──stdio──> flow-mcp ──CDP (port 9333)──> Dedicated Brave/Chrome Profile ──> Google Flow
```

---

## Key Features & Enhancements

- **`/flow` Antigravity Skill included ([skills/flow/SKILL.md](skills/flow/SKILL.md)):** Type `/flow ...` (or just mention `flow`) in Antigravity chat to generate videos/images, set global rules, or check credits.
- **Parallel Normal-Composer Generation (automatic up to 4, Flow Agent OFF):** Automatically overlaps up to 4 independent video or image submissions in Flow simultaneously with human-paced staggers (`FLOW_MCP_SUBMIT_STAGGER_S`), matching finished out-of-order tiles back to exact scenes via `Reuse prompt`, while keeping `chain_previous` / `reference_previous` strictly serial (override `concurrency: 1–4` anytime via `flow_defaults` or per call).
- **Unlimited `quantity` (`1–100` takes per prompt):** Flow's UI caps a single submission at `x4`. Asking for `quantity: 10` (images or videos) automatically splits into parallel `x4 + x4 + x2` batches and numbers outputs cleanly as `scene-01-v1` … `scene-01-v10`.
- **Global Rules (`flow_defaults`) + Ask-Only-What's-Missing Enforcement:** Save any subset of favorite rules once in `~/.flow-mcp/defaults.json` (e.g., *"always use Omni 1.1 Flash, gen 360p, download 720p, 3 parallel"*). `flow_generate` merges your global rules with explicit per-call overrides and **refuses to guess** any unset required setting — so the assistant asks **only** for settings you haven't locked globally.
- **Strict Model Verification & Paid-Upscale Guard:** Verifies Flow's model dropdown actually switched to your requested model before spending credits; supports explicit `download_quality` (`original`, `720p`, `1080p`, `upscaled`) and checks paid upscales (e.g. `720p Upscaled · 1 credit`) against `max_credits`.
- **Auto-Dismiss Flow Onboarding & Default Agent Side Panel:** Automatically steps through Flow's `<flow-change-log-modal>` (`iframe[title="Changelog"]`) and closes the default Agent side panel (`right_panel_close`) on fresh profiles.
- **Zero-Popup Dedicated Brave & Chrome Support:** Automatically falls back to Brave if Chrome isn't installed, or set `FLOW_MCP_CHROME` to Brave. Uses an isolated persistent profile (`~/.flow-mcp/chrome-profile`) — sign in **once**, and it stays signed in across window closes and reboots with zero remote-debugging popups.
- **Shared `~/Downloads` Protection & UK English (`en-GB`) Support:** Filters `~/Downloads` fallback strictly to Flow downloads (`isFlowDownloadName`) so unrelated personal files are never moved, and supports both `Move to trash` and `Move to bin`.

---

## What You Need

| Requirement | Notes |
|---|---|
| **macOS, Windows 10/11, or Linux** | Tested on macOS; cross-platform Chrome/Brave & Trash support included |
| **Node.js 22+** | Check with `node --version` |
| **Google Chrome or Brave Browser** | Any recent version |
| **A Google Account** | Free (50 Flow credits/day; stills are 0 credits) or Google AI Pro/Ultra |
| **FFmpeg** *(optional)* | Needed for `flow_assemble` and `flow_narrate` (`brew install ffmpeg` / `port install ffmpeg` / `winget install Gyan.FFmpeg`) |
| **whisper.cpp** *(optional)* | Only for `flow_captions` / `flow_transcribe` |

---

## Install & Connect to Antigravity

### 1. Clone and build
> **macOS note:** Put the folder directly in your home directory (`~/google_flow_on_antigravity` or `~/flow-mcp`), **not** inside `~/Desktop`, `~/Documents`, or `~/Downloads`, to avoid macOS `EPERM` permission errors.

```bash
cd ~
git clone https://github.com/MuntasirMalek/google_flow_on_antigravity.git
cd google_flow_on_antigravity
npm install
npm run build
```

### 2. Sign in once (persistent, zero popups)
```bash
npm run login
# Or to use Brave explicitly on macOS:
FLOW_MCP_CHROME="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" npm run login
```
Sign into your Google account in the dedicated window that opens and open (or create) a Flow project. Your session is saved permanently in `~/.flow-mcp/chrome-profile` — even if you close the window or reboot, you stay signed in.

### 3. Add the MCP server to Antigravity
Edit `~/.gemini/config/mcp_config.json` and add the `flow` entry (use the full path from `which node` on macOS if Node is installed via Homebrew or MacPorts):

```json
{
  "mcpServers": {
    "flow": {
      "command": "/opt/local/bin/node",
      "args": ["/Users/YOUR_USERNAME/google_flow_on_antigravity/dist/index.js"],
      "env": {
        "PATH": "/opt/local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        "FLOW_MCP_CHROME": "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
      }
    }
  }
}
```
*(Omit `FLOW_MCP_CHROME` if you want Google Chrome.)*

### 4. Install the `/flow` slash command in Antigravity
```bash
mkdir -p ~/.gemini/config/skills/flow
cp skills/flow/SKILL.md ~/.gemini/config/skills/flow/SKILL.md
```
Refresh MCP servers in Antigravity (**Skills & Customizations → MCP Servers**) or restart Antigravity.

---

## Using `/flow` in Antigravity Chat

- **Set global rules once (optional):**
  > `/flow always use Omni 1.1 Flash, gen 360p, download 720p, 16:9, and 3 parallel for videos`
- **Generate videos or images (asks ONLY what isn't saved globally):**
  > `/flow make 10 cyberpunk cat images`
  > `/flow create 3 documentary clips about deepfakes`
- **Override for a single run without changing global rules:**
  > `/flow make 2 videos in 720p with Omni 1.2 Flash, 8s`
- **Clear a global rule anytime:**
  > `/flow clear my global video resolution default`

---

## Local Control Panel (Flow Studio)

You can also drive everything visually in your browser at **http://127.0.0.1:8787** while Antigravity is running, or launch it standalone:

```bash
npm run studio
```

Both **Shots** and **Frames** tabs include **Quantity** (with `>4` automatic parallel splitting) and **Parallel (1–4)** controls.

---

## Tools Reference

| Tool | Purpose |
|---|---|
| `flow_status` | Session state (signed in, project open, plan, credits), saved global `defaults`, queue, pacing, and playbook |
| `flow_defaults` | `get`, `set`, or `clear` persistent global rules (`~/.flow-mcp/defaults.json`) for video, image, and concurrency |
| `flow_generate` | Queue videos/images in normal composer (Agent off) with `quantity` (`1–100`, auto-splitting `>4` into parallel `x4` batches), `concurrency` (`1–4`), `download_quality` (`original`/`720p`/`1080p`/`upscaled`), and hard validation for unset settings |
| `flow_wait` | Wait for queued jobs or slow `task_id`s and return file paths & status |
| `flow_cancel` / `flow_retry` | Cancel queued jobs or retry failed jobs / failed scenes |
| `flow_assets` / `flow_download` / `flow_trash` | List, download (free, incl. collections/upscales), or move project assets to Trash/Bin |
| `flow_agent_images` | Fast image batch (up to 50 scenes) via Flow Agent mode, downloaded as one ZIP |
| `flow_edit` / `flow_continue` | Video-to-video restyle or frame-exact / likeness-locked continuation |
| `flow_character` / `flow_character_edit` / `flow_characters` | Reusable characters locked across scenes |
| `flow_techniques` | 39 film-technique prompt presets |
| `flow_narrate` / `flow_voices` | Local Kokoro (28 English voices) or free Google AI Studio Gemini TTS (multilingual) |
| `flow_assemble` / `flow_presenter` | Local FFmpeg stitching, music ducking, timed `voice_lines`, picture-in-picture presenter |
| `flow_transcribe` / `flow_captions` | Local `whisper.cpp` transcription & burned-in captions (~100 languages) |

## Environment Variables

`FLOW_MCP_CHROME`, `FLOW_MCP_CDP_PORT` (`9333`), `FLOW_MCP_PORT` (`8787`), `FLOW_MCP_OUTPUT` (`~/flow-mcp-out`), `FLOW_MCP_HOME` (`~/.flow-mcp`), `FLOW_MCP_CONCURRENCY` (`1`–`4`), `FLOW_MCP_SUBMIT_STAGGER_S` (`4`), `FLOW_MCP_PAUSE_MIN_S` (`25`), `FLOW_MCP_PAUSE_MAX_S` (`70`), `GEMINI_API_KEY`.

---

## Credits & Risk Notice

- Originally created by [GTAI-1/flow-mcp](https://github.com/GTAI-1/flow-mcp) (ISC License).
- Enhanced for Antigravity by [MuntasirMalek](https://github.com/MuntasirMalek).
- This project automates Google Flow's web interface at human pace. Google UI updates can break selectors, and automated browser use may conflict with Google's terms of service — use on your own account at your own risk.
