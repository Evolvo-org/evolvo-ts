import { describe, expect, it } from "vitest";
import {
  buildProjectProvisioningIssueBody,
  buildProjectProvisioningIssueTitle,
  isProjectProvisioningIssue,
  parseProjectProvisioningIssueMetadata,
} from "./projectProvisioningIssue.js";
import type { IssueSummary } from "./taskIssueManager.js";

function createIssue(overrides: Partial<IssueSummary> = {}): IssueSummary {
  return {
    number: 1,
    title: "Issue",
    description: "Description",
    state: "open",
    labels: [],
    ...overrides,
  };
}

describe("projectProvisioningIssue", () => {
  it("builds and parses project provisioning metadata blocks", () => {
    const body = buildProjectProvisioningIssueBody({
      owner: "evolvo-auto",
      displayName: "Habit CLI",
      slug: "habit-cli",
      repositoryName: "habit-cli",
      issueLabel: "project:habit-cli",
      workspacePath: "/home/paddy/habit-cli",
      requestedBy: "discord:operator-1",
      requestedAt: "2026-03-07T12:00:00.000Z",
    });

    expect(buildProjectProvisioningIssueTitle("Habit CLI")).toBe("Start project Habit CLI");
    expect(parseProjectProvisioningIssueMetadata(body)).toEqual({
      owner: "evolvo-auto",
      displayName: "Habit CLI",
      slug: "habit-cli",
      repositoryName: "habit-cli",
      issueLabel: "project:habit-cli",
      workspacePath: "/home/paddy/habit-cli",
      requestedBy: "discord:operator-1",
      requestedAt: "2026-03-07T12:00:00.000Z",
    });
  });

  it("recognizes provisioning issues by metadata block", () => {
    const issue = createIssue({
      title: "Start project Habit CLI",
      description: buildProjectProvisioningIssueBody({
        owner: "evolvo-auto",
        displayName: "Habit CLI",
        slug: "habit-cli",
        repositoryName: "habit-cli",
        issueLabel: "project:habit-cli",
        workspacePath: "/home/paddy/habit-cli",
        requestedBy: "discord:operator-1",
        requestedAt: "2026-03-07T12:00:00.000Z",
      }),
    });

    expect(isProjectProvisioningIssue(issue)).toBe(true);
  });

  it("returns null for malformed provisioning metadata", () => {
    expect(
      parseProjectProvisioningIssueMetadata("<!-- evolvo:project-provisioning\nslug: habit-cli\n-->"),
    ).toBeNull();
    expect(isProjectProvisioningIssue(createIssue())).toBe(false);
  });

  it("parses legacy workspace_relative_path metadata for backward compatibility", () => {
    expect(
      parseProjectProvisioningIssueMetadata([
        "<!-- evolvo:project-provisioning",
        "owner: evolvo-auto",
        "display_name: Habit CLI",
        "slug: habit-cli",
        "repo_name: habit-cli",
        "issue_label: project:habit-cli",
        "workspace_relative_path: projects/habit-cli",
        "requested_by: discord:operator-1",
        "requested_at: 2026-03-07T12:00:00.000Z",
        "-->",
      ].join("\n")),
    ).toEqual({
      owner: "evolvo-auto",
      displayName: "Habit CLI",
      slug: "habit-cli",
      repositoryName: "habit-cli",
      issueLabel: "project:habit-cli",
      workspacePath: "projects/habit-cli",
      requestedBy: "discord:operator-1",
      requestedAt: "2026-03-07T12:00:00.000Z",
    });
  });
});
