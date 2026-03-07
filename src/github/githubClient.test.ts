import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubApiError, GitHubClient } from "./githubClient.js";

const fetchMock = vi.fn();

function createClient(overrides?: {
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}): GitHubClient {
  return new GitHubClient({
    token: "secret-token",
    owner: "owner",
    repo: "repo",
    apiBaseUrl: "https://api.github.com",
    requestTimeoutMs: overrides?.requestTimeoutMs,
    maxRetries: overrides?.maxRetries,
    retryBaseDelayMs: overrides?.retryBaseDelayMs,
  });
}

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

    const client = createClient();

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

    const client = createClient();

    await expect(client.get("/999")).rejects.toEqual(
      expect.objectContaining({
        name: "GitHubApiError",
        status: 404,
        message: "GitHub API request failed (404): Not Found",
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles 204 responses for delete operations", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const client = createClient();

    await expect(client.delete("/1/labels/in%20progress")).resolves.toBeUndefined();
  });

  it("builds a generic error when API response is non-json", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Service unavailable", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
    );

    const client = createClient({ maxRetries: 0 });

    const result = client.get("/1");
    await expect(result).rejects.toBeInstanceOf(GitHubApiError);
    await expect(result).rejects.toThrow("GitHub API request failed with status 503.");
  });

  it("retries retryable statuses and can recover", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Service unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ number: 1 }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const client = createClient({ maxRetries: 2, retryBaseDelayMs: 1 });

    const result = await client.get<Array<{ number: number }>>("?state=open");

    expect(result).toEqual([{ number: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable statuses", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    const client = createClient({ maxRetries: 3, retryBaseDelayMs: 1 });

    await expect(client.get("/1")).rejects.toThrow(
      "GitHub API request failed (401): Bad credentials",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries timeout failures and surfaces explicit timeout when exhausted", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValue(abortError);

    const client = createClient({ requestTimeoutMs: 5, maxRetries: 1, retryBaseDelayMs: 1 });

    await expect(client.get("/1")).rejects.toThrow("GitHub API request timed out after 5ms.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries network errors and succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ number: 2 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const client = createClient({ maxRetries: 2, retryBaseDelayMs: 1 });

    await expect(client.get<{ number: number }>("/2")).resolves.toEqual({ number: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid timeout config values", () => {
    expect(
      () =>
        new GitHubClient({
          token: "secret-token",
          owner: "owner",
          repo: "repo",
          apiBaseUrl: "https://api.github.com",
          requestTimeoutMs: 0,
        }),
    ).toThrow("requestTimeoutMs must be a positive integer.");
  });

  it("rejects negative retry config values", () => {
    expect(
      () =>
        new GitHubClient({
          token: "secret-token",
          owner: "owner",
          repo: "repo",
          apiBaseUrl: "https://api.github.com",
          maxRetries: -1,
        }),
    ).toThrow("maxRetries must be a non-negative integer.");
  });
});
