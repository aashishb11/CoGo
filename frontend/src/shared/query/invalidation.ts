import { QueryClient, QueryKey } from '@tanstack/react-query';

export function invalidateAll(qc: QueryClient, keys: QueryKey[]) {
  for (const queryKey of keys) {
    void qc.invalidateQueries({ queryKey });
  }
}
