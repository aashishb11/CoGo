import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import {
  bookings,
  carModels,
  cars,
  profile,
  rides,
  safetyIncidents,
  trips,
  user,
} from '@core/database/schema';
import type {
  InsertSafetyIncident,
  SafetyIncident,
} from '@core/database/schema/safety-incidents.schema';
import type { IncidentCategory } from './safety.types';

export type AdminIncidentDetail = {
  id: string;
  rideId: string;
  category: IncidentCategory;
  note: string | null;
  createdAt: Date;
  ride: {
    id: string;
    scheduledDeparture: Date;
    originLabel: string;
    destinationLabel: string;
    tripId: string;
    driverId: string;
    driverName: string;
  };
  reporter: {
    id: string;
    name: string;
    email: string;
  };
};

export type FlaggedRideRow = {
  rideId: string;
  tripId: string;
  driverId: string;
  driverName: string;
  scheduledDeparture: Date;
  status: string;
  originLabel: string;
  destinationLabel: string;
  incidentCount: number;
  lastIncidentAt: Date;
};

export type RideReviewRow = {
  id: string;
  tripId: string;
  driverId: string;
  driverName: string;
  scheduledDeparture: Date;
  status: string;
  originLabel: string;
  destinationLabel: string;
  startedAt: Date | null;
  completedAt: Date | null;
  flaggedForReview: boolean;
};

// Read-only payload assembled from `rides`, `trips`, `user`, and `cars`
// for the post-commit incident email. The plan flags this cross-table read
// as an intentional convention exception (repositories are otherwise
// status-agnostic primitives): the join is read-only, no mutations, and
// pulling it into TripsModule would create a cycle.
// See docs/plans/2026-05-21-safety-and-payments.md §Module layout.
export type IncidentRidePayload = {
  rideId: string;
  scheduledDeparture: Date;
  originLabel: string;
  destinationLabel: string;
  tripId: string;
  driverId: string;
  driverName: string;
  carModelBrand: string | null;
  carModelName: string | null;
  carPlate: string | null;
};

export type IncidentPassengerPayload = {
  userId: string;
  name: string;
  phone: string | null;
};

@Injectable()
export class IncidentsRepository {
  async insert(
    tx: DbClient,
    row: InsertSafetyIncident,
  ): Promise<SafetyIncident> {
    const [inserted] = await tx.insert(safetyIncidents).values(row).returning();
    return inserted;
  }

