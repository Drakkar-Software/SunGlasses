import type { IdentityState, IStorageAdapter } from './types.js';
import type { Logger } from './utils/logger.js';
import { generateUUID, sha256Hex } from './utils/uuid.js';

const ANON_ID_KEY = 'sunglasses:anon_id';
const DISTINCT_ID_KEY = 'sunglasses:distinct_id';

/**
 * Manages user identity.
 *
 * - anonymousId: stable UUID generated on first run, persisted, never PII.
 *   Only regenerated when reset() is called.
 * - distinctId: set by identify(). Optionally hashed with SHA-256.
 *   null until identify() is called — events use anonymousId as distinctId.
 */
export class IdentityManager {
  private anonymousId: string = '';
  private distinctId: string | null = null;

  constructor(
    private readonly storage: IStorageAdapter,
    private readonly logger: Logger,
    private readonly anonymizeUserId: boolean
  ) {}

  /** Load persisted identity. Must be called once during SDK initialization. */
  async initialize(): Promise<void> {
    // Load or generate anonymousId
    try {
      const storedAnon = await this.storage.read(ANON_ID_KEY);
      if (storedAnon) {
        this.anonymousId = storedAnon;
      } else {
        this.anonymousId = generateUUID();
        await this.storage.write(ANON_ID_KEY, this.anonymousId);
      }
    } catch (err) {
      this.logger.warn('IdentityManager: failed to load anonymousId, generating new one', err);
      this.anonymousId = generateUUID();
    }

    // Load persisted distinctId (may be null)
    try {
      const storedDistinct = await this.storage.read(DISTINCT_ID_KEY);
      this.distinctId = storedDistinct ?? null;
    } catch (err) {
      this.logger.warn('IdentityManager: failed to load distinctId', err);
    }

    this.logger.debug('IdentityManager: initialized', {
      anonymousId: this.anonymousId,
      isIdentified: this.distinctId !== null,
    });
  }

  getState(): IdentityState {
    return {
      anonymousId: this.anonymousId,
      distinctId: this.distinctId,
      isIdentified: this.distinctId !== null,
    };
  }

  getAnonymousId(): string {
    return this.anonymousId;
  }

  /**
   * Resolved identity for use in events.
   * Returns distinctId if set, otherwise anonymousId.
   */
  getEffectiveDistinctId(): string {
    return this.distinctId ?? this.anonymousId;
  }

  /**
   * Link current session to a known user.
   * @param userId — the raw user identifier (hashed if anonymizeUserId=true)
   * @throws if userId is empty or whitespace-only
   */
  async identify(userId: string): Promise<string> {
    if (!userId || userId.trim().length === 0) {
      throw new Error('IdentityManager: userId cannot be empty');
    }
    const resolvedId = this.anonymizeUserId ? await sha256Hex(userId) : userId;
    this.distinctId = resolvedId;
    try {
      await this.storage.write(DISTINCT_ID_KEY, resolvedId);
    } catch (err) {
      this.logger.warn('IdentityManager: failed to persist distinctId', err);
    }
    this.logger.debug('IdentityManager: identified', { isAnonymized: this.anonymizeUserId });
    return resolvedId;
  }

  /**
   * Clear identity and generate a fresh anonymous ID.
   * Adapters should also call their own reset() if applicable.
   */
  async reset(): Promise<void> {
    this.distinctId = null;
    this.anonymousId = generateUUID();
    try {
      await this.storage.delete(DISTINCT_ID_KEY);
      await this.storage.write(ANON_ID_KEY, this.anonymousId);
    } catch (err) {
      this.logger.warn('IdentityManager: failed to persist reset identity', err);
    }
    this.logger.debug('IdentityManager: reset — new anonymousId generated');
  }
}
