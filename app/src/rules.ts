import { ApiError } from './errors.js';
import type { Booking } from './store.js';

export const RULES = {
  slotMinutes: 15,
  minDurationMinutes: 15,
  maxDurationMinutes: 240,
  maxDaysAhead: 90,
  maxUpcomingBookingsPerMember: 5,
} as const;

const MINUTE = 60_000;

/** Validates the time window of a booking. Throws a 422 ApiError on the first broken rule. */
export function assertValidWindow(start: Date, end: Date, now: Date = new Date()): void {
  if (start.getTime() <= now.getTime()) {
    throw new ApiError(422, 'START_IN_PAST', 'Bookings must start in the future');
  }
  if (end.getTime() <= start.getTime()) {
    throw new ApiError(422, 'INVALID_TIME_RANGE', 'end must be after start');
  }
  for (const [name, d] of [['start', start], ['end', end]] as const) {
    if (d.getUTCMinutes() % RULES.slotMinutes !== 0 || d.getUTCSeconds() !== 0 || d.getUTCMilliseconds() !== 0) {
      throw new ApiError(422, 'NOT_ON_SLOT_BOUNDARY', `${name} must be on a ${RULES.slotMinutes}-minute boundary`);
    }
  }
  const minutes = (end.getTime() - start.getTime()) / MINUTE;
  if (minutes < RULES.minDurationMinutes || minutes > RULES.maxDurationMinutes) {
    throw new ApiError(
      422,
      'INVALID_DURATION',
      `Duration must be between ${RULES.minDurationMinutes} and ${RULES.maxDurationMinutes} minutes`,
    );
  }
  if (start.getTime() > now.getTime() + RULES.maxDaysAhead * 24 * 60 * MINUTE) {
    throw new ApiError(422, 'TOO_FAR_AHEAD', `Bookings can be made at most ${RULES.maxDaysAhead} days ahead`);
  }
}

/**
 * Two windows overlap when each starts before the other ends.
 * Back-to-back bookings (10:00-11:00 and 11:00-12:00) do NOT overlap.
 */
export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean =>
  aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();

export function findConflict(bookings: Booking[], roomId: string, start: Date, end: Date): Booking | undefined {
  return bookings.find(
    (b) =>
      b.roomId === roomId && b.status === 'confirmed' && overlaps(start, end, new Date(b.start), new Date(b.end)),
  );
}
