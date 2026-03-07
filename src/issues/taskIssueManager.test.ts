import { describe, expect, it, vi } from "vitest";
import {
  COMPLETED_LABEL,
  IN_PROGRESS_LABEL,
  TaskIssueManager,
} from "./taskIssueManager.js";
import { GitHubApiError } from "../github/githubClient.js";

type MockIssue = {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: Array<{ name: string }>;
  pull_request?: unknown;
};

function createIssue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    number: 1,
    title: "Issue",
    body: "Description",
    state: "open",
    labels: [],
    ...overrides,
  };
}

function createClientMock() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  };
}

describe("TaskIssueManager", () => {
  it("creates an issue", async () => {
    const client = createClientMock();
    client.post.mockResolvedValue(createIssue({ number: 22, title: "New", body: "Details" }));
    const manager = new TaskIssueManager(client as never);

    const result = await manager.createIssue(" New ", " Details ");

    expect(result).toEqual({
      ok: true,
      message: "Created issue #22.",
      issue: {
        number: 22,
        title: "New",
        description: "Details",
        state: "open",
        labels: [],
      },
    });
    expect(client.post).toHaveBeenCalledWith("", { title: "New", body: "Details" });
  });

  it("rejects creating an issue with an empty title", async () => {
    const manager = new TaskIssueManager(createClientMock() as never);

    const result = await manager.createIssue("   ", "Details");

    expect(result).toEqual({ ok: false, message: "Issue title is required." });
  });

  it("lists only open issues and excludes PRs", async () => {
    const client = createClientMock();
    client.get.mockResolvedValue([
      createIssue({ number: 1 }),
      createIssue({ number: 2, pull_request: { url: "pr" } }),
    ]);
    const manager = new TaskIssueManager(client as never);

    const result = await manager.listOpenIssues();

    expect(result).toHaveLength(1);
    expect(result[0]?.number).toBe(1);
  });

  it("marks an issue in progress", async () => {
    const client = createClientMock();
    client.get.mockResolvedValue(createIssue({ labels: [{ name: "bug" }] }));
    client.patch.mockResolvedValue(createIssue({ labels: [{ name: "bug" }, { name: IN_PROGRESS_LABEL }] }));
    const manager = new TaskIssueManager(client as never);

    const result = await manager.markInProgress(1);

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Issue #1 marked as in progress.");
    expect(client.patch).toHaveBeenCalledWith("/1", {
      labels: ["bug", IN_PROGRESS_LABEL],
    });
  });

  it("prevents starting work on an issue already in progress", async () => {
    const client = createClientMock();
    client.get.mockResolvedValue(createIssue({ labels: [{ name: IN_PROGRESS_LABEL }] }));
    const manager = new TaskIssueManager(client as never);

    const result = await manager.markInProgress(1);

    expect(result).toEqual({
      ok: false,
      message: "Issue #1 is already in progress.",
    });
  });

  it("prevents starting work on a closed issue", async () => {
    const client = createClientMock();
    client.get.mockResolvedValue(createIssue({ state: "closed" }));
    const manager = new TaskIssueManager(client as never);

    const result = await manager.markInProgress(1);

    expect(result).toEqual({
      ok: false,
      message: "Issue #1 is closed and cannot be started.",
    });
  });

  it("adds a progress comment", async () => {
    const client = createClientMock();
    client.get.mockResolvedValue(createIssue());
    client.post.mockResolvedValue({});
    const manager = new TaskIssueManager(client as never);

    const result = await manager.addProgressComment(1, " update ");

    expect(result.ok).toBe(true);
    expect(client.post).toHaveBeenCalledWith("/1/comments", { body: "update" });
  });

  it("rejects an empty progress comment", async () => {
    const manager = new TaskIssueManager(createClientMock() as never);

    const result = await manager.addProgressComment(1, "  ");

    expect(result).toEqual({
      ok: false,
      message: "Progress comment cannot be empty.",
    });
  });

  it("marks an issue as completed and removes in-progress label", async () => {
    const client = createClientMock();
    client.get.mockResolvedValue(createIssue({ labels: [{ name: IN_PROGRESS_LABEL }, { name: "bug" }] }));
    client.post.mockResolvedValue({});
    client.patch.mockResolvedValue(createIssue({ labels: [{ name: "bug" }, { name: COMPLETED_LABEL }] }));
    const manager = new TaskIssueManager(client as never);

    const result = await manager.markCompleted(1, " final summary ");

    expect(result.ok).toBe(true);
    expect(client.post).toHaveBeenCalledWith("/1/comments", { body: "final summary" });
    expect(client.patch).toHaveBeenCalledWith("/1", {
      labels: ["bug", COMPLETED_LABEL],
    });
  });

  it("prevents marking an already completed issue as completed again", async () => {
    const client = createClientMock();
    client.get.mockResolvedValue(createIssue({ labels: [{ name: COMPLETED_LABEL }] }));
    const manager = new TaskIssueManager(client as never);

    const result = await manager.markCompleted(1, "summary");

    expect(result).toEqual({
      ok: false,
      message: "Issue #1 is already marked as completed.",
    });
  });

  it("rejects an empty completion summary", async () => {
    const manager = new TaskIssueManager(createClientMock() as never);

    const result = await manager.markCompleted(1, " ");

    expect(result).toEqual({ ok: false, message: "Completion summary cannot be empty." });
  });

  it("closes an open issue", async () => {
    const client = createClientMock();
    client.get.mockResolvedValue(createIssue());
    client.patch.mockResolvedValue(createIssue({ state: "closed" }));
    const manager = new TaskIssueManager(client as never);

    const result = await manager.closeIssue(1);

    expect(result).toEqual({
      ok: true,
      message: "Issue #1 closed successfully.",
      issue: {
        number: 1,
        title: "Issue",
        description: "Description",
        state: "closed",
        labels: [],
      },
    });
  });

  it("does not close an already closed issue", async () => {
    const client = createClientMock();
    client.get.mockResolvedValue(createIssue({ state: "closed" }));
    const manager = new TaskIssueManager(client as never);

    const result = await manager.closeIssue(1);

    expect(result).toEqual({
      ok: false,
      message: "Issue #1 is already closed.",
    });
  });

  it("returns not found if GitHub returns 404", async () => {
    const client = createClientMock();
    client.get.mockRejectedValue(new GitHubApiError("not found", 404, null));
    const manager = new TaskIssueManager(client as never);

    const result = await manager.markInProgress(1);

    expect(result).toEqual({
      ok: false,
      message: "Issue #1 was not found.",
    });
  });

  it("treats pull requests as non-issues", async () => {
    const client = createClientMock();
    client.get.mockResolvedValue(createIssue({ pull_request: { url: "pr" } }));
    const manager = new TaskIssueManager(client as never);

    const result = await manager.markInProgress(1);

    expect(result).toEqual({
      ok: false,
      message: "Issue #1 was not found.",
    });
  });

  it("rethrows non-404 API errors", async () => {
    const client = createClientMock();
    client.get.mockRejectedValue(new GitHubApiError("nope", 500, null));
    const manager = new TaskIssueManager(client as never);

    await expect(manager.markInProgress(1)).rejects.toEqual(
      expect.objectContaining({ status: 500 }),
    );
  });
});
