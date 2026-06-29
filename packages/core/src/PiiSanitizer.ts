import type { IMiddleware, MiddlewareNext, SunglassesEvent } from './types.js';

/** Built-in property key deny-list */
const BUILTIN_DENIED_KEYS = new Set([
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
 * Regex patterns to mask PII substrings. Global flag is required for
 * `String.prototype.replace` to replace all occurrences in a single pass.
 */
const PII_PATTERNS: RegExp[] = [
  // Email (requires letter-only TLD)
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  // Phone (US/international, various formats)
  /(\+?1?\s?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g,
  // IPv4
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  // Credit card (major formats: 16 digits with optional separators)
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
];

/**
 * Built-in middleware that sanitizes event properties before they are queued.
 *
 * Sanitization order (allowedProperties takes precedence over deniedProperties):
 * 1. If allowedProperties is set: keep only those top-level keys.
 * 2. Else if deniedProperties is set: remove those top-level keys.
 * 3. Strip built-in PII key names (BUILTIN_DENIED_KEYS) at every nesting level.
 * 4. Recursively traverse objects and arrays; redact string values matching PII_PATTERNS.
 *
 * This middleware is always prepended to the pipeline by SunglassesCore.
 * It must never throw.
 */
export class PiiSanitizer implements IMiddleware {
  readonly name = 'PiiSanitizer';

  constructor(
    private readonly allowedProperties?: string[],
    private readonly deniedProperties?: string[]
  ) {}

  async process(
    event: SunglassesEvent,
    next: MiddlewareNext
  ): Promise<SunglassesEvent | null> {
    const sanitized = this.sanitizeProperties(event.properties);
    return next({ ...event, properties: sanitized });
  }

  private sanitizeProperties(
    props: Record<string, unknown>
  ): Record<string, unknown> {
    let result = { ...props };

    // Step 1: allowlist (most restrictive) — applied at top level only
    if (this.allowedProperties && this.allowedProperties.length > 0) {
      const allowed = new Set(this.allowedProperties);
      result = Object.fromEntries(
        Object.entries(result).filter(([key]) => allowed.has(key))
      );
      // Still recursively sanitize values within allowed keys
      return this.deepSanitizeValues(result) as Record<string, unknown>;
    }

    // Step 2: user-configured blocklist (top level)
    if (this.deniedProperties && this.deniedProperties.length > 0) {
      const denied = new Set(this.deniedProperties);
      result = Object.fromEntries(
        Object.entries(result).filter(([key]) => !denied.has(key))
      );
    }

    // Steps 3 + 4: strip PII keys and values recursively
    return this.deepSanitizeValues(result) as Record<string, unknown>;
  }

  /**
   * Recursively traverse an object or array:
   * - Remove keys in BUILTIN_DENIED_KEYS (case-insensitive)
   * - Redact string values that contain PII
   * - Recurse into nested objects and arrays
   */
  private deepSanitizeValues(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.deepSanitizeValues(item));
    }

    if (value !== null && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        // Step 3: strip built-in PII key names
        if (BUILTIN_DENIED_KEYS.has(key.toLowerCase())) continue;
        // Step 4: recurse into the value
        result[key] = this.deepSanitizeValues(val);
      }
      return result;
    }

    if (typeof value === 'string') {
      return this.maskPiiSubstrings(value);
    }

    return value;
  }

  /**
   * Replace every PII match in `value` with `'[redacted]'`, preserving the
   * surrounding text. This is safer than whole-value redaction for stack traces
   * and error messages that may contain PII alongside non-sensitive context.
   *
   * Each pattern must have the `g` (global) flag so all occurrences are replaced.
   */
  private maskPiiSubstrings(value: string): string {
    let result = value;
    for (const pattern of PII_PATTERNS) {
      // Reset lastIndex before each call — global regexes are stateful.
      pattern.lastIndex = 0;
      result = result.replace(pattern, '[redacted]');
    }
    return result;
  }
}
