export type TopRouteMapItem = {
  tripId: string;
  origin: { label: string; lat: number; lng: number };
  destination: { label: string; lat: number; lng: number };
};

export type SearchPoint = { label: string; lat: number; lng: number };

export type TopRoutesMapModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelectRoute: (tripId: string) => void;
  routes: TopRouteMapItem[];
  searchOrigin: SearchPoint | null;
  searchDestination: SearchPoint | null;
  title: string;
  closeLabel: string;
  emptyLabel: string;
  hintLabel: string;
  searchOriginLabel: string;
  searchDestinationLabel: string;
  webUnavailableTitle: string;
  webUnavailableDescription: string;
  // Pass `'none'` to skip the slide-up animation (used when restoring the map
  // after returning from a trip details screen, so it doesn't feel like a pop).
  animationType?: 'slide' | 'none' | 'fade';
};
