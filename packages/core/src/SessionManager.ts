import type { IStorageAdapter, SessionState } from './types.js';
import type { Logger } from './utils/logger.js';
import { nowISO } from './utils/timestamp.js';
import { generateUUID } from './utils/uuid.js';

const STORAGE_KEY = 'sunglasses:session';
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1_000; // 30 minutes

/**
 * Manages a lightweight anonymous session.
 *
 * A session is a contiguous period of activity identified by a random UUID.
 * Sessions expire when the user is idle for longer than `idleTimeoutMs`.
 * Session IDs are never derived from PII — they are always fresh UUIDs.
 *
 * Usage:
 *   const sm = new SessionManager(storage, logger, 30 * 60_000);
 *   await sm.initialize();
 *   const { sessionId } = sm.getOrCreate();
 *   sm.touch(); // call on every event to reset the idle timer
 */
export class SessionManager {
  private session: SessionState | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly storage: IStorageAdapter,
    private readonly logger: Logger,
    private readonly idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS
  ) {}

  /**
   * Load the previous session from storage. If it has already expired, it is
   * discarded so that `getOrCreate()` will start a fresh one.
   */
  async initialize(): Promise<void> {
    try {
      const raw = await this.storage.read(STORAGE_KEY);
      if (raw !== null) {
        const state = JSON.parse(raw) as SessionState;
        const idleSinceMs = Date.now() - new Date(state.lastActiveAt).getTime();
        if (idleSinceMs < this.idleTimeoutMs) {
          this.session = state;
          this.logger.debug('SessionManager: resumed session', state.sessionId);
          this.resetIdleTimer();
          return;
        }
        this.logger.debug('SessionManager: previous session expired');
      }
    } catch (err) {
      this.logger.warn('SessionManager: failed to load persisted session', err);
    }
    // No valid session — will be created lazily on first getOrCreate()
    this.session = null;
  }

  /**
   * Return the current session, creating a new one if none exists.
   * A `$session_start` event should be emitted by the caller whenever this
   * method creates a new session (detectable by checking whether the returned
   * `eventCount` is 0).
   */
  getOrCreate(): SessionState {
    if (this.session === null) {
      this.session = {
        sessionId: generateUUID(),
        startedAt: nowISO(),
        lastActiveAt: nowISO(),
        eventCount: 0,
      };
      this.logger.debug('SessionManager: new session', this.session.sessionId);
      this.persist().catch(() => {});
      this.resetIdleTimer();
    }
    return this.session;
  }

  /**
   * Record activity — resets the idle expiry timer and updates `lastActiveAt`.
   * Call this after every event is successfully enqueued.
   */
  touch(now: Date = new Date()): void {
    if (this.session === null) return;
    this.session = {
      ...this.session,
      lastActiveAt: now.toISOString(),
      eventCount: this.session.eventCount + 1,
    };
    this.persist().catch(() => {});
    this.resetIdleTimer();
  }

  /**
   * Explicitly end the current session (e.g. on sign-out or reset).
   * Clears both in-memory state and storage.
   */
  async end(): Promise<void> {
    this.session = null;
    this.clearIdleTimer();
    try {
      await this.storage.delete(STORAGE_KEY);
    } catch (err) {
      this.logger.warn('SessionManager: failed to clear persisted session', err);
    }
  }

  /** The current session ID, or null if no session is active. */
  get sessionId(): string | null {
    return this.session?.sessionId ?? null;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.logger.debug('SessionManager: session expired due to inactivity');
      this.session = null;
      this.storage.delete(STORAGE_KEY).catch(() => {});
    }, this.idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private async persist(): Promise<void> {
    if (this.session === null) return;
    try {
      await this.storage.write(STORAGE_KEY, JSON.stringify(this.session));
    } catch (err) {
      this.logger.warn('SessionManager: failed to persist session', err);
    }
  }
}
