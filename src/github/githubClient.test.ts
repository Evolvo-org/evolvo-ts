import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubApiError, GitHubClient } from "./githubClient.js";

const fetchMock = vi.fn();

describe("GitHubClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls GitHub issues API with auth headers", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ number: 1 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const client = new GitHubClient({
      token: "secret-token",
      owner: "owner",
      repo: "repo",
      apiBaseUrl: "https://api.github.com",
    });

    const result = await client.get<Array<{ number: number }>>("?state=open");

    expect(result).toEqual([{ number: 1 }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/issues?state=open",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
          Accept: "application/vnd.github+json",
        }),
      }),
    );
  });

  it("throws GitHubApiError with API message", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    const client = new GitHubClient({
      token: "secret-token",
      owner: "owner",
      repo: "repo",
      apiBaseUrl: "https://api.github.com",
    });

    await expect(client.get("/999")).rejects.toEqual(
      expect.objectContaining({
        name: "GitHubApiError",
        status: 404,
        message: "GitHub API request failed (404): Not Found",
      }),
    );
  });

  it("handles 204 responses for delete operations", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const client = new GitHubClient({
      token: "secret-token",
      owner: "owner",
      repo: "repo",
      apiBaseUrl: "https://api.github.com",
    });

    await expect(client.delete("/1/labels/in%20progress")).resolves.toBeUndefined();
  });

  it("builds a generic error when API response is non-json", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Service unavailable", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
    );

    const client = new GitHubClient({
      token: "secret-token",
      owner: "owner",
      repo: "repo",
      apiBaseUrl: "https://api.github.com",
    });

    const result = client.get("/1");
    await expect(result).rejects.toBeInstanceOf(GitHubApiError);
    await expect(result).rejects.toThrow("GitHub API request failed with status 503.");
  });
});
