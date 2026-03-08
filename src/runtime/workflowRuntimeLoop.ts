import type { TaskIssueManager } from "../issues/taskIssueManager.js";
import type { DefaultProjectContext } from "../projects/projectRegistry.js";
import type { GitHubProjectsV2Client } from "../github/githubProjectsV2.js";
import type { GitHubPullRequestClient } from "../github/githubPullRequests.js";
import {
  DEFAULT_PROMPT,
  getRunLoopRetryDelayMs,
  isTransientGitHubError,
  logGitHubFallback,
  waitForRunLoopRetry,
} from "./loopUtils.js";
import {
  notifyCycleLimitDecisionAppliedInDiscord,
  notifyRuntimeQuittingInDiscord,
  requestCycleLimitDecisionFromOperator,
  type DiscordControlHandlers,
} from "./operatorControl.js";
import type { RuntimeExecutionState } from "./runtimeExecutionState.js";
import { stopIfSingleTaskGracefulShutdownRequested } from "./runtimeShutdownGuards.js";
import { runWorkflowSchedulerCycle } from "./workflowScheduler.js";

function logWorkflowCycleSummary(cycle: number, workflowCycle: Awaited<ReturnType<typeof runWorkflowSchedulerCycle>>): void {
  const projectStageSummary = workflowCycle.inventory.projects.map((projectInventory) =>
    `${projectInventory.project.slug}: Inbox=${projectInventory.countsByStage.Inbox}, Planning=${projectInventory.countsByStage.Planning}, Ready=${projectInventory.countsByStage["Ready for Dev"]}, InDev=${projectInventory.countsByStage["In Dev"]}, Review=${projectInventory.countsByStage["Ready for Review"]}, Release=${projectInventory.countsByStage["Ready for Release"]}, Blocked=${projectInventory.countsByStage.Blocked}`
  ).join(" | ");
  console.log(
    `[workflow] cycle=${cycle} generatorCreated=${workflowCycle.summary.issueGeneratorCreated} plannerReady=${workflowCycle.summary.plannerMovedToReadyForDev} plannerBlocked=${workflowCycle.summary.plannerBlocked} devStarted=${workflowCycle.summary.devStarted} reviewProcessed=${workflowCycle.summary.reviewProcessed} releaseProcessed=${workflowCycle.summary.releaseProcessed}`,
  );
  if (projectStageSummary) {
    console.log(`[workflow] stages ${projectStageSummary}`);
  }
}

export async function runWorkflowRuntimeLoop(options: {
  workDir: string;
  runtimeState: RuntimeExecutionState;
  maxIssueCycles: number;
  runLoopGitHubMaxRetries: number;
  discordHandlers: DiscordControlHandlers;
  defaultProjectContext: DefaultProjectContext;
  issueManager: TaskIssueManager;
  projectsClient: GitHubProjectsV2Client;
  pullRequestClient: GitHubPullRequestClient;
}): Promise<void> {
  if (await stopIfSingleTaskGracefulShutdownRequested(options.workDir, "Stopping before starting a new task.", options.discordHandlers)) {
    return;
  }

  let cycleLimit = options.maxIssueCycles;
  for (let cycle = 1; ; cycle += 1) {
    options.runtimeState.runtimeStatusState = "active";
    options.runtimeState.runtimeStatusActivitySummary = "Selecting the next issue.";
    options.runtimeState.runtimeStatusCycle = cycle;
    options.runtimeState.runtimeStatusCycleLimit = cycleLimit;
    options.runtimeState.runtimeStatusIssue = null;
    if (await stopIfSingleTaskGracefulShutdownRequested(options.workDir, "Stopping before starting a new task.", options.discordHandlers)) {
      return;
    }

    if (cycle > cycleLimit) {
      options.runtimeState.runtimeStatusState = "waiting";
      options.runtimeState.runtimeStatusActivitySummary = "Waiting for operator cycle-limit decision.";
      const operatorDecision = await requestCycleLimitDecisionFromOperator(cycleLimit);
      if (operatorDecision?.decision === "continue" && operatorDecision.additionalCycles > 0) {
        const currentLimit = cycleLimit;
        cycleLimit += operatorDecision.additionalCycles;
        options.runtimeState.runtimeStatusState = "active";
        options.runtimeState.runtimeStatusActivitySummary = "Resuming work after cycle-limit extension.";
        options.runtimeState.runtimeStatusCycleLimit = cycleLimit;
        console.log(
          `Operator decision via Discord: continue (+${operatorDecision.additionalCycles} cycles). New limit=${cycleLimit}.`,
        );
        await notifyCycleLimitDecisionAppliedInDiscord({
          decision: "continue",
          currentLimit,
          additionalCycles: operatorDecision.additionalCycles,
          newLimit: cycleLimit,
        });
        continue;
      }
      if (operatorDecision?.decision === "quit") {
        console.error("Operator decision via Discord: quit.");
        options.runtimeState.runtimeStatusState = "stopping";
        options.runtimeState.runtimeStatusActivitySummary = "Stopping after operator cycle-limit quit decision.";
        await notifyCycleLimitDecisionAppliedInDiscord({
          decision: "quit",
          currentLimit: cycleLimit,
        });
      }
      console.error(`Reached the maximum number of issue cycles (${cycleLimit}).`);
      if (operatorDecision?.decision !== "quit") {
        options.runtimeState.runtimeStatusState = "stopping";
        options.runtimeState.runtimeStatusActivitySummary = `Stopping because cycle limit ${cycleLimit} was reached.`;
        await notifyRuntimeQuittingInDiscord(
          `Cycle limit of ${cycleLimit} was reached and no continue decision was applied.`,
        );
      }
      return;
    }

    let retryAttempt = 0;
    while (true) {
      try {
        options.runtimeState.runtimeStatusState = "active";
        options.runtimeState.runtimeStatusActivitySummary = "Running staged project workflow.";
        const workflowCycle = await runWorkflowSchedulerCycle({
          workDir: options.workDir,
          defaultProject: options.defaultProjectContext,
          trackerIssueManager: options.issueManager,
          boardsClient: options.projectsClient,
          pullRequestClient: options.pullRequestClient,
        });
        logWorkflowCycleSummary(cycle, workflowCycle);
        await waitForRunLoopRetry(1_000);
        break;
      } catch (error) {
        if (isTransientGitHubError(error) && retryAttempt < options.runLoopGitHubMaxRetries) {
          retryAttempt += 1;
          const delayMs = getRunLoopRetryDelayMs(retryAttempt);
          const message = error instanceof Error ? error.message : "unknown error";
          console.error(
            `Transient GitHub issue sync failure on cycle ${cycle} (attempt ${retryAttempt}/${options.runLoopGitHubMaxRetries}). Retrying in ${delayMs}ms. Error: ${message}`,
          );
          await waitForRunLoopRetry(delayMs);
          continue;
        }

        logGitHubFallback(error);
        if (cycle === 1) {
          console.log(DEFAULT_PROMPT);
        }
        return;
      }
    }
  }
}
