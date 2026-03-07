import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startThreadMock = vi.fn();
const runStreamedMock = vi.fn();
const buildCodingPromptMock = vi.fn((task: string) => `PROMPT:${task}`);

vi.mock("@openai/codex-sdk", () => ({
  Codex: class {
    startThread = startThreadMock;
  },
  Thread: class {},
}));

vi.mock("./codingAgent.js", () => ({
  CODING_AGENT_THREAD_OPTIONS: { sandboxMode: "workspace-write" },
  buildCodingPrompt: buildCodingPromptMock,
}));

function createEventStream(events: unknown[]) {
  return {
    events: (async function* () {
      for (const event of events) {
        yield event;
      }
    })(),
  };
}

describe("runCodingAgent", () => {
  beforeEach(() => {
    startThreadMock.mockReset();
    runStreamedMock.mockReset();
    buildCodingPromptMock.mockClear();
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts a thread and succeeds when a file change is completed", async () => {
    startThreadMock.mockReturnValue({ runStreamed: runStreamedMock });
    runStreamedMock.mockResolvedValue(createEventStream([
      {
        type: "item.completed",
        item: {
          id: "1",
          type: "file_change",
          status: "completed",
          changes: [{ kind: "add", path: "src/utils/add.ts" }],
        },
      },
      {
        type: "item.completed",
        item: {
          id: "2",
          type: "agent_message",
          text: "done",
        },
      },
    ]));

    const { runCodingAgent } = await import("./runCodingAgent.js");

    await expect(
      runCodingAgent("Create src/utils/add.ts"),
    ).resolves.toEqual(
      expect.objectContaining({
        mergedPullRequest: false,
        summary: expect.objectContaining({
          editedFiles: ["src/utils/add.ts"],
        }),
      }),
    );

    expect(startThreadMock).toHaveBeenCalledTimes(1);
    expect(runStreamedMock).toHaveBeenCalledWith("PROMPT:Create src/utils/add.ts");
  });

  it("throws when a file edit request completes without repository edits", async () => {
    startThreadMock.mockReturnValue({ runStreamed: runStreamedMock });
    runStreamedMock.mockResolvedValue(createEventStream([
      {
        type: "item.completed",
        item: {
          id: "1",
          type: "agent_message",
          text: "I did it",
        },
      },
    ]));

    const { runCodingAgent } = await import("./runCodingAgent.js");

    await expect(
      runCodingAgent("Create src/utils/add.ts"),
    ).rejects.toThrow("The Codex run did not make repository edits");
  });

  it("does not throw for non-edit prompts without file changes", async () => {
    startThreadMock.mockReturnValue({ runStreamed: runStreamedMock });
    runStreamedMock.mockResolvedValue(createEventStream([
      {
        type: "item.completed",
        item: {
          id: "1",
          type: "agent_message",
          text: "summary",
        },
      },
    ]));

    const { runCodingAgent } = await import("./runCodingAgent.js");

    await expect(
      runCodingAgent("Summarize the repository"),
    ).resolves.toEqual(
      expect.objectContaining({
        mergedPullRequest: false,
        summary: expect.objectContaining({
          reviewOutcome: "accepted",
        }),
      }),
    );
  });

  it("flags successful pull request merges from command events", async () => {
    startThreadMock.mockReturnValue({ runStreamed: runStreamedMock });
    runStreamedMock.mockResolvedValue(createEventStream([
      {
        type: "item.completed",
        item: {
          id: "1",
          type: "command_execution",
          command: "gh pr merge 15 --merge --delete-branch",
          exit_code: 0,
          aggregated_output: "Merged",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "2",
          type: "agent_message",
          text: "done",
        },
      },
    ]));

    const { runCodingAgent } = await import("./runCodingAgent.js");

    await expect(runCodingAgent("Merge and continue")).resolves.toEqual(
      expect.objectContaining({
        mergedPullRequest: true,
        summary: expect.objectContaining({
          reviewOutcome: "accepted",
        }),
      }),
    );
  });

  it("logs command, exit code, and duration for command executions", async () => {
    startThreadMock.mockReturnValue({ runStreamed: runStreamedMock });
    runStreamedMock.mockResolvedValue(createEventStream([
      {
        type: "item.started",
        item: {
          id: "1",
          type: "command_execution",
          command: "pnpm validate",
          aggregated_output: "",
          status: "in_progress",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "1",
          type: "command_execution",
          command: "pnpm validate",
          exit_code: 1,
          aggregated_output: "failed",
          status: "failed",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "2",
          type: "agent_message",
          text: "Validation failed, fix pending.",
        },
      },
    ]));

    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1000)
      .mockReturnValue(1450);

    const { runCodingAgent } = await import("./runCodingAgent.js");

    await expect(runCodingAgent("Run validation")).resolves.toEqual(
      expect.objectContaining({
        mergedPullRequest: false,
        summary: expect.objectContaining({
          validationCommands: [
            expect.objectContaining({
              command: "pnpm validate",
              exitCode: 1,
            }),
          ],
          reviewOutcome: "amended",
        }),
      }),
    );

    expect(console.log).toHaveBeenCalledWith(
      "[command completed] command=\"pnpm validate\" name=pnpm exit=1 duration=450ms",
    );
  });

  it("flags successful pull request merges from agent messages", async () => {
    startThreadMock.mockReturnValue({ runStreamed: runStreamedMock });
    runStreamedMock.mockResolvedValue(createEventStream([
      {
        type: "item.completed",
        item: {
          id: "1",
          type: "agent_message",
          text: "I merged the pull request into main and stopped for host restart.",
        },
      },
    ]));

    const { runCodingAgent } = await import("./runCodingAgent.js");

    await expect(runCodingAgent("Merge and continue")).resolves.toEqual(
      expect.objectContaining({
        mergedPullRequest: true,
        summary: expect.objectContaining({
          reviewOutcome: "accepted",
        }),
      }),
    );
  });
});
