/* eslint-disable no-undef */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const winPython = resolve(root, "sidecars/vision/.venv/Scripts/python.exe");
const unixPython = resolve(root, "sidecars/vision/.venv/bin/python");
const python = existsSync(winPython)
  ? winPython
  : existsSync(unixPython)
    ? unixPython
    : "python";

const mode = process.env.ARIA_VISION_SIDECAR_MODE?.trim() || "real";
if (mode === "mock") {
  console.warn(
    "[aria-vision-sidecar] ARIA_VISION_SIDECAR_MODE=mock — fake person/cup, no webcam",
  );
} else {
  console.info(
    `[aria-vision-sidecar] mode=${mode} — opening real models + camera when requested`,
  );
}

const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    resolve(root, "sidecars/vision"),
    "--host",
    "127.0.0.1",
    "--port",
    "8766",
  ],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      ARIA_VISION_SIDECAR_MODE: mode,
    },
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
