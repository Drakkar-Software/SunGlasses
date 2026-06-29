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
  // PiiSanitizer now masks matched PII substrings rather than replacing the whole
  // value. This preserves surrounding context (helpful for stack traces) while
  // still redacting the sensitive portion.

  it('masks email substrings in place, preserving surrounding text', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({ label: 'Contact user@example.com for info' });
    const result = await sanitizer.process(event, async (e) => e);
    expect(result?.properties.label).toBe('Contact [redacted] for info');
  });

  it('replaces a bare email value entirely', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({ label: 'user@example.com' });
    const result = await sanitizer.process(event, async (e) => e);
    expect(result?.properties.label).toBe('[redacted]');
  });

  it('strips built-in PII key names (key is removed, not just redacted)', async () => {
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

  it('masks phone number substrings in place, preserving surrounding text', async () => {
    const sanitizer = new PiiSanitizer();
    // The phone regex includes an optional leading space as part of its prefix group,
    // so the space before the number is consumed by the match.
    const event = makeEvent({ info: 'Call 555-123-4567 for support' });
    const result = await sanitizer.process(event, async (e) => e);
    expect(result?.properties.info).toBe('Call[redacted] for support');
  });

  it('preserves non-PII properties unchanged', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({ page: 'home', clicks: 3, active: true });
    const result = await sanitizer.process(event, async (e) => e);
    expect(result?.properties).toEqual({ page: 'home', clicks: 3, active: true });
  });

  it('masks nested PII substrings in objects', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({
      user_data: { contact: 'reach me at nested@example.com', name: 'Alice' },
    });
    const result = await sanitizer.process(event, async (e) => e);
    const userData = result?.properties.user_data as Record<string, unknown>;
    expect(userData.contact).toBe('reach me at [redacted]');
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

  it('masks PII inside arrays', async () => {
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

  it('masks multiple emails in a single string', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({ note: 'From: a@a.com, To: b@b.com' });
    const result = await sanitizer.process(event, async (e) => e);
    expect(result?.properties.note).toBe('From: [redacted], To: [redacted]');
  });

  it('preserves a stack trace that contains an IPv4-like version number', async () => {
    // Before substring masking, "1.2.3.4"-style paths in stacks would nuke the whole value.
    const sanitizer = new PiiSanitizer();
    const stack = 'at render (file://some/path/1.0.0/App.js:42:15)';
    const event = makeEvent({ $error_stack: stack });
    const result = await sanitizer.process(event, async (e) => e);
    // 1.0.0 has only 3 octets — not an IPv4 match — so the stack is unchanged.
    expect(result?.properties.$error_stack).toBe(stack);
  });

  it('masks an actual IPv4 address embedded in a string', async () => {
    const sanitizer = new PiiSanitizer();
    const event = makeEvent({ info: 'Server at 192.168.1.1 responded' });
    const result = await sanitizer.process(event, async (e) => e);
    expect(result?.properties.info).toBe('Server at [redacted] responded');
  });
});
