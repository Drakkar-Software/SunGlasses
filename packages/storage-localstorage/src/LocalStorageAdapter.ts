import type { IStorageAdapter } from '@drakkar.software/sunglasses-core';

/**
 * IStorageAdapter implementation using the browser's localStorage API.
 *
 * Keys are namespaced with a configurable prefix (default: 'sg_') to avoid
 * collisions with other libraries or application data.
 *
 * Works in:
 * - All modern browsers
 * - Node.js environments that polyfill globalThis.localStorage
 */
export class LocalStorageAdapter implements IStorageAdapter {
  constructor(private readonly prefix: string = 'sg_') {}

  async read(key: string): Promise<string | null> {
    try {
      return globalThis.localStorage.getItem(this.prefixed(key));
    } catch {
      return null;
    }
  }

  async write(key: string, value: string): Promise<void> {
    try {
      globalThis.localStorage.setItem(this.prefixed(key), value);
    } catch (err) {
      // Quota exceeded: actionable — warn so developers know data isn't persisting
      if (err instanceof Error && err.name === 'QuotaExceededError') {
        console.warn('[SunGlasses] LocalStorageAdapter: storage quota exceeded — event data may not persist');
      }
      // Other errors (private/incognito mode, security restrictions) are expected and safe to ignore
    }
  }

  async delete(key: string): Promise<void> {
    try {
      globalThis.localStorage.removeItem(this.prefixed(key));
    } catch {
      // Ignore
    }
  }

  private prefixed(key: string): string {
    return `${this.prefix}${key}`;
  }
}
