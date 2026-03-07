import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDiscordControlConfigFromEnv,
  notifyIssueStartedInDiscord,
  requestCycleLimitDecisionFromOperator,
  runDiscordOperatorControlStartupCheck,
} from "./operatorControl.js";

describe("operatorControl", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns null config when required Discord environment variables are missing", () => {
    expect(getDiscordControlConfigFromEnv({})).toBeNull();
  });

  it("returns null decision when Discord operator control is not configured", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "");
    vi.stubEnv("DISCORD_CONTROL_GUILD_ID", "");
    vi.stubEnv("DISCORD_CONTROL_CHANNEL_ID", "");
    vi.stubEnv("DISCORD_OPERATOR_USER_ID", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const decision = await requestCycleLimitDecisionFromOperator(100);

    expect(decision).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not send an issue-start notification when Discord operator control is not configured", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "");
    vi.stubEnv("DISCORD_CONTROL_GUILD_ID", "");
    vi.stubEnv("DISCORD_CONTROL_CHANNEL_ID", "");
    vi.stubEnv("DISCORD_OPERATOR_USER_ID", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await notifyIssueStartedInDiscord({
      issueNumber: 298,
      issueTitle: "Send Discord start embed",
      issueUrl: "https://github.com/evolvo-auto/evolvo-ts/issues/298",
      repository: "evolvo-auto/evolvo-ts",
      lifecycleState: "selected -> executing",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("logs startup preflight success when channel lookup and history read are accessible", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    vi.stubEnv("DISCORD_CONTROL_GUILD_ID", "guild-1");
    vi.stubEnv("DISCORD_CONTROL_CHANNEL_ID", "channel-1");
    vi.stubEnv("DISCORD_OPERATOR_USER_ID", "operator-1");

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "channel-1", guild_id: "guild-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "boot-1" }), { status: 200 }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchSpy);

    await runDiscordOperatorControlStartupCheck();

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(logSpy).toHaveBeenCalledWith(
      "Discord operator control startup preflight passed (verify-channel, read-history).",
    );
    expect(logSpy).toHaveBeenCalledWith("Discord operator control startup boot message posted.");
  });

  it("logs startup preflight step when Discord channel verification fails", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    vi.stubEnv("DISCORD_CONTROL_GUILD_ID", "guild-1");
    vi.stubEnv("DISCORD_CONTROL_CHANNEL_ID", "channel-1");
    vi.stubEnv("DISCORD_OPERATOR_USER_ID", "operator-1");

    const fetchSpy = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "Missing Access", code: 50001 }),
        { status: 403 },
      ),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchSpy);

    await runDiscordOperatorControlStartupCheck();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Discord operator control startup preflight failed: [verify-channel]"),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "Discord bot is missing access to the configured control channel. Verify DISCORD_CONTROL_GUILD_ID, DISCORD_CONTROL_CHANNEL_ID, and bot channel permissions.",
    );
  });

  it("logs startup boot message failure step when message post is denied", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    vi.stubEnv("DISCORD_CONTROL_GUILD_ID", "guild-1");
    vi.stubEnv("DISCORD_CONTROL_CHANNEL_ID", "channel-1");
    vi.stubEnv("DISCORD_OPERATOR_USER_ID", "operator-1");

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "channel-1", guild_id: "guild-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ message: "Missing Access", code: 50001 }),
          { status: 403 },
        ),
      );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchSpy);

    await runDiscordOperatorControlStartupCheck();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Discord operator control startup boot message failed: [send-boot-message]"),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "Discord bot is missing access to the configured control channel. Verify DISCORD_CONTROL_GUILD_ID, DISCORD_CONTROL_CHANNEL_ID, and bot channel permissions.",
    );
  });

  it("sends an embed issue-start notification with a GitHub link button", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    vi.stubEnv("DISCORD_CONTROL_GUILD_ID", "guild-1");
    vi.stubEnv("DISCORD_CONTROL_CHANNEL_ID", "channel-1");
    vi.stubEnv("DISCORD_OPERATOR_USER_ID", "operator-1");

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "channel-1", guild_id: "guild-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "message-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await notifyIssueStartedInDiscord({
      issueNumber: 298,
      issueTitle: "Send a Discord embed notification with GitHub issue link when starting a new issue",
      issueUrl: "https://github.com/evolvo-auto/evolvo-ts/issues/298",
      repository: "evolvo-auto/evolvo-ts",
      lifecycleState: "selected -> executing",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://discord.com/api/v10/channels/channel-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bot bot-token",
        }),
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://discord.com/api/v10/channels/channel-1/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "<@operator-1>",
          embeds: [
            {
              title: "Started Issue #298",
              description: "Send a Discord embed notification with GitHub issue link when starting a new issue",
              url: "https://github.com/evolvo-auto/evolvo-ts/issues/298",
              fields: [
                {
                  name: "State",
                  value: "selected -> executing",
                  inline: true,
                },
                {
                  name: "Repository",
                  value: "evolvo-auto/evolvo-ts",
                  inline: true,
                },
              ],
            },
          ],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: "Open GitHub Issue",
                  url: "https://github.com/evolvo-auto/evolvo-ts/issues/298",
                },
              ],
            },
          ],
        }),
      }),
    );
  });

  it("logs and swallows issue-start notification failures", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    vi.stubEnv("DISCORD_CONTROL_GUILD_ID", "guild-1");
    vi.stubEnv("DISCORD_CONTROL_CHANNEL_ID", "channel-1");
    vi.stubEnv("DISCORD_OPERATOR_USER_ID", "operator-1");

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "channel-1", guild_id: "guild-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ message: "Missing Access", code: 50001 }),
          { status: 403 },
        ),
      );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchSpy);

    await notifyIssueStartedInDiscord({
      issueNumber: 298,
      issueTitle: "Send Discord start embed",
      issueUrl: "https://github.com/evolvo-auto/evolvo-ts/issues/298",
      repository: "evolvo-auto/evolvo-ts",
      lifecycleState: "selected -> executing",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Discord issue start notification failed: [send-issue-start]"),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "Discord bot is missing access to the configured control channel. Verify DISCORD_CONTROL_GUILD_ID, DISCORD_CONTROL_CHANNEL_ID, and bot channel permissions.",
    );
  });

  it("returns continue with configured cycle extension when operator replies continue", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    vi.stubEnv("DISCORD_CONTROL_GUILD_ID", "guild-1");
    vi.stubEnv("DISCORD_CONTROL_CHANNEL_ID", "channel-1");
    vi.stubEnv("DISCORD_OPERATOR_USER_ID", "operator-1");
    vi.stubEnv("DISCORD_CYCLE_EXTENSION", "7");
    vi.stubEnv("DISCORD_OPERATOR_TIMEOUT_MS", "5000");
    vi.stubEnv("DISCORD_OPERATOR_POLL_INTERVAL_MS", "5");

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "channel-1", guild_id: "guild-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "5000" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ id: "5001", content: "continue", author: { id: "operator-1" } }]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const decisionPromise = requestCycleLimitDecisionFromOperator(100);
    await vi.runAllTimersAsync();
    const decision = await decisionPromise;

    expect(decision).toEqual({
      decision: "continue",
      additionalCycles: 7,
      source: "discord",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("returns quit when operator replies quit", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    vi.stubEnv("DISCORD_CONTROL_GUILD_ID", "guild-1");
    vi.stubEnv("DISCORD_CONTROL_CHANNEL_ID", "channel-1");
    vi.stubEnv("DISCORD_OPERATOR_USER_ID", "operator-1");
    vi.stubEnv("DISCORD_OPERATOR_TIMEOUT_MS", "5000");
    vi.stubEnv("DISCORD_OPERATOR_POLL_INTERVAL_MS", "5");

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "channel-1", guild_id: "guild-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "5000" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ id: "5001", content: "quit", author: { id: "operator-1" } }]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const decisionPromise = requestCycleLimitDecisionFromOperator(100);
    await vi.runAllTimersAsync();
    const decision = await decisionPromise;

    expect(decision).toEqual({
      decision: "quit",
      additionalCycles: 0,
      source: "discord",
    });
  });

  it("returns null when Discord API fails and logs a Missing Access hint", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    vi.stubEnv("DISCORD_CONTROL_GUILD_ID", "guild-1");
    vi.stubEnv("DISCORD_CONTROL_CHANNEL_ID", "channel-1");
    vi.stubEnv("DISCORD_OPERATOR_USER_ID", "operator-1");

    const fetchSpy = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "Missing Access", code: 50001 }),
        { status: 403 },
      ),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchSpy);

    const decision = await requestCycleLimitDecisionFromOperator(100);

    expect(decision).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Discord operator control failed: [verify-channel] Discord API request failed (403)"),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "Discord bot is missing access to the configured control channel. Verify DISCORD_CONTROL_GUILD_ID, DISCORD_CONTROL_CHANNEL_ID, and bot channel permissions.",
    );
  });
});
