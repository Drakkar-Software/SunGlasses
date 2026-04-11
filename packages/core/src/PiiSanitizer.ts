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

/** Regex patterns to detect PII in string values */
const PII_PATTERNS: RegExp[] = [
  // Email
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
  // Phone (US/international)
  /(\+?1?\s?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/,
  // IPv4
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  // Credit card (major formats)
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
];

/**
 * Built-in middleware that sanitizes event properties before they are queued.
 *
 * Sanitization order (when both allowedProperties and deniedProperties are set,
 * allowedProperties takes precedence):
 * 1. If allowedProperties is set: keep only those keys.
 * 2. Else if deniedProperties is set: remove those keys.
 * 3. Strip built-in PII key names (BUILTIN_DENIED_KEYS).
 * 4. Strip property values that match PII_PATTERNS.
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

    // Step 1: allowlist (most restrictive)
    if (this.allowedProperties && this.allowedProperties.length > 0) {
      const allowed = new Set(this.allowedProperties);
      result = Object.fromEntries(
        Object.entries(result).filter(([key]) => allowed.has(key))
      );
      return result; // No further processing needed
    }

    // Step 2: user-configured blocklist
    if (this.deniedProperties && this.deniedProperties.length > 0) {
      const denied = new Set(this.deniedProperties);
      result = Object.fromEntries(
        Object.entries(result).filter(([key]) => !denied.has(key))
      );
    }

    // Step 3: built-in key deny-list
    result = Object.fromEntries(
      Object.entries(result).filter(([key]) => !BUILTIN_DENIED_KEYS.has(key.toLowerCase()))
    );

    // Step 4: strip values that match PII patterns
    result = Object.fromEntries(
      Object.entries(result).map(([key, value]) => {
        if (typeof value === 'string' && this.containsPii(value)) {
          return [key, '[redacted]'];
        }
        return [key, value];
      })
    );

    return result;
  }

  private containsPii(value: string): boolean {
    return PII_PATTERNS.some((pattern) => pattern.test(value));
  }
}
