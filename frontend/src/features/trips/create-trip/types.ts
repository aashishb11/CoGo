export type TripRole = 'passenger' | 'driver';
export type MusicPreference = 'pop' | 'reggaeton' | 'rock' | 'electronic' | 'indie';
export type ConversationStyle = 'quiet' | 'casual' | 'chatty';

export type TripFormPreferences = {
  smoker: boolean;
  conversationStyle: ConversationStyle;
  musicGenres: MusicPreference[];
};

export type ActiveTrip = {
  id: string;
  role: TripRole;
  vehicle?: string;
  preferences?: TripFormPreferences;
  origin: string;
  destination: string;
  time: string;
  days: number[];
  originLocation?: MapLocation;
  destinationLocation?: MapLocation;
};

export type MapLocation = {
  latitude: number;
  longitude: number;
  address: string;
};
