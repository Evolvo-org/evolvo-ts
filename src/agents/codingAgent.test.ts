import { describe, expect, it } from "vitest";
import {
  CODING_AGENT_THREAD_OPTIONS,
  buildCodingPrompt,
} from "./codingAgent.js";

describe("buildCodingPrompt", () => {
  it("includes the task after the host instructions", () => {
    const prompt = buildCodingPrompt("Create src/utils/add.ts");

    expect(prompt).toContain("Task:\nCreate src/utils/add.ts");
  });

  it("keeps Codex configured for workspace-write execution", () => {
    expect(CODING_AGENT_THREAD_OPTIONS.sandboxMode).toBe("workspace-write");
    expect(CODING_AGENT_THREAD_OPTIONS.approvalPolicy).toBe("never");
  });
});
