import { describe, it, expect, vi } from 'vitest';
import { MiddlewarePipeline } from '../MiddlewarePipeline.js';
import { createLogger } from '../utils/logger.js';
import type { IMiddleware, MiddlewareNext, SunglassesEvent } from '../types.js';

function makeEvent(overrides: Partial<SunglassesEvent> = {}): SunglassesEvent {
  return {
    type: 'capture',
    event: 'test_event',
    distinctId: 'anon',
    anonymousId: 'anon',
    timestamp: '2024-01-01T00:00:00.000Z',
    messageId: 'msg-1',
    properties: {},
    context: { library: { name: '@drakkar.software/sunglasses-core', version: '0.1.0' }, platform: 'web' },
    ...overrides,
  };
}

const logger = createLogger(false);

describe('MiddlewarePipeline', () => {
  it('passes event through empty pipeline unchanged', async () => {
    const pipeline = new MiddlewarePipeline([], logger);
    const event = makeEvent();
    const result = await pipeline.run(event);
    expect(result).toEqual(event);
  });

  it('runs middleware in order', async () => {
    const order: string[] = [];
    const mw1: IMiddleware = {
      name: 'First',
      async process(e, next) { order.push('first'); return next(e); },
    };
    const mw2: IMiddleware = {
      name: 'Second',
      async process(e, next) { order.push('second'); return next(e); },
    };
    const pipeline = new MiddlewarePipeline([mw1, mw2], logger);
    await pipeline.run(makeEvent());
    expect(order).toEqual(['first', 'second']);
  });

  it('drops event when middleware returns null', async () => {
    const dropper: IMiddleware = {
      name: 'Dropper',
      async process(_e, _next) { return null; },
    };
    const pipeline = new MiddlewarePipeline([dropper], logger);
    const result = await pipeline.run(makeEvent());
    expect(result).toBeNull();
  });

  it('subsequent middleware is not called after a drop', async () => {
    const afterDrop = vi.fn(async (e: SunglassesEvent, next: MiddlewareNext) => next(e));
    const dropper: IMiddleware = { name: 'Dropper', async process() { return null; } };
    const afterDropMw: IMiddleware = { name: 'After', process: afterDrop };
    const pipeline = new MiddlewarePipeline([dropper, afterDropMw], logger);
    await pipeline.run(makeEvent());
    expect(afterDrop).not.toHaveBeenCalled();
  });

  it('treats thrown error as drop (does not propagate)', async () => {
    const thrower: IMiddleware = {
      name: 'Thrower',
      async process() { throw new Error('boom'); },
    };
    const pipeline = new MiddlewarePipeline([thrower], logger);
    const result = await pipeline.run(makeEvent());
    expect(result).toBeNull();
  });

  it('middleware can mutate properties', async () => {
    const enricher: IMiddleware = {
      name: 'Enricher',
      async process(e, next) {
        return next({ ...e, properties: { ...e.properties, extra: 'injected' } });
      },
    };
    const pipeline = new MiddlewarePipeline([enricher], logger);
    const result = await pipeline.run(makeEvent());
    expect(result?.properties.extra).toBe('injected');
  });
});
