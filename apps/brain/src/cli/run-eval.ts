import { runPhase1Evaluation } from "../evaluation/evaluation-runner.js";

async function main(): Promise<void> {
  const report = await runPhase1Evaluation({
    ARIA_LLM_PROVIDER: process.env.ARIA_LLM_PROVIDER ?? "mock",
    ARIA_LOG_LEVEL: process.env.ARIA_LOG_LEVEL ?? "error",
    ARIA_OLLAMA_MODEL: process.env.ARIA_OLLAMA_MODEL,
    ARIA_OLLAMA_URL: process.env.ARIA_OLLAMA_URL,
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
