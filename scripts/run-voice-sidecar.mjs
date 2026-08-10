/* eslint-disable no-undef */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const winPython = resolve(root, "sidecars/voice/.venv/Scripts/python.exe");
const unixPython = resolve(root, "sidecars/voice/.venv/bin/python");
const python = existsSync(winPython)
  ? winPython
  : existsSync(unixPython)
    ? unixPython
    : "python";

const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    resolve(root, "sidecars/voice"),
    "--host",
    "127.0.0.1",
    "--port",
    "8765",
  ],
  { stdio: "inherit", windowsHide: true },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
