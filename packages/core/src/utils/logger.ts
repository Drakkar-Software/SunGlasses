const PREFIX = '[SunGlasses]';

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Create a logger that respects the `debug` config flag.
 * debug/info are no-ops when debug=false.
 * warn/error always emit.
 */
export function createLogger(debug: boolean): Logger {
  return {
    debug(...args: unknown[]) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.log(PREFIX, '[debug]', ...args);
      }
    },
    info(...args: unknown[]) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.log(PREFIX, '[info]', ...args);
      }
    },
    warn(...args: unknown[]) {
      console.warn(PREFIX, '[warn]', ...args);
    },
    error(...args: unknown[]) {
      console.error(PREFIX, '[error]', ...args);
    },
  };
}
