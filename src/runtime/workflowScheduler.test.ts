import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StagedWorkInventory, StagedProjectInventory, StagedWorkItem } from "../issues/stagedWorkInventory.js";
import type { ProjectRecord } from "../projects/projectRegistry.js";
import { createDefaultProjectWorkflow } from "../projects/projectWorkflow.js";

const {
  runIssueGeneratorAgentMock,
  runPlanningStageAgentMock,
  runCodingAgentMock,
  runReleaseAgentMock,
  runReviewAgentMock,
  buildStagedWorkInventoryMock,
  getWorkflowWorkItemRecordMock,
  upsertWorkflowWorkItemRecordMock,
  readWorkflowAgentStateMock,
  updateWorkflowAgentStateMock,
  acquireCodingLeaseMock,
  recordProjectFailureMock,
  recordProjectStageTransitionMock,
  releaseCodingLeaseMock,
  setProjectActivityModeMock,
  setProjectCurrentWorkItemMock,
  deactivateProjectInStateMock,
} = vi.hoisted(() => ({
  runIssueGeneratorAgentMock: vi.fn(),
  runPlanningStageAgentMock: vi.fn(),
  runCodingAgentMock: vi.fn(),
  runReleaseAgentMock: vi.fn(),
  runReviewAgentMock: vi.fn(),
  buildStagedWorkInventoryMock: vi.fn(),
  getWorkflowWorkItemRecordMock: vi.fn(),
  upsertWorkflowWorkItemRecordMock: vi.fn(),
  readWorkflowAgentStateMock: vi.fn(),
  updateWorkflowAgentStateMock: vi.fn(),
  acquireCodingLeaseMock: vi.fn(),
  recordProjectFailureMock: vi.fn(),
  recordProjectStageTransitionMock: vi.fn(),
  releaseCodingLeaseMock: vi.fn(),
  setProjectActivityModeMock: vi.fn(),
  setProjectCurrentWorkItemMock: vi.fn(),
  deactivateProjectInStateMock: vi.fn(),
}));

vi.mock("../environment.js", () => ({
  OPENAI_API_KEY: "test-key",
}));

vi.mock("../agents/issueGeneratorAgent.js", () => ({
  runIssueGeneratorAgent: runIssueGeneratorAgentMock,
}));

vi.mock("../agents/planningStageAgent.js", () => ({
  runPlanningStageAgent: runPlanningStageAgentMock,
}));

vi.mock("../agents/runCodingAgent.js", () => ({
  configureCodingAgentExecutionContext: vi.fn(),
  runCodingAgent: runCodingAgentMock,
}));

vi.mock("../agents/runReleaseAgent.js", () => ({
  runReleaseAgent: runReleaseAgentMock,
}));

vi.mock("../agents/reviewAgent.js", () => ({
  runReviewAgent: runReviewAgentMock,
}));

vi.mock("../issues/stagedWorkInventory.js", () => ({
  buildStagedWorkInventory: buildStagedWorkInventoryMock,
}));

vi.mock("./workflowWorkItemState.js", () => ({
  getWorkflowWorkItemRecord: getWorkflowWorkItemRecordMock,
  upsertWorkflowWorkItemRecord: upsertWorkflowWorkItemRecordMock,
}));

vi.mock("./workflowAgentState.js", () => ({
  readWorkflowAgentState: readWorkflowAgentStateMock,
  updateWorkflowAgentState: updateWorkflowAgentStateMock,
}));

vi.mock("../projects/projectActivityState.js", () => ({
  acquireCodingLease: acquireCodingLeaseMock,
  recordProjectFailure: recordProjectFailureMock,
  recordProjectStageTransition: recordProjectStageTransitionMock,
  releaseCodingLease: releaseCodingLeaseMock,
  setProjectActivityMode: setProjectActivityModeMock,
  setProjectCurrentWorkItem: setProjectCurrentWorkItemMock,
}));

vi.mock("../projects/activeProjectsState.js", () => ({
  deactivateProjectInState: deactivateProjectInStateMock,
}));

vi.mock("../github/githubPullRequests.js", () => ({
  parseGitHubPullRequestUrl: vi.fn(() => ({
    owner: "Evolvo-org",
    repo: "evolvo-web",
    pullNumber: 12,
  })),
}));

