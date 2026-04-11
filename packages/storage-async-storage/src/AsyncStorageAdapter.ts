import type { IStorageAdapter } from '@drakkar.software/sunglasses-core';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * IStorageAdapter implementation using React Native AsyncStorage.
 *
 * Keys are namespaced with a configurable prefix (default: 'sg_') to avoid
 * collisions with other libraries or application data.
 *
 * Peer dependency: @react-native-async-storage/async-storage
 */
export class AsyncStorageAdapter implements IStorageAdapter {
  constructor(private readonly prefix: string = 'sg_') {}

  async read(key: string): Promise<string | null> {
    return AsyncStorage.getItem(this.prefixed(key));
  }

  async write(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(this.prefixed(key), value);
  }

  async delete(key: string): Promise<void> {
    await AsyncStorage.removeItem(this.prefixed(key));
  }

  private prefixed(key: string): string {
    return `${this.prefix}${key}`;
  }
}
