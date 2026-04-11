import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scheduleRetry } from '../RetryQueue.js';

describe('scheduleRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('calls onExhausted when attempt >= maxRetries', () => {
    const onExhausted = vi.fn();
    scheduleRetry(
      { attempt: 3, execute: vi.fn(), onExhausted },
      { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000 }
    );
    expect(onExhausted).toHaveBeenCalledOnce();
  });

  it('schedules execute after a delay on first attempt', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const onExhausted = vi.fn();

    scheduleRetry(
      { attempt: 0, execute, onExhausted },
      { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000 }
    );

    expect(execute).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(execute).toHaveBeenCalledOnce();
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('retries on execute failure', async () => {
    let callCount = 0;
    const execute = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 2) throw new Error('fail');
    });
    const onExhausted = vi.fn();

    scheduleRetry(
      { attempt: 0, execute, onExhausted },
      { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000 }
    );

    await vi.runAllTimersAsync();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('calls onExhausted after all retries fail', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('fail'));
    const onExhausted = vi.fn();

    scheduleRetry(
      { attempt: 0, execute, onExhausted },
      { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 }
    );

    await vi.runAllTimersAsync();
    expect(onExhausted).toHaveBeenCalledOnce();
  });
});
