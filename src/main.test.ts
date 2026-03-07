import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runCodingAgentMock = vi.fn();

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

describe("main", () => {
  beforeEach(() => {
    runCodingAgentMock.mockReset();
    runCodingAgentMock.mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the default prompt when no args are provided", async () => {
    const { DEFAULT_PROMPT, main } = await import("./main.js");

    await main([]);

    expect(runCodingAgentMock).toHaveBeenCalledWith(DEFAULT_PROMPT);
  });

  it("passes through the CLI prompt when args are provided", async () => {
    const { main } = await import("./main.js");

    await main(["Create", "src/foo.ts"]);

    expect(runCodingAgentMock).toHaveBeenCalledWith("Create src/foo.ts");
  });

  it("logs runCodingAgent failures instead of throwing", async () => {
    runCodingAgentMock.mockRejectedValueOnce(new Error("boom"));
    const { main } = await import("./main.js");

    await expect(main(["Create src/foo.ts"])).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
