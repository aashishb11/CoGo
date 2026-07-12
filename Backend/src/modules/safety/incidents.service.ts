import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { and, eq, isNotNull } from 'drizzle-orm';
import { DB, type DbClient } from '@core/database/database.module';
import {
  bookings,
  rides,
  trips,
  user as userTable,
} from '@core/database/schema';
import type * as schema from '@core/database/schema';
import type { SafetyIncident } from '@core/database/schema/safety-incidents.schema';
import { MailService } from '@integrations/mail/mail.service';
import { throwBadRequest, throwForbidden } from '@shared/errors/throw';
import { CreateIncidentDto } from './dto/create-incident.dto';
import {
  IncidentsRepository,
  type AdminIncidentDetail,
  type FlaggedRideRow,
  type IncidentPassengerPayload,
  type RideReviewRow,
} from './incidents.repository';
import { TrustedContactRepository } from './trusted-contact.repository';

// Window during which an incident can be filed after the ride completes.
// `in_progress` rides are always open; completed rides up to this duration
// past `completed_at` are open. Past that → `INCIDENT_WINDOW_CLOSED`.
export const INCIDENT_WINDOW_AFTER_COMPLETION_MS = 24 * 60 * 60 * 1000;

type EligibilityResult =
  | { kind: 'driver' }
  | { kind: 'passenger'; bookingId: string };

export type AdminIncidentDetailWithRole = Omit<
  AdminIncidentDetail,
  'reporter'
