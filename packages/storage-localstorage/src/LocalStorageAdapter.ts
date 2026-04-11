import type { IStorageAdapter } from '@sunglasses/core';

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
    } catch {
      // localStorage may throw in private/incognito mode or when quota is exceeded
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
