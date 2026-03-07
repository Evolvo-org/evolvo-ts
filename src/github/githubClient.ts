import type { GitHubConfig } from "./githubConfig.js";

export class GitHubApiError extends Error {
  public readonly status: number;
  public readonly responseBody: unknown;

  public constructor(message: string, status: number, responseBody: unknown) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

export class GitHubClient {
  private readonly baseIssueUrl: string;
  private readonly token: string;

  public constructor(config: GitHubConfig) {
    const apiBase = config.apiBaseUrl.replace(/\/+$/, "");
    this.baseIssueUrl = `${apiBase}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/issues`;
    this.token = config.token;
  }

  public async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  public async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body });
  }

  public async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body });
  }

  public async delete(path: string): Promise<void> {
    await this.request<null>(path, { method: "DELETE" });
  }

  private async request<T>(path: string, options: RequestOptions): Promise<T> {
    const url = `${this.baseIssueUrl}${path}`;
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const responseBody = await this.readResponseBody(response);

    if (!response.ok) {
      const message = this.getErrorMessage(responseBody, response.status);
      throw new GitHubApiError(message, response.status, responseBody);
    }

    return responseBody as T;
  }

  private async readResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return response.json();
    }

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    return text || null;
  }

  private getErrorMessage(responseBody: unknown, status: number): string {
    if (responseBody !== null && typeof responseBody === "object" && "message" in responseBody) {
      const message = (responseBody as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) {
        return `GitHub API request failed (${status}): ${message}`;
      }
    }

    return `GitHub API request failed with status ${status}.`;
  }
}
