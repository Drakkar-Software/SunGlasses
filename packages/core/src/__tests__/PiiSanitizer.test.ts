import { describe, it, expect, vi } from 'vitest';
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
    context: { library: { name: '@drakkar.software/sunglasses-core', version: '0.1.0' }, platform: 'web' },
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

  it('strips nested PII in objects', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({
      user_data: { contact: 'reach me at nested@example.com', name: 'Alice' },
    });
    const result = await sanitizer.process(event, async (e) => e);
    const userData = result?.properties.user_data as Record<string, unknown>;
    expect(userData.contact).toBe('[redacted]');
    expect(userData.name).toBe('Alice');
  });

  it('strips nested PII key names in objects', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({ user: { email: 'test@example.com', plan: 'pro' } });
    const result = await sanitizer.process(event, async (e) => e);
    const user = result?.properties.user as Record<string, unknown>;
    expect(user.email).toBeUndefined(); // key stripped
    expect(user.plan).toBe('pro');
  });

  it('strips PII inside arrays', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({ contacts: ['alice@example.com', 'safe-value', 'bob@test.org'] });
    const result = await sanitizer.process(event, async (e) => e);
    expect(result?.properties.contacts).toEqual(['[redacted]', 'safe-value', '[redacted]']);
  });

  it('passes through the event to next after sanitization', async () => {
    const sanitizer = new PiiSanitizer();
    const nextFn = vi.fn(async (e: SunglassesEvent) => e);
    const event = makeEvent({ page: 'home' });
    await sanitizer.process(event, nextFn);
    expect(nextFn).toHaveBeenCalledOnce();
  });
});
