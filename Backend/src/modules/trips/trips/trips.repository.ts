import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import {
  carModels,
  cars,
  organizations,
  trips,
  user,
} from '@core/database/schema';
import type { Trip } from '@core/database/schema/trips.schema';
import type { TripStatus } from '../trips.types';

type InsertTrip = typeof trips.$inferInsert;

export type TripWithDriverRow = {
  trip: Trip;
  driverId: string;
  driverName: string;
  driverOrganizationId: string | null;
  driverOrganizationName: string | null;
  co2KgPerKm: number | null;
};

const tripWithDriverSelect = {
  trip: trips,
  driverId: user.id,
  driverName: user.name,
  driverOrganizationId: organizations.id,
  driverOrganizationName: organizations.name,
  co2KgPerKm: carModels.co2KgPerKm,
} as const;

@Injectable()
export class TripsRepository {
  async findById(tx: DbClient, tripId: string): Promise<Trip | null> {
    const [row] = await tx
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    return row ?? null;
  }

  async exists(tx: DbClient, tripId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    return Boolean(row);
  }

  async existsActiveByCar(
    tx: DbClient,
    carId: string,
    driverId: string,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ id: trips.id })
      .from(trips)
      .where(
        and(
          eq(trips.carId, carId),
          eq(trips.driverId, driverId),
          eq(trips.status, 'active'),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async findDriverId(tx: DbClient, tripId: string): Promise<string | null> {
    const [row] = await tx
      .select({ driverId: trips.driverId })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    return row?.driverId ?? null;
  }

  async findWithDriverById(
    tx: DbClient,
    tripId: string,
  ): Promise<TripWithDriverRow | null> {
    const [row] = await tx
      .select(tripWithDriverSelect)
      .from(trips)
      .innerJoin(user, eq(trips.driverId, user.id))
      .leftJoin(organizations, eq(user.organizationId, organizations.id))
      .innerJoin(cars, eq(trips.carId, cars.id))
      .leftJoin(carModels, eq(cars.modelId, carModels.id))
      .where(eq(trips.id, tripId))
      .limit(1);
    return row ?? null;
  }

  async listMineWithDriver(
    tx: DbClient,
    driverId: string,
    statuses: TripStatus[],
  ): Promise<TripWithDriverRow[]> {
    return tx
      .select(tripWithDriverSelect)
      .from(trips)
      .innerJoin(user, eq(trips.driverId, user.id))
      .leftJoin(organizations, eq(user.organizationId, organizations.id))
      .innerJoin(cars, eq(trips.carId, cars.id))
      .leftJoin(carModels, eq(cars.modelId, carModels.id))
      .where(and(eq(trips.driverId, driverId), inArray(trips.status, statuses)))
      .orderBy(desc(trips.createdAt));
  }

  async findCarCo2KgPerKmByTripId(
    tx: DbClient,
    tripId: string,
  ): Promise<{ co2KgPerKm: number } | null> {
    const [row] = await tx
      .select({ co2KgPerKm: carModels.co2KgPerKm })
      .from(trips)
      .innerJoin(cars, eq(trips.carId, cars.id))
      .innerJoin(carModels, eq(cars.modelId, carModels.id))
      .where(eq(trips.id, tripId))
      .limit(1);
    return row ?? null;
  }

  async findOwnedCar(
    tx: DbClient,
    carId: string,
  ): Promise<{ id: string; userId: string } | null> {
    const [row] = await tx
      .select({ id: cars.id, userId: cars.userId })
      .from(cars)
      .where(eq(cars.id, carId))
      .limit(1);
    return row ?? null;
  }

  async insertOne(tx: DbClient, row: InsertTrip): Promise<void> {
    await tx.insert(trips).values(row);
  }

  async update(
    tx: DbClient,
    tripId: string,
    patch: Partial<InsertTrip>,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) {
      return;
    }
    await tx.update(trips).set(patch).where(eq(trips.id, tripId));
  }

  async cancel(
    tx: DbClient,
    tripId: string,
    reason: string | null,
  ): Promise<void> {
    await tx
      .update(trips)
      .set({
        status: 'cancelled',
        cancelledAt: sql`now()`,
        cancellationReason: reason ?? null,
      })
      .where(eq(trips.id, tripId));
  }

  // Idempotent: the guarded `WHERE status='active'` makes repeated calls safe.
  async archiveIfActive(tx: DbClient, tripId: string): Promise<void> {
    await tx
      .update(trips)
      .set({ status: 'archived', archivedAt: sql`now()` })
      .where(and(eq(trips.id, tripId), eq(trips.status, 'active')));
  }
}
