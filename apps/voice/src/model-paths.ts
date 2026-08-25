import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve Piper model paths relative to repo root or ARIA_MODELS_DIR. */
export function resolveModelPath(
  modelPath: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (path.isAbsolute(modelPath)) {
    return modelPath;
  }

  const modelsDir = env["ARIA_MODELS_DIR"]?.trim();
  if (modelsDir && modelPath.startsWith("models/")) {
    return path.resolve(modelsDir, modelPath.slice("models/".length));
  }

  const repoRoot = env["ARIA_REPO_ROOT"]?.trim() ?? findRepoRoot();
  return path.resolve(repoRoot, modelPath);
}

export function findRepoRoot(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < 8; depth += 1) {
    const pkg = path.join(current, "package.json");
    if (existsSync(pkg)) {
      try {
        const raw = readFileSync(pkg, "utf8");
        if (raw.includes('"name": "aria"')) {
          return current;
        }
      } catch {
        // keep walking
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return startDir;
}

/** Fail fast when Ganji/Lessac ONNX + JSON config files are missing. */
export function assertPiperModelsExist(
  englishModel: string,
  persianModel: string,
): void {
  const missing: string[] = [];
  for (const model of [englishModel, persianModel]) {
    if (!existsSync(model)) {
      missing.push(model);
    }
    const configPath = `${model}.json`;
    if (!existsSync(configPath)) {
      missing.push(configPath);
    }
  }
  if (missing.length === 0) {
    return;
  }
  throw new Error(
    `Piper TTS model(s) not found: ${missing.join(", ")}. ` +
      "Run: python sidecars/voice/download_models.py " +
      "(the .onnx.json next to each voice is required so Persian uses eSpeak `fa`).",
  );
}

/** Anchor repo root for child processes when cwd may differ. */
export function defaultRepoRootEnv(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return findRepoRoot(path.resolve(here, "../../.."));
  } catch {
    return findRepoRoot();
  }
}
