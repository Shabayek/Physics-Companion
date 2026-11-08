// Offline-first submission queue, persisted so scores survive reloads and network outages.
import type { KeyValueStorage } from './localLeaderboard';
import type { LeaderboardService, ScoreSubmission } from './types';

export const QUEUE_KEY = 'physics-companion-score-queue';
export const MAX_QUEUE = 50;
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

export interface QueueItem {
  submission: ScoreSubmission;
  attempts: number;
  nextAttemptAt: number;
}

export interface FlushReport {
  accepted: { submission: ScoreSubmission; rank?: number }[];
  rejected: { submission: ScoreSubmission; code?: string }[];
  /** Stopped early because of a network error. */
  offline: boolean;
  remaining: number;
}

export function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
}

export class SubmissionQueue {
  private readonly storage: KeyValueStorage;
  private readonly now: () => number;
  private flushing: Promise<FlushReport> | null = null;

  constructor(storage: KeyValueStorage, now: () => number = () => Date.now()) {
    this.storage = storage;
    this.now = now;
  }

  items(): QueueItem[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(QUEUE_KEY) ?? '[]');
      return Array.isArray(parsed) ? (parsed as QueueItem[]).filter((i) => i && typeof i === 'object' && i.submission) : [];
    } catch {
      return [];
    }
  }

  private write(items: QueueItem[]): void {
    if (items.length === 0) this.storage.removeItem(QUEUE_KEY);
    else this.storage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
  }

  enqueue(submission: ScoreSubmission): void {
    const items = this.items().filter((i) => i.submission.clientId !== submission.clientId);
    this.write([...items, { submission, attempts: 0, nextAttemptAt: 0 }]);
  }

  clear(): void {
    this.write([]);
  }

  /** Sends due items in order. Concurrent calls share one flush. */
  flush(service: LeaderboardService, force = false): Promise<FlushReport> {
    this.flushing ??= this.run(service, force).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async run(service: LeaderboardService, force: boolean): Promise<FlushReport> {
    const report: FlushReport = { accepted: [], rejected: [], offline: false, remaining: 0 };
    const items = this.items();
    const keep: QueueItem[] = [];
    for (const [index, item] of items.entries()) {
      if (report.offline || (!force && item.nextAttemptAt > this.now())) {
        keep.push(item);
        continue;
      }
      try {
        const result = await service.submit(item.submission);
        if (result.status === 'accepted' || result.status === 'duplicate') {
          report.accepted.push({ submission: item.submission, ...(result.rank !== undefined ? { rank: result.rank } : {}) });
        } else if (result.status === 'rejected') {
          report.rejected.push({ submission: item.submission, ...(result.code ? { code: result.code } : {}) });
        } else {
          const attempts = item.attempts + 1;
          keep.push({ ...item, attempts, nextAttemptAt: this.now() + backoffMs(attempts) });
        }
      } catch {
        // Probably offline: keep this and every later item for the next flush.
        const attempts = item.attempts + 1;
        keep.push({ ...item, attempts, nextAttemptAt: this.now() + backoffMs(attempts) });
        keep.push(...items.slice(index + 1));
        report.offline = true;
        break;
      }
    }
    // Items enqueued while flushing are kept too.
    const added = this.items().filter((i) => !items.some((o) => o.submission.clientId === i.submission.clientId));
    this.write([...keep, ...added]);
    report.remaining = keep.length + added.length;
    return report;
  }
}
