/**
 * Development runner: rebuilds the bundle on change and serves the fixture
 * preview. Usage: npm run dev
 */
import { spawn } from "node:child_process";

const children = [];

function run(command, args) {
  const child = spawn(command, args, { stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => shutdown(code ?? 0));
  return child;
}

function shutdown(code) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("npx", ["rollup", "-c", "--watch"]);
run("node", ["demo/serve.mjs"]);

console.log("Development preview running. Press Ctrl+C to stop.");
