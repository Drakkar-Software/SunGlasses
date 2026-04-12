import type { IStorageAdapter, SunglassesEvent } from './types.js';
import type { Logger } from './utils/logger.js';

const STORAGE_KEY = 'sg:queue';

/**
 * In-memory event queue with persistence.
 *
 * - Events are held in memory and persisted to IStorageAdapter after every enqueue.
 * - On initialize(), the queue is loaded from storage (survives app restarts).
 * - When the queue exceeds maxSize, the oldest events are dropped (FIFO).
 * - flush() pops up to batchSize events for delivery; callers remove them on success.
 */
export class EventQueue {
  private queue: SunglassesEvent[] = [];
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistPending = false;

  constructor(
    private readonly storage: IStorageAdapter,
    private readonly logger: Logger,
    private readonly maxSize: number
  ) {}

  /** Load persisted queue. Call once during SDK initialization. */
  async initialize(): Promise<void> {
    try {
      const raw = await this.storage.read(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SunglassesEvent[];
        this.queue = Array.isArray(parsed) ? parsed : [];
        this.logger.debug(`EventQueue: loaded ${this.queue.length} events from storage`);
      }
    } catch (err) {
      this.logger.warn('EventQueue: failed to load persisted queue — starting empty', err);
      this.queue = [];
    }
  }

  /** Add an event to the queue. Triggers async persistence (debounced). */
  enqueue(event: SunglassesEvent): void {
    // Guard: ensure the event can be JSON-serialised before it enters the queue.
    // SunglassesEvent properties come from user code and could contain circular
    // references or non-serialisable values (e.g. Functions).
    try {
      JSON.stringify(event);
    } catch {
      this.logger.warn('EventQueue: event contains non-serialisable data — dropped', event.event);
      return;
    }

    if (this.queue.length >= this.maxSize) {
      // Drop the oldest event to make room
      this.queue.shift();
      this.logger.warn('EventQueue: maxSize reached — oldest event dropped');
    }
    this.queue.push(event);
    this.schedulePersist();
  }

  /** Return up to `batchSize` events without removing them. */
  peek(batchSize: number): SunglassesEvent[] {
    return this.queue.slice(0, batchSize);
  }

  /** Remove the first `count` events (call after successful adapter.send). */
  remove(count: number): void {
    this.queue.splice(0, count);
    this.schedulePersist();
  }

  get size(): number {
    return this.queue.length;
  }

  /** Force-persist the queue immediately. */
  async persist(): Promise<void> {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persistPending = false;
    try {
      await this.storage.write(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (err) {
      this.logger.warn('EventQueue: failed to persist queue', err);
    }
  }

  /** Clear queue from memory and storage. */
  async clear(): Promise<void> {
    this.queue = [];
    try {
      await this.storage.delete(STORAGE_KEY);
    } catch (err) {
      this.logger.warn('EventQueue: failed to clear persisted queue', err);
    }
  }

  private schedulePersist(): void {
    if (this.persistPending) return;
    this.persistPending = true;
    // Debounce: write after current call-stack clears
    this.persistTimer = setTimeout(() => {
      this.persistPending = false;
      this.persistTimer = null;
      this.persist().catch(() => {
        // Already logged inside persist()
      });
    }, 0);
  }
}
