import { randomUUID } from 'node:crypto';
import type { DbClient } from '@core/database/database.module';
import {
  bookings,
  cars,
  carModels,
  organizations,
  profile,
  rides,
  trips,
  trustedContacts,
} from '@core/database/schema';
import type { TrustedContact } from '@core/database/schema/trusted-contacts.schema';
import type { Booking } from '@core/database/schema/bookings.schema';
import type { Car } from '@core/database/schema/cars.schema';
import type { CarModel } from '@core/database/schema/car-models.schema';
import type { Organization } from '@core/database/schema/organizations.schema';
import type { Profile } from '@core/database/schema/profile.schema';
import type { Ride } from '@core/database/schema/rides.schema';
import type { Trip } from '@core/database/schema/trips.schema';

export async function makeCarModel(
  db: DbClient,
  overrides: Partial<CarModel> = {},
): Promise<CarModel> {
  const [row] = await db
    .insert(carModels)
    .values({
      id: overrides.id ?? randomUUID(),
      brand: overrides.brand ?? 'Test',
      name: overrides.name ?? `Model-${randomUUID().slice(0, 8)}`,
      year: overrides.year ?? 2020,
      type: overrides.type ?? 'sedan',
      co2KgPerKm: overrides.co2KgPerKm ?? 0.12,
    })
    .returning();
  return row;
}

export async function makeCar(
  db: DbClient,
  userId: string,
  overrides: Partial<Car> = {},
): Promise<Car> {
  const modelId = overrides.modelId ?? (await makeCarModel(db)).id;
  const [row] = await db
    .insert(cars)
    .values({
      id: overrides.id ?? randomUUID(),
      userId,
      modelId,
      plate: overrides.plate ?? `TEST-${randomUUID().slice(0, 6)}`,
      color: overrides.color ?? 'black',
      passengerSeats: overrides.passengerSeats ?? 4,
    })
    .returning();
  return row;
}

export async function makeTrip(
  db: DbClient,
  driverId: string,
  overrides: Partial<Trip> & { carId?: string } = {},
): Promise<Trip> {
  const carId = overrides.carId ?? (await makeCar(db, driverId)).id;
  const departureAt =
    overrides.departureAt === undefined && overrides.type !== 'recurring'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : (overrides.departureAt ?? null);

  const [row] = await db
    .insert(trips)
    .values({
      id: overrides.id ?? randomUUID(),
      driverId,
      carId,
      type: overrides.type ?? 'sporadic',
      status: overrides.status ?? 'active',
      originLabel: overrides.originLabel ?? 'Mataró',
      originLat: overrides.originLat ?? 41.5381,
      originLng: overrides.originLng ?? 2.4445,
      destinationLabel: overrides.destinationLabel ?? 'Barcelona',
      destinationLat: overrides.destinationLat ?? 41.3851,
      destinationLng: overrides.destinationLng ?? 2.1734,
      conversationStyle: overrides.conversationStyle ?? null,
      smokeAllowed: overrides.smokeAllowed ?? false,
      musicAllowed: overrides.musicAllowed ?? false,
      musicGenre: overrides.musicGenre ?? null,
      externalEventProvider: overrides.externalEventProvider ?? null,
      externalEventId: overrides.externalEventId ?? null,
      departureAt,
      schedule: overrides.schedule ?? null,
      seatsOffered: overrides.seatsOffered ?? 3,
      totalDistanceKm: overrides.totalDistanceKm ?? 30,
      estimatedDurationMinutes: overrides.estimatedDurationMinutes ?? 30,
      routePolyline: overrides.routePolyline ?? null,
    })
    .returning();
  return row;
}

export async function makeRide(
  db: DbClient,
  tripId: string,
  overrides: Partial<Ride> = {},
): Promise<Ride> {
  const [row] = await db
    .insert(rides)
    .values({
      id: overrides.id ?? randomUUID(),
      tripId,
      scheduledDeparture:
        overrides.scheduledDeparture ??
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: overrides.status ?? 'active',
      originLabel: overrides.originLabel ?? 'Mataró',
      originLat: overrides.originLat ?? 41.5381,
      originLng: overrides.originLng ?? 2.4445,
      destinationLabel: overrides.destinationLabel ?? 'Barcelona',
      destinationLat: overrides.destinationLat ?? 41.3851,
      destinationLng: overrides.destinationLng ?? 2.1734,
      totalDistanceKm: overrides.totalDistanceKm ?? 30,
      seatsOffered: overrides.seatsOffered ?? 3,
      seatsOccupied: overrides.seatsOccupied ?? 0,
      actualCo2SavedKg: overrides.actualCo2SavedKg ?? null,
      startedAt: overrides.startedAt ?? null,
      completedAt: overrides.completedAt ?? null,
      cancelledAt: overrides.cancelledAt ?? null,
      cancellationReason: overrides.cancellationReason ?? null,
      flaggedForReview: overrides.flaggedForReview ?? false,
    })
    .returning();
  return row;
}

export async function makeProfile(
  db: DbClient,
  userId: string,
  overrides: Partial<Profile> = {},
): Promise<Profile> {
  const [row] = await db
    .insert(profile)
    .values({
      userId,
      username: overrides.username ?? `u-${randomUUID().slice(0, 8)}`,
      bio: overrides.bio ?? null,
      phone: overrides.phone ?? null,
      locale: overrides.locale ?? null,
      totalCo2Saved: overrides.totalCo2Saved ?? 0,
    })
    .returning();
  return row;
}

export async function makeOrganization(
  db: DbClient,
  overrides: Partial<Organization> = {},
): Promise<Organization> {
  const [row] = await db
    .insert(organizations)
    .values({
      id: overrides.id ?? randomUUID(),
      name: overrides.name ?? 'Test University',
      domain: overrides.domain ?? `test-${randomUUID().slice(0, 8)}.edu`,
    })
    .returning();
  return row;
}

// Trusted contact is now a precondition for publishing a trip and
// creating a booking (US-05). Tests that exercise either flow must seed
// one via this helper; the production gate (`assertHasContact`) returns
// 403 TRUSTED_CONTACT_REQUIRED otherwise.
export async function makeTrustedContact(
  db: DbClient,
  userId: string,
  overrides: Partial<TrustedContact> = {},
): Promise<TrustedContact> {
  const [row] = await db
    .insert(trustedContacts)
    .values({
      userId,
      name: overrides.name ?? 'Trusted Friend',
      email:
        overrides.email ?? `trusted-${randomUUID().slice(0, 8)}@example.com`,
    })
    .onConflictDoUpdate({
      target: trustedContacts.userId,
      set: {
        name: overrides.name ?? 'Trusted Friend',
        email:
          overrides.email ?? `trusted-${randomUUID().slice(0, 8)}@example.com`,
      },
    })
    .returning();
  return row;
}

export async function makeBooking(
  db: DbClient,
  passengerId: string,
  rideId: string,
  overrides: Partial<Booking> = {},
): Promise<Booking> {
  const [row] = await db
    .insert(bookings)
    .values({
      id: overrides.id ?? randomUUID(),
      passengerId,
      rideId,
      status: overrides.status ?? 'pending',
      message: overrides.message ?? null,
      fareCents: overrides.fareCents ?? null,
      requestedAt: overrides.requestedAt ?? new Date(),
      acceptedAt: overrides.acceptedAt ?? null,
      rejectedAt: overrides.rejectedAt ?? null,
      cancelledAt: overrides.cancelledAt ?? null,
      boardedAt: overrides.boardedAt ?? null,
    })
    .returning();
  return row;
}