> & {
  reporter: AdminIncidentDetail['reporter'] & {
    role: 'driver' | 'passenger';
  };
};

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly repo: IncidentsRepository,
    private readonly trustedContactRepo: TrustedContactRepository,
    private readonly mailService: MailService,
  ) {}

  /**
   * Inserts a safety incident on `rideId` reported by `reporterId`. Runs the
   * eligibility check (driver or boarded passenger) and the 24h window guard
   * inside the same tx as the insert + the `rides.flagged_for_review` flip.
   *
   * The trusted-contact alert email is dispatched AFTER the transaction
   * commits. Email failures are logged and swallowed so they never roll back
   * an incident that the user has already submitted.
   */
  async create(
    reporterId: string,
    rideId: string,
    body: CreateIncidentDto,
  ): Promise<SafetyIncident> {
    const result = await this.db.transaction(async (tx) => {
      const ride = await this.loadRideOrThrow(tx, rideId);
      const eligibility = await this.assertEligibility(
        tx,
        ride.tripId,
        ride.id,
        reporterId,
      );
      this.assertWindow(ride.status, ride.completedAt);

      const inserted = await this.repo.insert(tx, {
        id: randomUUID(),
        rideId,
        reporterId,
        category: body.category,
        note: body.note ?? null,
      });

      await tx
        .update(rides)
        .set({ flaggedForReview: true })
        .where(eq(rides.id, rideId));

      return { inserted, eligibility };
    });

    // post-commit: dispatching the email here means a failed send never
    // unwinds the incident row. Mirrors the `RIDE_COMPLETED` event emit in
    // `RidesService.complete`.
    await this.dispatchAlertEmail(result.inserted, result.eligibility).catch(
      (err: unknown) => {
        this.logger.error(
          `Failed to dispatch incident alert email for incident ${result.inserted.id}`,
          err instanceof Error ? err.stack : err,
        );
      },
    );

    return result.inserted;
  }

  async listMine(
    reporterId: string,
    params: { limit: number; offset: number },
  ): Promise<{ items: SafetyIncident[]; total: number }> {
    const [items, total] = await Promise.all([
      this.repo.listForReporter(this.db, reporterId, params),
      this.repo.countForReporter(this.db, reporterId),
    ]);
    return { items, total };
  }

  // ── Admin surface ──────────────────────────────────────────────────────

  async listAllForAdmin(params: {
    limit: number;
    offset: number;
  }): Promise<{ items: SafetyIncident[]; total: number }> {
    const [items, total] = await Promise.all([
      this.repo.listAll(this.db, params),
      this.repo.countAll(this.db),
    ]);
    return { items, total };
  }

  /**
   * Returns the hydrated incident (ride snapshot + reporter identity + role).
   * Reporter role is driver iff `reporterId === ride.driverId`; otherwise
   * passenger. Eligibility was enforced at write time, so the reporter is
   * guaranteed to be one or the other.
   */
  async getIncidentForAdmin(
    incidentId: string,
  ): Promise<AdminIncidentDetailWithRole> {
    const detail = await this.repo.findAdminDetailById(this.db, incidentId);
    if (!detail) {
      throw new NotFoundException('Incident not found');
    }
    const role: 'driver' | 'passenger' =
      detail.reporter.id === detail.ride.driverId ? 'driver' : 'passenger';
    return {
      ...detail,
      reporter: { ...detail.reporter, role },
    };
  }

  async listFlaggedRidesForAdmin(params: {
    limit: number;
    offset: number;
  }): Promise<{ items: FlaggedRideRow[]; total: number }> {
    const [items, total] = await Promise.all([
      this.repo.listFlaggedRides(this.db, params),
      this.repo.countFlaggedRides(this.db),
    ]);
    return { items, total };
  }

  async getRideReviewForAdmin(
    rideId: string,
  ): Promise<{ ride: RideReviewRow; incidents: SafetyIncident[] }> {
    const ride = await this.repo.findRideReview(this.db, rideId);
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    const incidents = await this.repo.listIncidentsForRide(this.db, rideId);
    return { ride, incidents };
  }

  async resolveRideReview(rideId: string): Promise<RideReviewRow> {
    const cleared = await this.repo.clearReviewFlag(this.db, rideId);
    if (!cleared) {
      throw new NotFoundException('Ride not found');
    }
    const ride = await this.repo.findRideReview(this.db, rideId);
    // The UPDATE above succeeded with the same id, so the SELECT cannot miss
    // unless the row was deleted concurrently — impossible in practice given
    // `onDelete: 'restrict'` on safety_incidents → rides.
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    return ride;
  }

  // ── private helpers ────────────────────────────────────────────────────

  private async loadRideOrThrow(
    tx: DbClient,
    rideId: string,
  ): Promise<{
    id: string;
    tripId: string;
    status: string;
    completedAt: Date | null;
  }> {
    const [row] = await tx
      .select({
        id: rides.id,
        tripId: rides.tripId,
        status: rides.status,
        completedAt: rides.completedAt,
      })
      .from(rides)
      .where(eq(rides.id, rideId))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Ride not found');
    }
    return row;
  }

  private async assertEligibility(
    tx: DbClient,
    tripId: string,
    rideId: string,
    reporterId: string,
  ): Promise<EligibilityResult> {
    const [tripRow] = await tx
      .select({ driverId: trips.driverId })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    if (tripRow?.driverId === reporterId) {
      return { kind: 'driver' };
    }
    // Passenger eligibility: `boarded_at IS NOT NULL` on this ride. The
    // booking's status (accepted vs. cancelled) is not consulted — boarding
    // is the authoritative participation signal per the plan.
    const [bookingRow] = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.rideId, rideId),
          eq(bookings.passengerId, reporterId),
          isNotNull(bookings.boardedAt),
        ),
      )
      .limit(1);
    if (bookingRow) {
      return { kind: 'passenger', bookingId: bookingRow.id };
    }
    throwForbidden(
      'FORBIDDEN',
      'Only the trip driver or a boarded passenger may report an incident',
    );
  }

  private assertWindow(rideStatus: string, completedAt: Date | null): void {
    if (rideStatus === 'in_progress') {
      return;
    }
    if (rideStatus === 'completed' && completedAt) {
      const elapsed = Date.now() - completedAt.getTime();
      if (elapsed <= INCIDENT_WINDOW_AFTER_COMPLETION_MS) {
        return;
      }
    }
    throwBadRequest(
      'INCIDENT_WINDOW_CLOSED',
      'Incidents can only be filed while the ride is in progress or within 24 hours of completion',
      { rideStatus, completedAt: completedAt ?? null },
    );
  }

  private async dispatchAlertEmail(
    incident: SafetyIncident,
    eligibility: EligibilityResult,
  ): Promise<void> {
    const trusted = await this.trustedContactRepo.findByUserId(
      this.db,
      incident.reporterId,
    );
    if (!trusted) {
      // Booking and trip publish both gate-check trusted contact, so a
      // reporter without one should be effectively impossible. Log and
      // bail rather than throw — the incident row is already persisted.
      this.logger.warn(
        `Incident reporter ${incident.reporterId} has no trusted contact; skipping alert email`,
      );
      return;
    }

    const ridePayload = await this.repo.findRidePayload(
      this.db,
      incident.rideId,
    );
    if (!ridePayload) {
      this.logger.error(
        `Ride payload missing for incident on ride ${incident.rideId} (impossible: insert above succeeded)`,
      );
      return;
    }

    const reporter = await this.lookupUserName(incident.reporterId);

    let passengers: IncidentPassengerPayload[] = [];
    if (eligibility.kind === 'driver') {
      passengers = await this.repo.findAcceptedPassengersForEmail(
        this.db,
        incident.rideId,
      );
    }

    await this.mailService.sendIncidentAlertEmail({
      reporterId: incident.reporterId,
      reporterName: reporter,
      reporterRole: eligibility.kind,
      category: incident.category,
      note: incident.note,
      trustedContact: { name: trusted.name, email: trusted.email },
      ride: ridePayload,
      acceptedPassengers: passengers,
    });
  }

  private async lookupUserName(userId: string): Promise<string> {
    const [row] = await this.db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);
    return row?.name ?? '';
  }
}
