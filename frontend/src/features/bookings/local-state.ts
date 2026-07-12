import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const DISMISSED_ACCEPTED_BOOKINGS_KEY = 'cogo:dismissed-accepted-bookings:v1';

export const localBookingStateKeys = {
  dismissedAcceptedBookings: () => ['bookings', 'local', 'dismissed-accepted'] as const,
} as const;

async function readStringSet(key: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

async function writeStringSet(key: string, values: Iterable<string>) {
  const uniqueValues = Array.from(new Set(values)).sort();
  await AsyncStorage.setItem(key, JSON.stringify(uniqueValues));
  return uniqueValues;
}

export function useDismissedAcceptedBookingIds() {
  return useQuery({
    queryKey: localBookingStateKeys.dismissedAcceptedBookings(),
    queryFn: () => readStringSet(DISMISSED_ACCEPTED_BOOKINGS_KEY),
  });
}

export function useDismissAcceptedBookings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookingIds: string[]) => {
      const current = await readStringSet(DISMISSED_ACCEPTED_BOOKINGS_KEY);
      return writeStringSet(DISMISSED_ACCEPTED_BOOKINGS_KEY, [...current, ...bookingIds]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: localBookingStateKeys.dismissedAcceptedBookings(),
      });
    },
  });
}
