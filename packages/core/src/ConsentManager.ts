import type { ConsentHistoryEntry, ConsentState, ConsentStatus, IStorageAdapter } from './types.js';
import type { Logger } from './utils/logger.js';
import { nowISO } from './utils/timestamp.js';

const STORAGE_KEY = 'sunglasses:consent';
const MAX_HISTORY_LENGTH = 10;

/**
 * Manages user consent state.
 *
 * Consent is persisted via the same IStorageAdapter used by the rest of the SDK,
 * so platform-correct storage is used automatically (localStorage on web,
 * AsyncStorage on React Native).
 *
 * State machine:
 *   unknown ──optIn()──▶ opted-in
 *   unknown ──optOut()──▶ opted-out
 *   opted-in ──optOut()──▶ opted-out
 *   opted-out ──optIn()──▶ opted-in
 *
 * Policy versioning:
 *   When `policyVersion` is provided to `initialize()` and differs from the
 *   stored version, the consent status is reset to 'unknown' — prompting the
 *   user to consent again under the new policy.
 */
export class ConsentManager {
  private state: ConsentState;

  constructor(
    private readonly storage: IStorageAdapter,
    private readonly logger: Logger
  ) {
    // Start unknown until initialize() loads persisted value
    this.state = { status: 'unknown', updatedAt: null };
  }

  /**
   * Load persisted consent state. Must be called once during SDK initialization.
   * @param defaultOptIn — when no persisted state exists, opt-in (true) or opt-out (false)
   * @param policyVersion — current policy version; if it differs from stored, consent resets
   */
  async initialize(defaultOptIn: boolean, policyVersion?: string): Promise<void> {
    try {
      const raw = await this.storage.read(STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as ConsentState;

        // Check if policy version has changed — if so, reset consent to unknown
        if (
          policyVersion !== undefined &&
          parsed.policyVersion !== undefined &&
          parsed.policyVersion !== policyVersion
        ) {
          this.logger.debug(
            'ConsentManager: policy version changed',
            parsed.policyVersion,
            '→',
            policyVersion,
            '— resetting consent'
          );
          // Append a history entry to record the reset event
          const historyEntry: ConsentHistoryEntry = {
            status: 'unknown',
            policyVersion,
            timestamp: nowISO(),
          };
          this.state = {
            status: 'unknown',
            updatedAt: nowISO(),
            policyVersion,
            history: this.appendHistory(parsed.history ?? [], historyEntry),
          };
          await this.persist();
          return;
        }

        this.state = parsed;
        // Ensure policyVersion is up to date if newly provided
        if (policyVersion !== undefined && this.state.policyVersion !== policyVersion) {
          this.state = { ...this.state, policyVersion };
          await this.persist();
        }
        this.logger.debug('ConsentManager: loaded persisted state', parsed.status);
        return;
      }
    } catch (err) {
      this.logger.warn('ConsentManager: failed to read persisted consent', err);
    }

    // First run — set from defaultOptIn config
    const initialStatus: ConsentStatus = defaultOptIn ? 'opted-in' : 'opted-out';
    this.state = {
      status: initialStatus,
      updatedAt: null,
      policyVersion,
      history: [],
    };
    this.logger.debug(
      'ConsentManager: first run, defaultOptIn=',
      defaultOptIn,
      '→',
      this.state.status
    );
    await this.persist();
  }

  get status(): ConsentStatus {
    return this.state.status;
  }

  isOptedIn(): boolean {
    return this.state.status === 'opted-in';
  }

  isOptedOut(): boolean {
    return this.state.status === 'opted-out';
  }

  async optIn(policyVersion?: string): Promise<void> {
    const timestamp = nowISO();
    const entry: ConsentHistoryEntry = {
      status: 'opted-in',
      policyVersion: policyVersion ?? this.state.policyVersion,
      timestamp,
    };
    this.state = {
      ...this.state,
      status: 'opted-in',
      updatedAt: timestamp,
      policyVersion: policyVersion ?? this.state.policyVersion,
      history: this.appendHistory(this.state.history ?? [], entry),
    };
    this.logger.debug('ConsentManager: opted in');
    await this.persist();
  }

  async optOut(policyVersion?: string): Promise<void> {
    const timestamp = nowISO();
    const entry: ConsentHistoryEntry = {
      status: 'opted-out',
      policyVersion: policyVersion ?? this.state.policyVersion,
      timestamp,
    };
    this.state = {
      ...this.state,
      status: 'opted-out',
      updatedAt: timestamp,
      policyVersion: policyVersion ?? this.state.policyVersion,
      history: this.appendHistory(this.state.history ?? [], entry),
    };
    this.logger.debug('ConsentManager: opted out');
    await this.persist();
  }

  /** Returns a copy of the consent audit trail (oldest first). */
  getHistory(): ConsentHistoryEntry[] {
    return [...(this.state.history ?? [])];
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private appendHistory(
    existing: ConsentHistoryEntry[],
    entry: ConsentHistoryEntry
  ): ConsentHistoryEntry[] {
    const updated = [...existing, entry];
    // Cap at MAX_HISTORY_LENGTH, keeping the most recent entries
    return updated.length > MAX_HISTORY_LENGTH
      ? updated.slice(updated.length - MAX_HISTORY_LENGTH)
      : updated;
  }

  private async persist(): Promise<void> {
    try {
      await this.storage.write(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      this.logger.warn('ConsentManager: failed to persist consent state', err);
    }
  }
}
