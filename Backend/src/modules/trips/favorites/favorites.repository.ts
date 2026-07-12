import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import {
  carModels,
  cars,
  organizations,
  trips,
  user,
  userFavoriteTrips,
} from '@core/database/schema';
import type { Trip } from '@core/database/schema/trips.schema';
import type { TripStatus } from '../trips.types';

export type FavoriteTripRow = {
  trip: Trip;
  favoritedAt: Date;
  driverId: string;
  driverName: string;
  driverOrganizationId: string | null;
  driverOrganizationName: string | null;
  co2KgPerKm: number | null;
};

@Injectable()
export class FavoritesRepository {
  async add(tx: DbClient, userId: string, tripId: string): Promise<void> {
    await tx
      .insert(userFavoriteTrips)
      .values({ userId, tripId })
      .onConflictDoNothing({
        target: [userFavoriteTrips.userId, userFavoriteTrips.tripId],
      });
  }

  async remove(tx: DbClient, userId: string, tripId: string): Promise<void> {
    await tx
      .delete(userFavoriteTrips)
      .where(
        and(
          eq(userFavoriteTrips.userId, userId),
          eq(userFavoriteTrips.tripId, tripId),
        ),
      );
  }

  async listMineWithTripAndDriver(
    tx: DbClient,
    userId: string,
    visibleStatuses: TripStatus[],
  ): Promise<FavoriteTripRow[]> {
    return tx
      .select({
        trip: trips,
        favoritedAt: userFavoriteTrips.createdAt,
        driverId: user.id,
        driverName: user.name,
        driverOrganizationId: organizations.id,
        driverOrganizationName: organizations.name,
        co2KgPerKm: carModels.co2KgPerKm,
      })
      .from(userFavoriteTrips)
      .innerJoin(trips, eq(userFavoriteTrips.tripId, trips.id))
      .innerJoin(user, eq(trips.driverId, user.id))
      .leftJoin(organizations, eq(user.organizationId, organizations.id))
      .innerJoin(cars, eq(trips.carId, cars.id))
      .leftJoin(carModels, eq(cars.modelId, carModels.id))
      .where(
        and(
          eq(userFavoriteTrips.userId, userId),
          inArray(trips.status, visibleStatuses),
        ),
      )
      .orderBy(desc(userFavoriteTrips.createdAt));
  }
}