function createProject(): ProjectRecord {
  return {
    slug: "evolvo-web",
    displayName: "Evolvo Web",
    kind: "managed",
    issueLabel: "project:evolvo-web",
    trackerRepo: {
      owner: "Evolvo-org",
      repo: "evolvo-ts",
      url: "https://github.com/Evolvo-org/evolvo-ts",
    },
    executionRepo: {
      owner: "Evolvo-org",
      repo: "evolvo-web",
      url: "https://github.com/Evolvo-org/evolvo-web",
      defaultBranch: "main",
    },
    cwd: "/tmp/evolvo-web",
    status: "active",
    sourceIssueNumber: 101,
    createdAt: "2026-03-08T00:00:00.000Z",
    updatedAt: "2026-03-08T00:00:00.000Z",
    provisioning: {
      labelCreated: true,
      repoCreated: true,
      workspacePrepared: true,
      lastError: null,
    },
    workflow: createDefaultProjectWorkflow("Evolvo-org"),
  };
}

function createItem(project: ProjectRecord, issueNumber: number, stage: StagedWorkItem["stage"]): StagedWorkItem {
  return {
    queueKey: `${project.slug}#${issueNumber}`,
    project,
    issueNumber,
    issueUrl: `https://github.com/${project.executionRepo.owner}/${project.executionRepo.repo}/issues/${issueNumber}`,
    title: `Issue ${issueNumber}`,
    description: `Description ${issueNumber}`,
    labels: [],
    stage,
    boardItemId: `item-${issueNumber}`,
    issueNodeId: `issue-node-${issueNumber}`,
    repository: {
      owner: project.executionRepo.owner,
      repo: project.executionRepo.repo,
      url: project.executionRepo.url,
      reference: `${project.executionRepo.owner}/${project.executionRepo.repo}`,
    },
  };
}

