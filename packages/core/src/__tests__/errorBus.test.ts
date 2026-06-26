import { describe, it, expect, vi } from 'vitest';
import { publishGlobalError, subscribeGlobalError } from '../errorBus.js';

describe('errorBus', () => {
  it('notifies subscribers of published errors', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGlobalError(listener);

    const error = new Error('boom');
    publishGlobalError({ error, fatal: true, kind: 'error' });

    expect(listener).toHaveBeenCalledWith({ error, fatal: true, kind: 'error' });
    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGlobalError(listener);
    unsubscribe();

    publishGlobalError({ error: 'x', fatal: false, kind: 'rejection' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies multiple subscribers', () => {
    const a = vi.fn();
    const b = vi.fn();
    const ua = subscribeGlobalError(a);
    const ub = subscribeGlobalError(b);

    publishGlobalError({ error: 'x', fatal: true, kind: 'error' });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    ua();
    ub();
  });

  it('isolates a throwing subscriber from others and the publisher', () => {
    const bad = vi.fn(() => {
      throw new Error('subscriber failure');
    });
    const good = vi.fn();
    const ubad = subscribeGlobalError(bad);
    const ugood = subscribeGlobalError(good);

    expect(() =>
      publishGlobalError({ error: 'x', fatal: false, kind: 'rejection' })
    ).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);

    ubad();
    ugood();
  });
});
