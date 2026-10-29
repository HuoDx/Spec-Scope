/**
 * @fileoverview Bounded, coalescing async dispatcher.
 *
 * Items are keyed by canonical workspace-relative source path. Guarantees:
 *   - At most `limit()` items run at once (read on every dispatch, so a
 *     settings change applies to the next start, never to running work).
 *   - At most one running item per key.
 *   - At most one pending item per key: a newer submission replaces the
 *     older pending one, which is returned so the caller can mark it
 *     superseded. `A@r1 -> A@r2 -> A@r3` while r1 runs leaves only r3
 *     pending.
 *   - Pending keys start in submission order once a slot and their key free.
 *
 * The queue knows nothing about jobs, SQLite, or Pi; `run` owns all of that.
 */

export interface QueueSnapshot<T> {
  active: T[];
  pending: T[];
}

export class CoalescingQueue<T> {
  private readonly active = new Map<string, T>();
  private readonly pending = new Map<string, T>();

  /**
   * @param limit Current maximum concurrency (values below 1 count as 1).
   * @param run Executes one item; rejections are swallowed so the queue
   *     always advances. `run` is expected to record its own failures.
   * @param changed Called after every state change, for UI refresh.
   */
  constructor(
    private readonly limit: () => number,
    private readonly run: (item: T) => Promise<void>,
    private readonly changed: () => void = () => {},
  ) {}

  /** Enqueues `item` under `key`, starting it immediately if possible. */
  submit(key: string, item: T): { state: "queued" | "running";
    replaced?: T } {
    const replaced = this.pending.get(key);
    this.pending.delete(key);
    this.pending.set(key, item);
    this.pump();
    const state = this.active.get(key) === item ? "running" : "queued";
    return { state, replaced };
  }

  /** Starts pending items while capacity allows. Safe to call any time. */
  pump(): void {
    for (const [key, item] of this.pending) {
      if (this.active.size >= Math.max(1, this.limit())) break;
      if (this.active.has(key)) continue;
      this.pending.delete(key);
      this.active.set(key, item);
      this.start(key, item);
    }
    this.changed();
  }

  snapshot(): QueueSnapshot<T> {
    return { active: [...this.active.values()],
      pending: [...this.pending.values()] };
  }

  private start(key: string, item: T): void {
    // Defer to a microtask so `submit` returns before any work begins.
    void Promise.resolve()
      .then(() => this.run(item))
      .catch(() => undefined)
      .finally(() => {
        this.active.delete(key);
        this.pump();
      });
  }
}
