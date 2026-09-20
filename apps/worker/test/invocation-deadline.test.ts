import { afterEach, describe, expect, it, vi } from "vitest";

import { InvocationDeadline } from "../src/invocation-deadline.js";

afterEach(() => vi.useRealTimers());

describe("invocation deadline", () => {
  it("uses one absolute deadline from API acceptance", async () => {
    vi.useFakeTimers();
    const acceptedAt = Date.now();
    const deadline = new InvocationDeadline(6_000, acceptedAt);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(deadline.signal.aborted).toBe(false);

    deadline.start();
    await vi.advanceTimersByTimeAsync(999);
    expect(deadline.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.deadlineAt).toBe(acceptedAt + 6_000);
  });
});
