import { useCallback } from 'react';
import { useSunglasses } from './context.js';

/**
 * Returns a bound `capture` function for the current SunGlasses client.
 *
 * Shorthand for `useSunglasses().capture` — avoids holding a reference to the
 * entire client when you only need to fire events from a component.
 *
 * The returned function is stable across renders (same reference) as long as
 * the client itself does not change.
 *
 * @example
 * ```tsx
 * function SubmitButton() {
 *   const capture = useCapture();
 *   return (
 *     <button onClick={() => capture('form_submitted', { formId: 'signup' })}>
 *       Submit
 *     </button>
 *   );
 * }
 * ```
 */
export function useCapture(): (eventName: string, properties?: Record<string, unknown>) => void {
  const client = useSunglasses();
  return useCallback(
    (eventName: string, properties?: Record<string, unknown>) => {
      client.capture(eventName, properties);
    },
    [client]
  );
}
