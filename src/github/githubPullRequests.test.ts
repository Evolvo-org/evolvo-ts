import { describe, expect, it, vi } from "vitest";
import { GitHubPullRequestClient, parseGitHubPullRequestUrl } from "./githubPullRequests.js";

describe("parseGitHubPullRequestUrl", () => {
  it("parses a valid GitHub pull request URL", () => {
    expect(parseGitHubPullRequestUrl("https://github.com/Evolvo-org/evolvo-ts/pull/42")).toEqual({
      owner: "Evolvo-org",
      repo: "evolvo-ts",
      pullNumber: 42,
      url: "https://github.com/Evolvo-org/evolvo-ts/pull/42",
    });
  });

  it("returns null for non-pull-request URLs", () => {
    expect(parseGitHubPullRequestUrl("https://github.com/Evolvo-org/evolvo-ts/issues/42")).toBeNull();
  });
});

describe("GitHubPullRequestClient", () => {
  it("submits a pull request review through the repository pulls api", async () => {
    const postApi = vi.fn().mockResolvedValue({});
    const client = new GitHubPullRequestClient({ postApi } as never);

    await client.submitReview({
      owner: "Evolvo-org",
      repo: "evolvo-ts",
      pullNumber: 12,
      body: "Looks good.",
      event: "APPROVE",
    });

    expect(postApi).toHaveBeenCalledWith(
      "/repos/Evolvo-org/evolvo-ts/pulls/12/reviews",
      {
        body: "Looks good.",
        event: "APPROVE",
      },
    );
  });
});
