export class InvocationDeadline {
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private readonly controller = new AbortController();

  readonly deadlineAt: number;

  constructor(deadlineMs: number, acceptedAt = Date.now()) {
    this.deadlineAt = acceptedAt + deadlineMs;
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  start(): void {
    if (this.started || this.controller.signal.aborted) return;
    this.started = true;
    this.timer = setTimeout(
      () => {
        this.controller.abort(new Error("deadline_exceeded"));
      },
      Math.max(1, this.deadlineAt - Date.now()),
    );
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
