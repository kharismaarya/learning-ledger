// Stop hook: type-check when src/ has uncommitted changes, and send any errors back to Claude.
// Reads the hook payload on stdin. Prints {"decision":"block","reason":...} to make Claude keep going and fix them.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let input = "";
for await (const chunk of process.stdin) input += chunk;
let payload = {};
try {
  payload = JSON.parse(input || "{}");
} catch {
  /* no payload: treat as a first stop */
}

const changed = spawnSync("git", ["status", "--porcelain", "--", "src"], { cwd: root, encoding: "utf8" });
if (changed.status !== 0 || !changed.stdout.trim()) process.exit(0);

const tsc = spawnSync(
  process.execPath,
  [path.join(root, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "--incremental", "--tsBuildInfoFile", path.join(root, "node_modules", ".cache", "tsc.tsbuildinfo")],
  { cwd: root, encoding: "utf8" },
);
if (tsc.error) process.exit(0); // typescript not installed yet (no npm install): nothing to check
if (tsc.status === 0) process.exit(0);

const errors = (tsc.stdout + tsc.stderr).trim().split("\n").slice(0, 40).join("\n");
if (payload.stop_hook_active) {
  // already continued once for this; don't loop, just surface it
  console.log(JSON.stringify({ systemMessage: "TypeScript errors remain in src/:\n" + errors }));
} else {
  console.log(JSON.stringify({ decision: "block", reason: "TypeScript errors in src/ (from `tsc --noEmit`). Fix them before finishing:\n" + errors }));
}
