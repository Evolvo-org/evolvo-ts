import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runCodingAgentMock = vi.fn();
const runIssueCommandMock = vi.fn();

vi.mock("./environment.js", () => ({
  GITHUB_OWNER: "owner",
  GITHUB_REPO: "repo",
}));

vi.mock("./constants/workDir.js", () => ({
  WORK_DIR: "/tmp/evolvo",
}));

vi.mock("./agents/runCodingAgent.js", () => ({
  runCodingAgent: runCodingAgentMock,
}));

vi.mock("./issues/runIssueCommand.js", () => ({
  runIssueCommand: runIssueCommandMock,
}));

describe("main", () => {
  beforeEach(() => {
    runCodingAgentMock.mockReset();
    runCodingAgentMock.mockResolvedValue(undefined);
    runIssueCommandMock.mockReset();
    runIssueCommandMock.mockResolvedValue(false);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the default prompt when no args are provided", async () => {
    const { DEFAULT_PROMPT, main } = await import("./main.js");

    await main();

    expect(runIssueCommandMock).toHaveBeenCalledWith([]);
    expect(runCodingAgentMock).toHaveBeenCalledWith(DEFAULT_PROMPT);
  });
});