function createInventory(project: ProjectRecord, items: StagedWorkItem[]): StagedWorkInventory {
  const activity = {
    slug: project.slug,
    activityState: "active" as const,
    deferredStopMode: null,
    requestedBy: "operator",
    updatedAt: "2026-03-08T00:00:00.000Z",
    currentCodingLease: null,
    currentWorkItem: null,
    lastStageTransition: null,
    schedulingEligibility: { eligible: true, reason: null, lastScheduledAt: null },
    lastFailure: null,
  };
  const projectInventory: StagedProjectInventory = {
    project,
    activity,
    items,
    countsByStage: {
      Inbox: items.filter((item) => item.stage === "Inbox").length,
      Planning: items.filter((item) => item.stage === "Planning").length,
      "Ready for Dev": items.filter((item) => item.stage === "Ready for Dev").length,
      "In Dev": items.filter((item) => item.stage === "In Dev").length,
      "Ready for Review": items.filter((item) => item.stage === "Ready for Review").length,
      "In Review": items.filter((item) => item.stage === "In Review").length,
      "Ready for Release": items.filter((item) => item.stage === "Ready for Release").length,
      Releasing: items.filter((item) => item.stage === "Releasing").length,
      Blocked: items.filter((item) => item.stage === "Blocked").length,
      Done: items.filter((item) => item.stage === "Done").length,
    },
  };

  return {
    projects: [projectInventory],
    activityState: {
      version: 1,
      projects: [activity],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  readWorkflowAgentStateMock.mockResolvedValue({
    version: 1,
    reviewCursorProjectSlug: null,
    releaseCursorProjectSlug: null,
  });
  runIssueGeneratorAgentMock.mockResolvedValue([]);
  runPlanningStageAgentMock.mockResolvedValue([]);
  runCodingAgentMock.mockResolvedValue({
    summary: {
      pullRequestUrls: [],
      validationCommands: [],
      failedValidationCommands: [],
      finalResponse: "done",
    },
  });
  runReleaseAgentMock.mockResolvedValue({ mergedPullRequest: false });
  runReviewAgentMock.mockResolvedValue({
    decision: "approve",
    summary: "approved",
    reasons: [],
    finalResponse: "{}",
  });
  getWorkflowWorkItemRecordMock.mockResolvedValue(null);
  upsertWorkflowWorkItemRecordMock.mockResolvedValue(undefined);
  updateWorkflowAgentStateMock.mockResolvedValue(undefined);
  acquireCodingLeaseMock.mockResolvedValue(undefined);
  recordProjectFailureMock.mockResolvedValue(undefined);
  recordProjectStageTransitionMock.mockResolvedValue(undefined);
  releaseCodingLeaseMock.mockResolvedValue(undefined);
  setProjectActivityModeMock.mockResolvedValue(undefined);
  setProjectCurrentWorkItemMock.mockResolvedValue(undefined);
  deactivateProjectInStateMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetModules();
});

describe("runWorkflowSchedulerCycle", () => {
  it("tops up idea-stage items to five per project", async () => {
    const { runWorkflowSchedulerCycle } = await import("./workflowScheduler.js");
    const project = createProject();
    const inventory = createInventory(project, [
      createItem(project, 10, "Planning"),
      createItem(project, 11, "Planning"),
    ]);
    buildStagedWorkInventoryMock
      .mockResolvedValueOnce(inventory)
      .mockResolvedValueOnce(inventory);
    runIssueGeneratorAgentMock.mockResolvedValue([
      { title: "Idea A", description: "A" },
      { title: "Idea B", description: "B" },
      { title: "Idea C", description: "C" },
      { title: "Idea D", description: "D" },
    ]);

    const createIssue = vi.fn()
      .mockResolvedValueOnce({ ok: true, issue: { number: 101 } })
      .mockResolvedValueOnce({ ok: true, issue: { number: 102 } })
      .mockResolvedValueOnce({ ok: true, issue: { number: 103 } });
    const ensureRepositoryIssueItem = vi.fn()
      .mockResolvedValueOnce({ itemId: "item-101" })
      .mockResolvedValueOnce({ itemId: "item-102" })
      .mockResolvedValueOnce({ itemId: "item-103" });
    const moveProjectItemToStage = vi.fn().mockResolvedValue(undefined);

    const trackerIssueManager = {
      forRepository: vi.fn().mockReturnValue({
        listOpenIssues: vi.fn().mockResolvedValue([]),
        listRecentClosedIssues: vi.fn().mockResolvedValue([]),
        createIssue,
      }),
    };
    const boardsClient = {
      ensureRepositoryIssueItem,
      moveProjectItemToStage,
    };

    const result = await runWorkflowSchedulerCycle({
      workDir: "/tmp/evolvo-ts",
      defaultProject: {
        owner: "Evolvo-org",
        repo: "evolvo-ts",
        workDir: "/tmp/evolvo-ts",
      },
      trackerIssueManager: trackerIssueManager as never,
      boardsClient: boardsClient as never,
      pullRequestClient: { submitReview: vi.fn() } as never,
    });

    expect(runIssueGeneratorAgentMock).toHaveBeenCalledWith(expect.objectContaining({
      maxIssues: 3,
    }));
    expect(createIssue).toHaveBeenCalledTimes(3);
    expect(result.summary.issueGeneratorCreated).toBe(3);
    expect(moveProjectItemToStage).toHaveBeenCalledWith(project, "item-101", "Inbox");
    expect(moveProjectItemToStage).toHaveBeenCalledWith(project, "item-102", "Inbox");
    expect(moveProjectItemToStage).toHaveBeenCalledWith(project, "item-103", "Inbox");
  });

  it("does not let the planner add more than three items to Ready for Dev", async () => {
    const { runWorkflowSchedulerCycle } = await import("./workflowScheduler.js");
    const project = createProject();
    const inventory = createInventory(project, [
      createItem(project, 1, "Ready for Dev"),
      createItem(project, 2, "Ready for Dev"),
      createItem(project, 3, "Ready for Dev"),
      createItem(project, 4, "Planning"),
    ]);
    buildStagedWorkInventoryMock.mockResolvedValue(inventory);
    runPlanningStageAgentMock.mockResolvedValue([
      {
        issueNumber: 4,
        decision: "ready-for-dev",
        title: "Tightened title",
        description: "Tightened description",
        splitIssues: [],
        reasons: ["Implementation-ready."],
      },
    ]);

    const moveProjectItemToStage = vi.fn().mockResolvedValue(undefined);
    const updateIssue = vi.fn().mockResolvedValue({ ok: true });

    const trackerIssueManager = {
      forRepository: vi.fn().mockReturnValue({
        listOpenIssues: vi.fn().mockResolvedValue([]),
        listRecentClosedIssues: vi.fn().mockResolvedValue([]),
        updateIssue,
      }),
    };
    const boardsClient = {
      moveProjectItemToStage,
    };

    const result = await runWorkflowSchedulerCycle({
      workDir: "/tmp/evolvo-ts",
      defaultProject: {
        owner: "Evolvo-org",
        repo: "evolvo-ts",
        workDir: "/tmp/evolvo-ts",
      },
      trackerIssueManager: trackerIssueManager as never,
      boardsClient: boardsClient as never,
      pullRequestClient: { submitReview: vi.fn() } as never,
    });

    expect(result.summary.plannerMovedToReadyForDev).toBe(0);
    expect(updateIssue).toHaveBeenCalledWith(4, {
      title: "Tightened title",
      description: "Tightened description",
    });
    expect(moveProjectItemToStage).not.toHaveBeenCalledWith(project, "item-4", "Ready for Dev");
  });

  it("does not start a second dev item when one is already in In Dev", async () => {
    const { runWorkflowSchedulerCycle } = await import("./workflowScheduler.js");
    const project = createProject();
    const inventory = createInventory(project, [
      createItem(project, 1, "In Dev"),
      createItem(project, 2, "Ready for Dev"),
    ]);
    buildStagedWorkInventoryMock.mockResolvedValue(inventory);

    const moveProjectItemToStage = vi.fn().mockResolvedValue(undefined);
    const trackerIssueManager = {
      forRepository: vi.fn().mockReturnValue({
        listOpenIssues: vi.fn().mockResolvedValue([]),
        listRecentClosedIssues: vi.fn().mockResolvedValue([]),
      }),
    };

    const result = await runWorkflowSchedulerCycle({
      workDir: "/tmp/evolvo-ts",
      defaultProject: {
        owner: "Evolvo-org",
        repo: "evolvo-ts",
        workDir: "/tmp/evolvo-ts",
      },
      trackerIssueManager: trackerIssueManager as never,
      boardsClient: { moveProjectItemToStage } as never,
      pullRequestClient: { submitReview: vi.fn() } as never,
    });

    expect(result.summary.devStarted).toBe(0);
    expect(acquireCodingLeaseMock).not.toHaveBeenCalled();
    expect(moveProjectItemToStage).not.toHaveBeenCalledWith(project, "item-2", "In Dev");
  });

  it("allows review to move work back to Ready for Dev even when the cap is already full", async () => {
    const { runWorkflowSchedulerCycle } = await import("./workflowScheduler.js");
    const project = createProject();
    const initialInventory = createInventory(project, [
      createItem(project, 1, "Ready for Dev"),
      createItem(project, 2, "Ready for Dev"),
      createItem(project, 3, "Ready for Dev"),
      createItem(project, 9, "Ready for Review"),
    ]);
    const postReviewInventory = createInventory(project, [
      createItem(project, 1, "Ready for Dev"),
      createItem(project, 2, "Ready for Dev"),
      createItem(project, 3, "Ready for Dev"),
      createItem(project, 9, "Ready for Dev"),
    ]);
    buildStagedWorkInventoryMock
      .mockResolvedValueOnce(initialInventory)
      .mockResolvedValueOnce(postReviewInventory);
    getWorkflowWorkItemRecordMock.mockResolvedValue({
      queueKey: `${project.slug}#9`,
      projectSlug: project.slug,
      issueNumber: 9,
      branchName: "feature/pr-9",
      pullRequestUrl: "https://github.com/Evolvo-org/evolvo-web/pull/12",
      validationCommands: [],
      failedValidationCommands: [],
      implementationSummary: "done",
      reviewOutcome: null,
      reviewSummary: null,
      updatedAt: "2026-03-08T00:00:00.000Z",
    });
    runReviewAgentMock.mockResolvedValue({
      decision: "reject",
      summary: "Needs changes",
      reasons: ["Tests are missing."],
      finalResponse: "{}",
    });

    const moveProjectItemToStage = vi.fn().mockResolvedValue(undefined);
    const submitReview = vi.fn().mockResolvedValue(undefined);

    const trackerIssueManager = {
      forRepository: vi.fn().mockReturnValue({
        listOpenIssues: vi.fn().mockResolvedValue([]),
        listRecentClosedIssues: vi.fn().mockResolvedValue([]),
      }),
    };
    const boardsClient = {
      moveProjectItemToStage,
    };

    const result = await runWorkflowSchedulerCycle({
      workDir: "/tmp/evolvo-ts",
      defaultProject: {
        owner: "Evolvo-org",
        repo: "evolvo-ts",
        workDir: "/tmp/evolvo-ts",
      },
      trackerIssueManager: trackerIssueManager as never,
      boardsClient: boardsClient as never,
      pullRequestClient: { submitReview } as never,
    });

    expect(result.summary.reviewProcessed).toBe(true);
    expect(moveProjectItemToStage).toHaveBeenCalledWith(project, "item-9", "In Review");
    expect(moveProjectItemToStage).toHaveBeenCalledWith(project, "item-9", "Ready for Dev");
    expect(submitReview).toHaveBeenCalledTimes(1);
  });
});
