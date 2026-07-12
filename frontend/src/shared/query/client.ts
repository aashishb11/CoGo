import { QueryClient } from '@tanstack/react-query';

// Single QueryClient for the whole app. Defaults tuned for a mobile app where
// screens come in and out of view a lot: short stale time so fresh-enough data
// paints instantly from cache, a single retry to absorb flaky mobile networks
// without dog-piling, and no window-focus refetch (RN doesn't have a meaningful
// "focus" event anyway).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
