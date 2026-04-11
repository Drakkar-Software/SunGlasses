import type { IStorageAdapter } from './types.js';
import type { Logger } from './utils/logger.js';

const STORAGE_KEY = 'sunglasses:traits';

/**
 * PII key names that are silently stripped before traits are stored.
 * Mirrors the BUILTIN_DENIED_KEYS in PiiSanitizer.
 */
const SENSITIVE_KEYS = new Set([
  'email',
  'phone',
  'password',
  'passwd',
  'secret',
  'ssn',
  'social_security',
  'credit_card',
  'card_number',
  'cvv',
  'ip',
  'ip_address',
]);

/**
 * Persists user traits set via `identify()` and makes them available for
 * enriching every subsequent event's `context.traits`.
 *
 * Traits are merged (not replaced) on each `setTraits()` call. Keys whose
 * names appear in the PII deny-list are stripped before storage.
 *
 * Traits are forwarded to analytics backends in `event.context.traits` — they
 * do NOT appear in `event.properties` to avoid polluting per-event data.
 */
export class TraitManager {
  private traits: Record<string, unknown> = {};

  constructor(
    private readonly storage: IStorageAdapter,
    private readonly logger: Logger
  ) {}

  /**
   * Load persisted traits from storage. Call once during SDK initialization.
   */
  async initialize(): Promise<void> {
    try {
      const raw = await this.storage.read(STORAGE_KEY);
      if (raw !== null) {
        this.traits = JSON.parse(raw) as Record<string, unknown>;
        this.logger.debug('TraitManager: loaded traits', Object.keys(this.traits));
      }
    } catch (err) {
      this.logger.warn('TraitManager: failed to load persisted traits', err);
      this.traits = {};
    }
  }

  /**
   * Merge new traits into the persisted set.
   * Sensitive keys (email, phone, password, etc.) are stripped silently.
   * Passing `null` as a value removes that key.
   */
  async setTraits(traits: Record<string, unknown>): Promise<void> {
    const sanitized = this.sanitize(traits);
    // Merge: allow null to remove a key, otherwise add/update
    for (const [key, value] of Object.entries(sanitized)) {
      if (value === null) {
        delete this.traits[key];
      } else {
        this.traits[key] = value;
      }
    }
    await this.persist();
  }

  /** Return a shallow copy of the current traits object. */
  getTraits(): Record<string, unknown> {
    return { ...this.traits };
  }

  /** Remove all stored traits (called on reset()). */
  async clearTraits(): Promise<void> {
    this.traits = {};
    try {
      await this.storage.delete(STORAGE_KEY);
    } catch (err) {
      this.logger.warn('TraitManager: failed to clear persisted traits', err);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private sanitize(traits: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(traits)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        this.logger.debug('TraitManager: stripped sensitive key', key);
        continue;
      }
      // Deep-clone objects/arrays to prevent callers mutating stored traits
      // after calling setTraits(). Primitives and null are copied as-is.
      result[key] = deepClone(value);
    }
    return result;
  }

  private async persist(): Promise<void> {
    try {
      await this.storage.write(STORAGE_KEY, JSON.stringify(this.traits));
    } catch (err) {
      this.logger.warn('TraitManager: failed to persist traits', err);
    }
  }
}

/**
 * Deep-clone a value using JSON round-trip.
 * Returns primitives and null as-is (they are immutable).
 * Non-serialisable values (functions, undefined, Dates) are coerced the same
 * way they would be if stored via JSON.stringify in persist().
 */
function deepClone(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return value; // fall back to original reference if not serialisable
  }
}
