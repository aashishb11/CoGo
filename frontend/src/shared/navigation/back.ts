import { type useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;
type ReplaceTarget = Parameters<Router['replace']>[0];

/**
 * Standard back behavior across detail/overlay screens: native pop when a
 * stack frame is available (preserves scroll, plays the back animation),
 * else replace to a known landing route.
 *
 * Why this exists: unconditional `router.replace(...)` in a back handler
 * causes the wrong animation direction (forward push instead of pop) and
 * resets the underlying screen's scroll position.
 */
export function popOrReplace(router: Router, fallback: ReplaceTarget): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
