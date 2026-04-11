export interface RetryTask {
  attempt: number;
  execute: () => Promise<void>;
  onExhausted: () => void;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Schedules a task with exponential backoff + jitter.
 *
 * Retry delay: min(baseDelay * 2^attempt + jitter, maxDelay)
 * Jitter: random value in [0, baseDelay)
 *
 * Non-retriable errors (HTTP 4xx except 429) must be handled by the caller
 * by not enqueuing the task at all.
 */
export function scheduleRetry(
  task: RetryTask,
  config: RetryConfig
): void {
  if (task.attempt >= config.maxRetries) {
    task.onExhausted();
    return;
  }

  const delay = computeDelay(task.attempt, config);

  setTimeout(() => {
    task
      .execute()
      .catch(() => {
        scheduleRetry(
          { ...task, attempt: task.attempt + 1 },
          config
        );
      });
  }, delay);
}

function computeDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * config.baseDelayMs;
  return Math.min(exponential + jitter, config.maxDelayMs);
}
