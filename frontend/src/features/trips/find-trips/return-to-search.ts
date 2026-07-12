import { type useRouter } from 'expo-router';

import { popOrReplace } from '@/shared/navigation/back';

type Router = ReturnType<typeof useRouter>;
type Params = Record<string, string | string[] | undefined>;

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * Detail-screen back behavior. Native pop wins whenever a stack frame is
 * available — preserves scroll, plays the back animation. The fallbacks
 * only fire on deep links / hot reloads; the `from === 'search'` fallback
 * reconstructs the original search + filter state into the URL so the
 * user lands on the same results they came from.
 */
export function backToSearchOrFallback(router: Router, params: Params): void {
  const from = readParam(params.from);
  if (from === 'search') {
    popOrReplace(router, {
      pathname: '/trips/search',
      params: {
        originLabel: readParam(params.backOriginLabel),
        originLat: readParam(params.backOriginLat),
        originLng: readParam(params.backOriginLng),
        destinationLabel: readParam(params.backDestinationLabel),
        destinationLat: readParam(params.backDestinationLat),
        destinationLng: readParam(params.backDestinationLng),
        date: readParam(params.backDate),
        radiusKm: readParam(params.backRadiusKm),
        seatsNeeded: readParam(params.backSeatsNeeded),
        tripType: readParam(params.backTripType),
        smoke: readParam(params.backSmoke),
        music: readParam(params.backMusic),
        conversation: readParam(params.backConversation),
      },
    });
    return;
  }
  if (from === 'agenda') {
    popOrReplace(router, '/(tabs)/agenda');
    return;
  }
  if (from === 'favorites') {
    popOrReplace(router, '/trips/favorites');
    return;
  }
  popOrReplace(router, '/(tabs)/trips/create');
}
