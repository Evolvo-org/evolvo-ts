import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialRuntimeExecutionState } from "./runtimeExecutionState.js";

const runWorkflowSchedulerCycleMock = vi.fn();
const requestCycleLimitDecisionFromOperatorMock = vi.fn();
const notifyCycleLimitDecisionAppliedInDiscordMock = vi.fn();
const notifyRuntimeQuittingInDiscordMock = vi.fn();
const stopIfSingleTaskGracefulShutdownRequestedMock = vi.fn();
const waitForRunLoopRetryMock = vi.fn();
const logGitHubFallbackMock = vi.fn();
const isTransientGitHubErrorMock = vi.fn();

vi.mock("./workflowScheduler.js", () => ({
  runWorkflowSchedulerCycle: runWorkflowSchedulerCycleMock,
}));

vi.mock("./operatorControl.js", () => ({
  notifyCycleLimitDecisionAppliedInDiscord: notifyCycleLimitDecisionAppliedInDiscordMock,
  notifyRuntimeQuittingInDiscord: notifyRuntimeQuittingInDiscordMock,
  requestCycleLimitDecisionFromOperator: requestCycleLimitDecisionFromOperatorMock,
}));

vi.mock("./runtimeShutdownGuards.js", () => ({
  stopIfSingleTaskGracefulShutdownRequested: stopIfSingleTaskGracefulShutdownRequestedMock,
}));

vi.mock("./loopUtils.js", () => ({
  DEFAULT_PROMPT: "No open issues available. Create an issue first.",
  getRunLoopRetryDelayMs: (attempt: number) => attempt * 50,
  isTransientGitHubError: isTransientGitHubErrorMock,
  logGitHubFallback: logGitHubFallbackMock,
  waitForRunLoopRetry: waitForRunLoopRetryMock,
}));

function buildWorkflowCycleResult() {
  return {
    inventory: {
      projects: [
        {
          project: {
            slug: "evolvo",
          },
          countsByStage: {
            Inbox: 1,
            Planning: 1,
            "Ready for Dev": 1,
            "In Dev": 0,
            "Ready for Review": 0,
            "Ready for Release": 0,
            Blocked: 0,
          },
        },
      ],
    },
    summary: {
      issueGeneratorCreated: 0,
      plannerMovedToReadyForDev: 0,
      plannerBlocked: 0,
      devStarted: 0,
      reviewProcessed: false,
      releaseProcessed: false,
    },
  };
}

describe("workflowRuntimeLoop", () => {
  beforeEach(() => {
    runWorkflowSchedulerCycleMock.mockReset();
    runWorkflowSchedulerCycleMock.mockResolvedValue(buildWorkflowCycleResult());
    requestCycleLimitDecisionFromOperatorMock.mockReset();
    requestCycleLimitDecisionFromOperatorMock.mockResolvedValue({
      decision: "quit",
      additionalCycles: 0,
      source: "discord",
    });
    notifyCycleLimitDecisionAppliedInDiscordMock.mockReset();
    notifyCycleLimitDecisionAppliedInDiscordMock.mockResolvedValue(undefined);
    notifyRuntimeQuittingInDiscordMock.mockReset();
    notifyRuntimeQuittingInDiscordMock.mockResolvedValue(undefined);
    stopIfSingleTaskGracefulShutdownRequestedMock.mockReset();
    stopIfSingleTaskGracefulShutdownRequestedMock.mockResolvedValue(false);
    waitForRunLoopRetryMock.mockReset();
    waitForRunLoopRetryMock.mockResolvedValue(undefined);
    logGitHubFallbackMock.mockReset();
    isTransientGitHubErrorMock.mockReset();
    isTransientGitHubErrorMock.mockReturnValue(false);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("requests an operator decision at cycle limit and quits cleanly", async () => {
    const { runWorkflowRuntimeLoop } = await import("./workflowRuntimeLoop.js");

    await runWorkflowRuntimeLoop({
      workDir: "/tmp/evolvo",
      runtimeState: createInitialRuntimeExecutionState(1),
      maxIssueCycles: 1,
      runLoopGitHubMaxRetries: 2,
      discordHandlers: {},
      defaultProjectContext: {
        owner: "owner",
        repo: "repo",
        workDir: "/tmp/evolvo",
      },
      issueManager: {} as never,
      projectsClient: {} as never,
      pullRequestClient: {} as never,
    });

    expect(requestCycleLimitDecisionFromOperatorMock).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith("Operator decision via Discord: quit.");
    expect(console.error).toHaveBeenCalledWith("Reached the maximum number of issue cycles (1).");
  });

  it("extends the cycle limit when the operator chooses continue", async () => {
    requestCycleLimitDecisionFromOperatorMock
      .mockResolvedValueOnce({
        decision: "continue",
        additionalCycles: 2,
        source: "discord",
      })
      .mockResolvedValueOnce({
        decision: "quit",
        additionalCycles: 0,
        source: "discord",
      });
    const { runWorkflowRuntimeLoop } = await import("./workflowRuntimeLoop.js");

    await runWorkflowRuntimeLoop({
      workDir: "/tmp/evolvo",
      runtimeState: createInitialRuntimeExecutionState(1),
      maxIssueCycles: 1,
      runLoopGitHubMaxRetries: 2,
      discordHandlers: {},
      defaultProjectContext: {
        owner: "owner",
        repo: "repo",
        workDir: "/tmp/evolvo",
      },
      issueManager: {} as never,
      projectsClient: {} as never,
      pullRequestClient: {} as never,
    });

    expect(requestCycleLimitDecisionFromOperatorMock).toHaveBeenNthCalledWith(1, 1);
    expect(requestCycleLimitDecisionFromOperatorMock).toHaveBeenNthCalledWith(2, 3);
    expect(console.log).toHaveBeenCalledWith(
      "Operator decision via Discord: continue (+2 cycles). New limit=3.",
    );
    expect(notifyCycleLimitDecisionAppliedInDiscordMock).toHaveBeenCalledWith({
      decision: "continue",
      currentLimit: 1,
      additionalCycles: 2,
      newLimit: 3,
    });
  });

  it("logs fallback and default prompt when the first workflow cycle fails", async () => {
    runWorkflowSchedulerCycleMock.mockRejectedValueOnce(new Error("workflow unavailable"));
    const { runWorkflowRuntimeLoop } = await import("./workflowRuntimeLoop.js");

    await runWorkflowRuntimeLoop({
      workDir: "/tmp/evolvo",
      runtimeState: createInitialRuntimeExecutionState(1),
      maxIssueCycles: 1,
      runLoopGitHubMaxRetries: 2,
      discordHandlers: {},
      defaultProjectContext: {
        owner: "owner",
        repo: "repo",
        workDir: "/tmp/evolvo",
      },
      issueManager: {} as never,
      projectsClient: {} as never,
      pullRequestClient: {} as never,
    });

    expect(logGitHubFallbackMock).toHaveBeenCalledWith(expect.any(Error));
    expect(console.log).toHaveBeenCalledWith("No open issues available. Create an issue first.");
  });
});
