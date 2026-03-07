
import "dotenv/config";
import { GITHUB_OWNER, GITHUB_REPO } from "./environment";
import { WORK_DIR } from "./constants/workDir";
import { runCodingAgent } from "./agents/runCodingAgent";
import { codingAgent } from "./agents/codingAgent";


async function main(): Promise<void> {
  console.log(`Hello from ${GITHUB_OWNER}/${GITHUB_REPO}!`);
  console.log("This is the main entry point of the application.");
  console.log(`You will be working in ${WORK_DIR}`)

  const prompt = "Create a new file at src/utils/add.ts containing a TypeScript function add(a: number, b: number): number. Use apply_patch to make the change. make sure there is a test file to go with it, using vitest tests";
  await runCodingAgent(codingAgent, prompt).catch((error) => {
    console.error("Error running the coding agent:", error);
  });
}

main().catch((error) => {
  console.error("Error in main execution:", error);
}).finally(() => {
  console.log("Execution finished.");
});