  async listForReporter(
    tx: DbClient,
    reporterId: string,
    params: { limit: number; offset: number },
  ): Promise<SafetyIncident[]> {
    return tx
      .select()
      .from(safetyIncidents)
      .where(eq(safetyIncidents.reporterId, reporterId))
      .orderBy(desc(safetyIncidents.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  async countForReporter(tx: DbClient, reporterId: string): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(safetyIncidents)
      .where(eq(safetyIncidents.reporterId, reporterId));
    return row?.count ?? 0;
  }

  /**
   * Read-only join assembling the data the incident email needs:
   * ride snapshot + driver identity + car make/model/plate. Used only by
   * `IncidentsService` after the insert tx has committed.
   */
  async findRidePayload(
    tx: DbClient,
    rideId: string,
  ): Promise<IncidentRidePayload | null> {
    const [row] = await tx
      .select({
        rideId: rides.id,
        scheduledDeparture: rides.scheduledDeparture,
        originLabel: rides.originLabel,
        destinationLabel: rides.destinationLabel,
        tripId: trips.id,
        driverId: user.id,
        driverName: user.name,
        carModelBrand: carModels.brand,
        carModelName: carModels.name,
        carPlate: cars.plate,
      })
      .from(rides)
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .innerJoin(user, eq(trips.driverId, user.id))
      .innerJoin(cars, eq(trips.carId, cars.id))
      .leftJoin(carModels, eq(cars.modelId, carModels.id))
      .where(eq(rides.id, rideId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Returns every `accepted` passenger on the ride with name + phone for the
   * driver-reporter email body. Phone lives on `profile`; left-joined so a
   * passenger with no profile row still surfaces with `phone: null`.
   */
  async findAcceptedPassengersForEmail(
    tx: DbClient,
    rideId: string,
  ): Promise<IncidentPassengerPayload[]> {
    return tx
      .select({
        userId: user.id,
        name: user.name,
        phone: profile.phone,
      })
      .from(bookings)
      .innerJoin(user, eq(bookings.passengerId, user.id))
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(and(eq(bookings.rideId, rideId), eq(bookings.status, 'accepted')));
  }

  // ── Admin reads ────────────────────────────────────────────────────────

  async listAll(
    tx: DbClient,
    params: { limit: number; offset: number },
  ): Promise<SafetyIncident[]> {
    return tx
      .select()
      .from(safetyIncidents)
      .orderBy(desc(safetyIncidents.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  async countAll(tx: DbClient): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(safetyIncidents);
    return row?.count ?? 0;
  }

  /**
   * Single hydrated incident for the admin detail view: incident row + ride
   * snapshot + reporter (name, email). Reporter role on the ride is resolved
   * at the service layer.
   */
  async findAdminDetailById(
    tx: DbClient,
    incidentId: string,
  ): Promise<AdminIncidentDetail | null> {
    const [row] = await tx
      .select({
        id: safetyIncidents.id,
        rideId: safetyIncidents.rideId,
        category: safetyIncidents.category,
        note: safetyIncidents.note,
        createdAt: safetyIncidents.createdAt,
        rideScheduledDeparture: rides.scheduledDeparture,
        rideOriginLabel: rides.originLabel,
        rideDestinationLabel: rides.destinationLabel,
        tripId: trips.id,
        driverId: trips.driverId,
        driverName: user.name,
        reporterId: safetyIncidents.reporterId,
      })
      .from(safetyIncidents)
      .innerJoin(rides, eq(safetyIncidents.rideId, rides.id))
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .innerJoin(user, eq(trips.driverId, user.id))
      .where(eq(safetyIncidents.id, incidentId))
      .limit(1);
    if (!row) {
      return null;
    }
    const [reporter] = await tx
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, row.reporterId))
      .limit(1);
    if (!reporter) {
      return null;
    }
    return {
      id: row.id,
      rideId: row.rideId,
      category: row.category,
      note: row.note,
      createdAt: row.createdAt,
      ride: {
        id: row.rideId,
        scheduledDeparture: row.rideScheduledDeparture,
        originLabel: row.rideOriginLabel,
        destinationLabel: row.rideDestinationLabel,
        tripId: row.tripId,
        driverId: row.driverId,
        driverName: row.driverName,
      },
      reporter: {
        id: reporter.id,
        name: reporter.name,
        email: reporter.email,
      },
    };
  }

  // ── Flagged-ride review ────────────────────────────────────────────────

  async listFlaggedRides(
    tx: DbClient,
    params: { limit: number; offset: number },
  ): Promise<FlaggedRideRow[]> {
    return tx
      .select({
        rideId: rides.id,
        tripId: trips.id,
        driverId: trips.driverId,
        driverName: user.name,
        scheduledDeparture: rides.scheduledDeparture,
        status: rides.status,
        originLabel: rides.originLabel,
        destinationLabel: rides.destinationLabel,
        incidentCount: sql<number>`count(${safetyIncidents.id})::int`.as(
          'incident_count',
        ),
        lastIncidentAt: sql<Date>`max(${safetyIncidents.createdAt})`.as(
          'last_incident_at',
        ),
      })
      .from(rides)
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .innerJoin(user, eq(trips.driverId, user.id))
      .innerJoin(safetyIncidents, eq(safetyIncidents.rideId, rides.id))
      .where(eq(rides.flaggedForReview, true))
      .groupBy(
        rides.id,
        trips.id,
        trips.driverId,
        user.name,
        rides.scheduledDeparture,
        rides.status,
        rides.originLabel,
        rides.destinationLabel,
      )
      .orderBy(desc(sql`last_incident_at`))
      .limit(params.limit)
      .offset(params.offset);
  }

  async countFlaggedRides(tx: DbClient): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(rides)
      .where(eq(rides.flaggedForReview, true));
    return row?.count ?? 0;
  }

  async findRideReview(
    tx: DbClient,
    rideId: string,
  ): Promise<RideReviewRow | null> {
    const [row] = await tx
      .select({
        id: rides.id,
        tripId: trips.id,
        driverId: trips.driverId,
        driverName: user.name,
        scheduledDeparture: rides.scheduledDeparture,
        status: rides.status,
        originLabel: rides.originLabel,
        destinationLabel: rides.destinationLabel,
        startedAt: rides.startedAt,
        completedAt: rides.completedAt,
        flaggedForReview: rides.flaggedForReview,
      })
      .from(rides)
      .innerJoin(trips, eq(rides.tripId, trips.id))
      .innerJoin(user, eq(trips.driverId, user.id))
      .where(eq(rides.id, rideId))
      .limit(1);
    return row ?? null;
  }

  async listIncidentsForRide(
    tx: DbClient,
    rideId: string,
  ): Promise<SafetyIncident[]> {
    return tx
      .select()
      .from(safetyIncidents)
      .where(eq(safetyIncidents.rideId, rideId))
      .orderBy(desc(safetyIncidents.createdAt));
  }

  async clearReviewFlag(tx: DbClient, rideId: string): Promise<boolean> {
    const updated = await tx
      .update(rides)
      .set({ flaggedForReview: false })
      .where(eq(rides.id, rideId))
      .returning({ id: rides.id });
    return updated.length > 0;
  }
}
