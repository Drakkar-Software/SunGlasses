import type { IMiddleware, SunglassesEvent } from './types.js';
import type { Logger } from './utils/logger.js';

/**
 * Executes an ordered chain of IMiddleware instances.
 *
 * - Middleware runs in array order.
 * - If any middleware returns null, the event is dropped (no further processing).
 * - Errors inside middleware are caught and treated as a drop (logged as error).
 */
export class MiddlewarePipeline {
  constructor(
    private readonly middleware: IMiddleware[],
    private readonly logger: Logger
  ) {}

  async run(event: SunglassesEvent): Promise<SunglassesEvent | null> {
    let index = 0;

    const next = async (current: SunglassesEvent): Promise<SunglassesEvent | null> => {
      if (index >= this.middleware.length) {
        return current;
      }

      const mw = this.middleware[index++];
      try {
        const result = await mw.process(current, next);
        if (result === null) {
          this.logger.debug(`MiddlewarePipeline: event dropped by "${mw.name}"`);
        }
        return result;
      } catch (err) {
        this.logger.error(
          `MiddlewarePipeline: middleware "${mw.name}" threw an error (event dropped)`,
          err
        );
        return null;
      }
    };

    return next(event);
  }
}
