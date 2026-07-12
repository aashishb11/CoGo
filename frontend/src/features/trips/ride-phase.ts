import type { RideStatus } from '@/features/trips/api';

// Start ride is allowed from 30 min before scheduled departure to 2 h after.
// Mirrors the backend window so the FE can disable the action and show a
// countdown without round-tripping to surface RIDE_NOT_DEPARTED.
const START_WINDOW_BEFORE_MS = 30 * 60 * 1000;
const START_WINDOW_AFTER_MS = 2 * 60 * 60 * 1000;

export type RidePhase = 'pre_window' | 'startable' | 'in_progress' | 'completed' | 'cancelled';

export type RideActions = {
  /** Driver may flip the ride into IN_PROGRESS now. */
  canStart: boolean;
  /** Driver may capture passenger boardings via QR scan. */
  canScan: boolean;
  /** Driver may mark the ride as completed. */
  canComplete: boolean;
  /** Driver may cancel this ride instance. */
  canCancel: boolean;
  /** Passenger may show their boarding QR (only once the ride is in progress). */
  canShowBoardingPass: boolean;
  /** Passenger may cancel their own booking. */
  canCancelMyBooking: boolean;
  /** Driver/passenger may report an incident (in_progress or just completed). */
  canReportIncident: boolean;
};

export type RidePhaseInfo = RideActions & {
  phase: RidePhase;
  /** Pre-window only — earliest ts (ms) when start becomes allowed. */
  startWindowStart: number | null;
  /** Pre/in-window only — last ts (ms) when start is still allowed. */
  startWindowEnd: number | null;
};

type DeriveInput = {
  status?: RideStatus | null;
  scheduledDeparture: string;
  /** Optional clock override for tests. */
  now?: number;
};

function parseDeparture(value: string): number | null {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

// Time-based fallback when the backend doesn't ship a status on the agenda.
// Errs on the side of "not in progress" so we don't accidentally show
// scan/QR before the driver has actually started.
function inferPhase(now: number, scheduledDeparture: number): RidePhase {
  if (now < scheduledDeparture - START_WINDOW_BEFORE_MS) return 'pre_window';
  if (now <= scheduledDeparture + START_WINDOW_AFTER_MS) return 'startable';
  return 'startable'; // After the window the backend still owns the gate; we keep startable so the user sees the actual error from the API.
}

/**
 * Resolve every ride-lifecycle action availability in one place. The agenda
 * card, trip-details row, and any other surface should consume this instead
 * of recomputing time/status checks inline.
 *
 * `status` (when provided by the backend) is the source of truth; we only
 * use time as a fallback when status is absent.
 */
export function derivePhase({ status, scheduledDeparture, now }: DeriveInput): RidePhaseInfo {
  const ts = parseDeparture(scheduledDeparture);
  const clock = now ?? Date.now();

  const startWindowStart = ts !== null ? ts - START_WINDOW_BEFORE_MS : null;
  const startWindowEnd = ts !== null ? ts + START_WINDOW_AFTER_MS : null;

  let phase: RidePhase;
  if (status === 'completed') {
    phase = 'completed';
  } else if (status === 'cancelled') {
    phase = 'cancelled';
  } else if (status === 'in_progress') {
    phase = 'in_progress';
  } else if (status === 'active' || status == null) {
    phase = ts !== null ? inferPhase(clock, ts) : 'startable';
  } else {
    phase = 'startable';
  }

  const insideWindow =
    startWindowStart !== null &&
    startWindowEnd !== null &&
    clock >= startWindowStart &&
    clock <= startWindowEnd;

  // Recently completed = within the last 24 h. Incident reporting stays open
  // for that window per the backend rules.
  const recentlyCompleted =
    phase === 'completed' && ts !== null && clock - ts < 24 * 60 * 60 * 1000;

  const canStart = phase === 'startable' && insideWindow;
  const canScan = phase === 'in_progress';
  const canComplete = phase === 'in_progress' || (phase === 'startable' && insideWindow);
  const canCancel = phase === 'startable' || phase === 'pre_window';
  const canShowBoardingPass = phase === 'in_progress';
  const canCancelMyBooking = phase === 'startable' || phase === 'pre_window';
  const canReportIncident = phase === 'in_progress' || recentlyCompleted;

  return {
    phase,
    startWindowStart,
    startWindowEnd,
    canStart,
    canScan,
    canComplete,
    canCancel,
    canShowBoardingPass,
    canCancelMyBooking,
    canReportIncident,
  };
}

/** Format the wait until start becomes available (HH:MM). */
export function formatStartWindowOpensAt(startWindowStart: number | null): string {
  if (startWindowStart === null) return '';
  const date = new Date(startWindowStart);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
