const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export interface Window {
  start: string;
  end: string;
}

/**
 * Builds a booking window N days from today, at a fixed UTC time.
 * Using whole days ahead keeps tests independent of when they run
 * (no "passes before lunch, fails after" surprises).
 */
export function slot({
  daysAhead = 1,
  hour = 10,
  minute = 0,
  durationMinutes = 60,
}: { daysAhead?: number; hour?: number; minute?: number; durationMinutes?: number } = {}): Window {
  const base = new Date();
  base.setUTCHours(hour, minute, 0, 0);
  const start = new Date(base.getTime() + daysAhead * DAY);
  const end = new Date(start.getTime() + durationMinutes * MINUTE);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Shifts an ISO timestamp by a number of minutes. */
export const shift = (iso: string, minutes: number): string =>
  new Date(new Date(iso).getTime() + minutes * MINUTE).toISOString();

/** Re-expresses a UTC instant with another offset, e.g. withOffset('2026-10-02T08:00:00.000Z', '+02:00') -> '2026-10-02T10:00:00+02:00' */
export function withOffset(iso: string, offset: `${'+' | '-'}${string}:${string}`): string {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  const local = new Date(new Date(iso).getTime() + sign * (h * 60 + m) * MINUTE);
  return `${local.toISOString().slice(0, 19)}${offset}`;
}
