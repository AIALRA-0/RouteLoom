import { PgBoss } from "pg-boss";
import type { ExecutionChannel } from "@aialra/contracts";
import type { TransactionalSql } from "@aialra/persistence";

export interface JobQueue {
  enqueue(
    jobId: string,
    channel?: ExecutionChannel,
    deadlineMs?: number,
    transaction?: TransactionalSql,
  ): Promise<void>;
  enqueueChatGptWebQualification(runId: string, deadlineMs?: number): Promise<void>;
  cancel(jobId: string): Promise<void>;
  close(): Promise<void>;
}

export class NoopJobQueue implements JobQueue {
  readonly enqueued: string[] = [];
  readonly enqueuedQualifications: string[] = [];

  async enqueue(jobId: string): Promise<void> {
    this.enqueued.push(jobId);
  }

  async enqueueChatGptWebQualification(runId: string): Promise<void> {
    this.enqueuedQualifications.push(runId);
  }

  async cancel(): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    return;
  }
}

export class PgBossJobQueue implements JobQueue {
  private readonly boss: PgBoss;
  private started = false;

  constructor(connectionString: string) {
    this.boss = new PgBoss({ connectionString, schema: "pgboss" });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    await this.boss.start();
    await this.boss.createQueue("routeloom-jobs");
    await this.boss.createQueue("routeloom-codex-jobs");
    await this.boss.createQueue("routeloom-chatgpt-jobs");
    await this.boss.createQueue("chatgpt-web-qualifications");
    this.started = true;
  }

  async enqueue(
    jobId: string,
    channel: ExecutionChannel = "codex",
    deadlineMs = 120_000,
    transaction?: TransactionalSql,
  ): Promise<void> {
    await this.start();
    await this.boss.send(
      channel === "chatgpt_web" ? "routeloom-chatgpt-jobs" : "routeloom-codex-jobs",
      { jobId },
      {
        id: jobId,
        singletonKey: jobId,
        retryLimit: 0,
        expireInSeconds: queueExpirationSeconds(deadlineMs),
        ...(transaction ? { db: transaction } : {}),
      },
    );
  }

  async enqueueChatGptWebQualification(runId: string, deadlineMs = 600_000): Promise<void> {
    await this.start();
    await this.boss.send(
      "chatgpt-web-qualifications",
      { runId },
      {
        id: runId,
        singletonKey: runId,
        retryLimit: 0,
        expireInSeconds: queueExpirationSeconds(deadlineMs),
      },
    );
  }

  async cancel(jobId: string): Promise<void> {
    if (!this.started) {
      return;
    }
    await Promise.all(
      ["routeloom-jobs", "routeloom-codex-jobs", "routeloom-chatgpt-jobs"].map((queue) =>
        this.boss.cancel(queue, jobId),
      ),
    );
  }

  async close(): Promise<void> {
    if (this.started) {
      await this.boss.stop({ graceful: true, timeout: 10_000 });
    }
  }
}

const QUEUE_RESULT_GRACE_MS = 5 * 60_000;

export function queueExpirationSeconds(deadlineMs: number): number {
  const safeDeadlineMs = Number.isFinite(deadlineMs) ? Math.max(1_000, deadlineMs) : 120_000;
  return Math.ceil((safeDeadlineMs + QUEUE_RESULT_GRACE_MS) / 1_000);
}
