import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn();
const getGitHubConfigMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("../github/githubConfig.js", () => ({
  getGitHubConfig: getGitHubConfigMock,
}));

describe("defaultBranch", () => {
  beforeEach(() => {
    vi.resetModules();
    execFileMock.mockReset();
    getGitHubConfigMock.mockReset();
    getGitHubConfigMock.mockReturnValue({
      token: "token",
      owner: "owner",
      repo: "repo",
      apiBaseUrl: "https://api.github.com",
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves the default branch from origin HEAD symbolic ref", async () => {
    execFileMock.mockImplementationOnce(
      (_command: string, _args: string[], _options: unknown, callback: (error: unknown, stdout: string, stderr: string) => void) => {
        callback(null, "origin/trunk\n", "");
      },
    );

    const { resolveRepositoryDefaultBranch } = await import("./defaultBranch.js");

    await expect(resolveRepositoryDefaultBranch("/tmp/evolvo")).resolves.toBe("trunk");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to git remote show output when origin HEAD symbolic ref is unavailable", async () => {
    execFileMock
      .mockImplementationOnce(
        (_command: string, _args: string[], _options: unknown, callback: (error: unknown, stdout: string, stderr: string) => void) => {
          callback(new Error("missing origin HEAD"), "", "");
        },
      )
      .mockImplementationOnce(
        (_command: string, _args: string[], _options: unknown, callback: (error: unknown, stdout: string, stderr: string) => void) => {
          callback(null, "  HEAD branch: release\n", "");
        },
      );

    const { resolveRepositoryDefaultBranch } = await import("./defaultBranch.js");

    await expect(resolveRepositoryDefaultBranch("/tmp/evolvo")).resolves.toBe("release");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to GitHub repository metadata when git metadata is unavailable", async () => {
    execFileMock.mockImplementation(
      (_command: string, _args: string[], _options: unknown, callback: (error: unknown, stdout: string, stderr: string) => void) => {
        callback(new Error("git metadata unavailable"), "", "");
      },
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ default_branch: "develop" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { tryResolveRepositoryDefaultBranch } = await import("./defaultBranch.js");

    await expect(tryResolveRepositoryDefaultBranch("/tmp/evolvo")).resolves.toBe("develop");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      }),
    );
  });

  it("throws actionable diagnostics when git and GitHub detection both fail", async () => {
    execFileMock.mockImplementation(
      (_command: string, _args: string[], _options: unknown, callback: (error: unknown, stdout: string, stderr: string) => void) => {
        callback(new Error("git metadata unavailable"), "", "");
      },
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("{}", {
        status: 500,
      }),
    );

    const { resolveRepositoryDefaultBranch } = await import("./defaultBranch.js");

    await expect(resolveRepositoryDefaultBranch("/tmp/evolvo")).rejects.toThrow(
      "Could not resolve repository default branch from git or GitHub. git: origin default branch was not available from git remote metadata. GitHub: GitHub repository metadata request failed with status 500.",
    );
  });

  it("formats branch labels and merge reasons without hardcoding main", async () => {
    const {
      buildMergedPullRequestReason,
      describeRepositoryDefaultBranch,
    } = await import("./defaultBranch.js");

    expect(describeRepositoryDefaultBranch("origin/release")).toBe("`release`");
    expect(describeRepositoryDefaultBranch("   ")).toBe("the repository default branch");
    expect(buildMergedPullRequestReason("release")).toBe("pull request merged into release");
    expect(buildMergedPullRequestReason("")).toBe("pull request merged into repository default branch");
  });
});
