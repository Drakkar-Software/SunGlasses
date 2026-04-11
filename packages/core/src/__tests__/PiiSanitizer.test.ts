import { describe, it, expect } from 'vitest';
import { PiiSanitizer } from '../PiiSanitizer.js';
import type { SunglassesEvent } from '../types.js';

function makeEvent(properties: Record<string, unknown>): SunglassesEvent {
  return {
    type: 'capture',
    event: 'test',
    distinctId: 'anon-123',
    anonymousId: 'anon-123',
    timestamp: '2024-01-01T00:00:00.000Z',
    messageId: 'msg-1',
    properties,
    context: { library: { name: '@sunglasses/core', version: '0.1.0' }, platform: 'web' },
  };
}

describe('PiiSanitizer', () => {
  it('strips email values', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({ label: 'Contact user@example.com for info' });
    const result = await sanitizer.process(event, async (e) => e);
    expect(result?.properties.label).toBe('[redacted]');
  });

  it('strips built-in PII key names', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({ email: 'test@example.com', name: 'Alice' });
    const result = await sanitizer.process(event, async (e) => e);
    expect(result?.properties.email).toBeUndefined();
    expect(result?.properties.name).toBe('Alice');
  });

  it('respects allowedProperties allowlist', async () => {
    const sanitizer = new PiiSanitizer(['name', 'action']);
    const event = makeEvent({ name: 'Alice', action: 'click', email: 'test@example.com', extra: 'value' });
    const result = await sanitizer.process(event, async (e) => e);
    expect(Object.keys(result!.properties)).toEqual(['name', 'action']);
  });

  it('respects deniedProperties blocklist', async () => {
    const sanitizer = new PiiSanitizer(undefined, ['secret_key']);
    const event = makeEvent({ name: 'Alice', secret_key: 'abc123' });
    const result = await sanitizer.process(event, async (e) => e);
    expect(result?.properties.secret_key).toBeUndefined();
    expect(result?.properties.name).toBe('Alice');
  });

  it('strips phone number values', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({ info: 'Call 555-123-4567 for support' });
    const result = await sanitizer.process(event, async (e) => e);
    expect(result?.properties.info).toBe('[redacted]');
  });

  it('preserves non-PII properties unchanged', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({ page: 'home', clicks: 3, active: true });
    const result = await sanitizer.process(event, async (e) => e);
    expect(result?.properties).toEqual({ page: 'home', clicks: 3, active: true });
  });
});
