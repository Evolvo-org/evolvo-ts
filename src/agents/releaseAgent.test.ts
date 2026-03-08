import { describe, expect, it } from "vitest";
import {
  DEFAULT_RELEASE_AGENT_MODEL,
  RELEASE_AGENT_THREAD_OPTIONS,
  buildReleaseAgentThreadOptions,
  buildReleasePrompt,
} from "./releaseAgent.js";

describe("buildReleasePrompt", () => {
  it("limits the release agent to merge-time ownership", () => {
    const prompt = buildReleasePrompt({
      pullRequestUrl: "https://github.com/Evolvo-org/evolvo-ts/pull/14",
      defaultBranch: "main",
    });

    expect(prompt).toContain("You are Evolvo's Release agent.");
    expect(prompt).toContain("Only the Release agent may move work from Ready for Release to Releasing and then to Done.");
    expect(prompt).toContain("merge the supplied pull request");
    expect(prompt).toContain("https://github.com/Evolvo-org/evolvo-ts/pull/14");
  });
});

describe("buildReleaseAgentThreadOptions", () => {
  it("keeps the release agent on Codex SDK workspace-write execution", () => {
    expect(DEFAULT_RELEASE_AGENT_MODEL).toBe("gpt-5.3-codex");
    expect(RELEASE_AGENT_THREAD_OPTIONS.model).toBe(DEFAULT_RELEASE_AGENT_MODEL);
    expect(RELEASE_AGENT_THREAD_OPTIONS.sandboxMode).toBe("workspace-write");
    expect(RELEASE_AGENT_THREAD_OPTIONS.skipGitRepoCheck).toBe(true);

    expect(buildReleaseAgentThreadOptions("/tmp/repo")).toEqual({
      ...RELEASE_AGENT_THREAD_OPTIONS,
      workingDirectory: "/tmp/repo",
    });
  });
});
