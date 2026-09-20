import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

describe("browser slot reset ownership", () => {
  it("does not let a late reset from an old intent clear a newly assigned intent", async () => {
    const source = readFileSync(new URL("../extension/service-worker.js", import.meta.url), "utf8");
    const code = source.slice(
      source.indexOf("async function resetSlot("),
      source.indexOf("async function ensurePool("),
    );
    const navigateToFreshChat = vi.fn(async () => "old-document");
    const patchSlot = vi.fn(async (slot: Record<string, unknown>, patch: object) => {
      Object.assign(slot, patch);
    });
    const resetSlot = runInNewContext(`${code}; resetSlot`, {
      patchSlot,
      navigateToFreshChat,
      waitForReadyPage: async () => ({
        diagnostics: {
          pageKind: "home",
          userTurnCount: 0,
          assistantTurnCount: 0,
          composerTextLength: 0,
          generationActive: false,
          documentToken: "fresh-document",
        },
      }),
      clearComposerDraft: vi.fn(),
      sendToTab: vi.fn(),
      manualRecoveryState: () => null,
      RESET_BACKOFF_INITIAL_MS: 30_000,
      RESET_BACKOFF_MAX_MS: 300_000,
      Date,
      Math,
      Number,
      Promise,
      setTimeout,
    }) as (slot: Record<string, unknown>, expectedIntentId?: string) => Promise<unknown>;
    const slot = {
      intentId: "intent-a",
      state: "ready",
      resetPromise: null,
      resetFailureCount: 0,
      tabId: 1,
    };

    await expect(resetSlot(slot, "intent-a")).resolves.toBeTruthy();
    slot.intentId = "intent-b";
    slot.state = "ready";
    await expect(resetSlot(slot, "intent-a")).resolves.toBeNull();

    expect(slot.intentId).toBe("intent-b");
    expect(navigateToFreshChat).toHaveBeenCalledOnce();
  });

  it("cancels every active page invocation when the controller disconnects", async () => {
    const source = readFileSync(new URL("../extension/service-worker.js", import.meta.url), "utf8");
    const code = source.slice(
      source.indexOf("async function cancelDisconnectedJobs("),
      source.indexOf(
        "chrome.runtime.onMessage.addListener",
        source.indexOf("async function cancelDisconnectedJobs("),
      ),
    );
    const activeJobs = new Map([
      ["job-a", "slot-a"],
      ["job-b", "slot-b"],
    ]);
    const cancel = vi.fn(async (jobId: string) => {
      activeJobs.delete(jobId);
    });
    const cancelDisconnectedJobs = runInNewContext(`${code}; cancelDisconnectedJobs`, {
      activeJobs,
      cancel,
      Promise,
    }) as () => Promise<void>;

    await cancelDisconnectedJobs();

    expect(cancel).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledWith("job-a");
    expect(cancel).toHaveBeenCalledWith("job-b");
    expect(activeJobs.size).toBe(0);
  });
});
