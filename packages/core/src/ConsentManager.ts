import type { ConsentState, ConsentStatus, IStorageAdapter } from './types.js';
import type { Logger } from './utils/logger.js';
import { nowISO } from './utils/timestamp.js';

const STORAGE_KEY = 'sunglasses:consent';

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
   */
  async initialize(defaultOptIn: boolean): Promise<void> {
    try {
      const raw = await this.storage.read(STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as ConsentState;
        this.state = parsed;
        this.logger.debug('ConsentManager: loaded persisted state', parsed.status);
        return;
      }
    } catch (err) {
      this.logger.warn('ConsentManager: failed to read persisted consent', err);
    }

    // First run — set from defaultOptIn config
    this.state = {
      status: defaultOptIn ? 'opted-in' : 'opted-out',
      updatedAt: null,
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

  async optIn(): Promise<void> {
    this.state = { status: 'opted-in', updatedAt: nowISO() };
    this.logger.debug('ConsentManager: opted in');
    await this.persist();
  }

  async optOut(): Promise<void> {
    this.state = { status: 'opted-out', updatedAt: nowISO() };
    this.logger.debug('ConsentManager: opted out');
    await this.persist();
  }

  private async persist(): Promise<void> {
    try {
      await this.storage.write(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      this.logger.warn('ConsentManager: failed to persist consent state', err);
    }
  }
}
