#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { closeFlowBrowser, restartFlowBrowser } from "./chrome.js";
import { PORT, TOKEN_FILE } from "./server.js";

const cmd = process.argv[2] ?? "status";
const mode = process.argv[3] === "browser" ? "browser" : "soft";

async function callOwner(method: string, body: Record<string, unknown> = {}): Promise<unknown> {
  if (!existsSync(TOKEN_FILE)) throw new Error("No running flow-mcp server token found.");
  const token = readFileSync(TOKEN_FILE, "utf8").trim();
  const res = await fetch(`http://127.0.0.1:${PORT}/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-flow-token": token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error ?? `HTTP ${res.status}`));
  return data;
}

if (cmd === "stop") {
  try {
    console.log(JSON.stringify(await callOwner("stop", { clear_finished: false }), null, 2));
  } catch (err) {
    console.error("Owner server unreachable; closing dedicated Flow browser directly:", err instanceof Error ? err.message : err);
    await closeFlowBrowser();
    console.log(JSON.stringify({ stopped: true, closed_browser: true }, null, 2));
  }
} else if (cmd === "restart") {
  try {
    console.log(JSON.stringify(await callOwner("restart", { mode, clear_jobs: false }), null, 2));
  } catch (err) {
    console.error("Owner server unreachable; restarting dedicated Flow browser directly:", err instanceof Error ? err.message : err);
    console.log(JSON.stringify(await restartFlowBrowser(mode === "browser"), null, 2));
  }
} else {
  console.log("Usage: node dist/control.js <stop|restart> [soft|browser]");
  process.exit(1);
}
