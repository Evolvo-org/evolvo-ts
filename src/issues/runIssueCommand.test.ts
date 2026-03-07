import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubApiError } from "../github/githubClient.js";

const getGitHubConfigMock = vi.fn();
const listOpenIssuesMock = vi.fn();
const createIssueMock = vi.fn();
const markInProgressMock = vi.fn();
const addProgressCommentMock = vi.fn();
const markCompletedMock = vi.fn();
const closeIssueMock = vi.fn();

vi.mock("../github/githubConfig.js", () => ({
  getGitHubConfig: getGitHubConfigMock,
}));

vi.mock("../github/githubClient.js", async () => {
  const actual = await vi.importActual<typeof import("../github/githubClient.js")>(
    "../github/githubClient.js",
  );

  return {
    ...actual,
    GitHubClient: class {},
  };
});

vi.mock("./taskIssueManager.js", () => ({
  TaskIssueManager: class {
    createIssue = createIssueMock;
    listOpenIssues = listOpenIssuesMock;
    markInProgress = markInProgressMock;
    addProgressComment = addProgressCommentMock;
    markCompleted = markCompletedMock;
    closeIssue = closeIssueMock;
  },
}));

describe("runIssueCommand", () => {
  beforeEach(() => {
    getGitHubConfigMock.mockReset();
    listOpenIssuesMock.mockReset();
    createIssueMock.mockReset();
    markInProgressMock.mockReset();
    addProgressCommentMock.mockReset();
    markCompletedMock.mockReset();
    closeIssueMock.mockReset();

    getGitHubConfigMock.mockReturnValue({
      token: "token",
      owner: "owner",
      repo: "repo",
      apiBaseUrl: "https://api.github.com",
    });

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when command is not issues", async () => {
    const { runIssueCommand } = await import("./runIssueCommand.js");

    await expect(runIssueCommand(["help"])).resolves.toBe(false);
  });

  it("creates an issue", async () => {
    createIssueMock.mockResolvedValue({ ok: true, message: "Created issue #1." });
    const { runIssueCommand } = await import("./runIssueCommand.js");

    const handled = await runIssueCommand(["issues", "create", "Title", "Description"]);

    expect(handled).toBe(true);
    expect(createIssueMock).toHaveBeenCalledWith("Title", "Description");
  });

  it("lists open issues", async () => {
    listOpenIssuesMock.mockResolvedValue([
      { number: 1, title: "A", description: "", state: "open", labels: ["bug"] },
    ]);
    const { runIssueCommand } = await import("./runIssueCommand.js");

    const handled = await runIssueCommand(["issues", "list"]);

    expect(handled).toBe(true);
    expect(console.log).toHaveBeenCalledWith("#1 A [bug]");
  });

  it("starts work on an issue", async () => {
    markInProgressMock.mockResolvedValue({ ok: true, message: "Issue #1 marked as in progress." });
    const { runIssueCommand } = await import("./runIssueCommand.js");

    await runIssueCommand(["issues", "start", "1"]);

    expect(markInProgressMock).toHaveBeenCalledWith(1);
  });

  it("adds progress comment to an issue", async () => {
    addProgressCommentMock.mockResolvedValue({ ok: true, message: "Added progress comment." });
    const { runIssueCommand } = await import("./runIssueCommand.js");

    await runIssueCommand(["issues", "comment", "1", "update", "text"]);

    expect(addProgressCommentMock).toHaveBeenCalledWith(1, "update text");
  });

  it("completes an issue", async () => {
    markCompletedMock.mockResolvedValue({ ok: true, message: "Issue completed." });
    const { runIssueCommand } = await import("./runIssueCommand.js");

    await runIssueCommand(["issues", "complete", "1", "final", "summary"]);

    expect(markCompletedMock).toHaveBeenCalledWith(1, "final summary");
  });

  it("closes an issue", async () => {
    closeIssueMock.mockResolvedValue({ ok: true, message: "Issue closed." });
    const { runIssueCommand } = await import("./runIssueCommand.js");

    await runIssueCommand(["issues", "close", "1"]);

    expect(closeIssueMock).toHaveBeenCalledWith(1);
  });

  it("prints usage for unknown subcommands", async () => {
    const { runIssueCommand } = await import("./runIssueCommand.js");

    await runIssueCommand(["issues", "unknown"]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Issue commands:"));
  });

  it("logs friendly errors for invalid issue number", async () => {
    const { runIssueCommand } = await import("./runIssueCommand.js");

    await runIssueCommand(["issues", "start", "abc"]);

    expect(console.error).toHaveBeenCalledWith("Issue number must be a positive integer.");
  });

  it("logs GitHub API errors", async () => {
    listOpenIssuesMock.mockRejectedValue(
      new GitHubApiError("GitHub API request failed (401): Bad credentials", 401, null),
    );
    const { runIssueCommand } = await import("./runIssueCommand.js");

    await runIssueCommand(["issues", "list"]);

    expect(console.error).toHaveBeenCalledWith(
      "GitHub API request failed (401): Bad credentials",
    );
  });
});
