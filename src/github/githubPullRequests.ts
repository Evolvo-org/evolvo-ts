import type { GitHubClient } from "./githubClient.js";

export type PullRequestReviewEvent = "APPROVE" | "REQUEST_CHANGES";

export type ParsedPullRequestUrl = {
  owner: string;
  repo: string;
  pullNumber: number;
  url: string;
};

const GITHUB_PULL_REQUEST_URL_PATTERN = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?$/i;

export function parseGitHubPullRequestUrl(value: string): ParsedPullRequestUrl | null {
  const match = value.trim().match(GITHUB_PULL_REQUEST_URL_PATTERN);
  if (!match) {
    return null;
  }

  const pullNumber = Number.parseInt(match[3] ?? "", 10);
  if (!Number.isInteger(pullNumber) || pullNumber < 1) {
    return null;
  }

  return {
    owner: match[1] ?? "",
    repo: match[2] ?? "",
    pullNumber,
    url: value.trim().replace(/\/+$/, ""),
  };
}

export class GitHubPullRequestClient {
  public constructor(private readonly client: GitHubClient) {}

  public async submitReview(options: {
    owner: string;
    repo: string;
    pullNumber: number;
    body: string;
    event: PullRequestReviewEvent;
  }): Promise<void> {
    await this.client.postApi(
      `/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/pulls/${options.pullNumber}/reviews`,
      {
        body: options.body,
        event: options.event,
      },
    );
  }
}
