
import "dotenv/config";
import { GITHUB_OWNER, GITHUB_REPO } from "./environment.js";
import { WORK_DIR } from "./constants/workDir.js";
import { runCodingAgent } from "./agents/runCodingAgent.js";

async function main(): Promise<void> {
  const prompt = process.argv.slice(2).join(" ").trim() ||
    "Create a new file at src/utils/add.ts containing a TypeScript function add(a: number, b: number): number. Add a vitest test file for it and run the relevant tests.";

  console.log(`Hello from ${GITHUB_OWNER}/${GITHUB_REPO}!`);
  console.log(`Working directory: ${WORK_DIR}`);
  console.log(`Prompt: ${prompt}`);

  await runCodingAgent(prompt).catch((error) => {
    console.error("Error running the coding agent:", error);
  });
}

main().catch((error) => {
  console.error("Error in main execution:", error);
}).finally(() => {
  console.log("Execution finished.");
});
