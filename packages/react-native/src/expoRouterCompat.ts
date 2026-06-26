/**
 * Thin compatibility shim for expo-router hooks.
 *
 * Isolates the optional `require('expo-router')` call behind a static import
 * boundary so tests can replace this entire module via vi.mock without needing
 * to intercept dynamic require() calls.
 *
 * Exports `null` for each hook when expo-router is not installed — callers are
 * responsible for checking before calling.
 */

type UseGlobalSearchParamsFn = <T extends Record<string, string | string[]>>() => T;
type UsePathnameFn = () => string;

let _useGlobalSearchParams: UseGlobalSearchParamsFn | null = null;
let _usePathname: UsePathnameFn | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const expoRouter = require('expo-router') as {
    useGlobalSearchParams: UseGlobalSearchParamsFn;
    usePathname: UsePathnameFn;
  };
  _useGlobalSearchParams = expoRouter.useGlobalSearchParams;
  _usePathname = expoRouter.usePathname;
} catch {
  // expo-router is not installed — hooks will be null
}

export const useGlobalSearchParams: UseGlobalSearchParamsFn | null = _useGlobalSearchParams;
export const usePathname: UsePathnameFn | null = _usePathname;
