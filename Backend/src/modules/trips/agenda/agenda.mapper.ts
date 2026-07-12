import { computeEstimatedCo2SavingsPerSeatKg } from '../domain/co2';
import type { ConversationStyle, MusicGenre, TripType } from '../trips.types';
import type {
  AgendaCarInfoDto,
  AgendaDriverInfoDto,
  AgendaDriverItemDto,
  AgendaPassengerItemDto,
} from './dto/agenda-response.dto';

type AgendaCommonRow = {
  rideId: string;
  rideStatus: 'active' | 'in_progress' | 'completed';
  startedAt: Date | null;
  completedAt: Date | null;
  actualCo2SavedKg: number | null;
  tripId: string;
  tripType: TripType;
  scheduledDeparture: Date;
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
  totalDistanceKm: number;
  estimatedDurationMinutes: number | null;
  co2KgPerKm: number | null;
  pricePerSeatCents: number;
};

export type AgendaDriverRow = AgendaCommonRow & {
  pendingBookingCount: number;
  seatsOccupied: number;
  seatsOffered: number;
};

export type AgendaPassengerRow = AgendaCommonRow & {
  myBookingId: string;
  myBookingStatus: 'accepted' | 'pending';
  driverId: string;
  driverName: string;
  driverAvatar: string | null;
  carBrand: string | null;
  carModelName: string | null;
  carColor: string | null;
  carPlate: string | null;
  smokeAllowed: boolean;
  musicAllowed: boolean;
  conversationStyle: ConversationStyle | null;
  musicGenre: MusicGenre | null;
};

const toLocation = (label: string, lat: number, lng: number) => ({
  label,
  lat,
  lng,
});

const toCommon = (row: AgendaCommonRow) => ({
  rideId: row.rideId,
  tripId: row.tripId,
  tripType: row.tripType,
  status: row.rideStatus,
  scheduledDeparture: row.scheduledDeparture,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
  actualCo2SavedKg: row.actualCo2SavedKg,
  origin: toLocation(row.originLabel, row.originLat, row.originLng),
  destination: toLocation(
    row.destinationLabel,
    row.destinationLat,
    row.destinationLng,
  ),
  totalDistanceKm: row.totalDistanceKm,
  estimatedDurationMinutes: row.estimatedDurationMinutes,
  estimatedCo2SavingsPerSeatKg: computeEstimatedCo2SavingsPerSeatKg(
    row.totalDistanceKm,
    row.co2KgPerKm,
  ),
  pricePerSeatCents: row.pricePerSeatCents,
});

const toDriverInfo = (row: AgendaPassengerRow): AgendaDriverInfoDto => ({
  id: row.driverId,
  name: row.driverName,
  avatar: row.driverAvatar,
});

// post: returns null when the joined car_models row is missing (model
// soft-deleted) so brand/model can't be rendered; FE decides the fallback.
const toCarInfo = (row: AgendaPassengerRow): AgendaCarInfoDto | null => {
  if (
    row.carBrand == null ||
    row.carModelName == null ||
    row.carPlate == null
  ) {
    return null;
  }
  return {
    brand: row.carBrand,
    model: row.carModelName,
    color: row.carColor,
    plate: row.carPlate,
  };
};

export const toAgendaDriverItem = (
  row: AgendaDriverRow,
): AgendaDriverItemDto => ({
  role: 'driver',
  ...toCommon(row),
  pendingBookingCount: row.pendingBookingCount,
  seatsOccupied: row.seatsOccupied,
  seatsOffered: row.seatsOffered,
});

export const toAgendaPassengerItem = (
  row: AgendaPassengerRow,
): AgendaPassengerItemDto => ({
  role: 'passenger',
  ...toCommon(row),
  myBookingId: row.myBookingId,
  myBookingStatus: row.myBookingStatus,
  driver: toDriverInfo(row),
  car: toCarInfo(row),
  smokeAllowed: row.smokeAllowed,
  musicAllowed: row.musicAllowed,
  conversationStyle: row.conversationStyle,
  musicGenre: row.musicGenre,
});
