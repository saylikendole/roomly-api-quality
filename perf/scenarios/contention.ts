import http from 'k6/http';
import { Counter } from 'k6/metrics';
import type { Options } from 'k6/options';
import { auth, BASE_URL, createTestData, type TestData } from '../lib/roomly.ts';

/**
 * Contention: many users try to grab the SAME slot in the SAME room at the
 * same moment. This is a correctness test that happens to need load.
 *
 * Expected: exactly one booking succeeds per round. Before the fix for
 * BUG-001 this run created 87 bookings instead of 5; it now runs in CI as a
 * regression guard. See docs/bugs/BUG-001-double-booking.md
 */
const successfulBookings = new Counter('successful_bookings_for_contested_slot');

const ROUNDS = 5;
const USERS_PER_ROUND = 20;

export const options: Options = {
  scenarios: {
    rush: {
      executor: 'per-vu-iterations',
      vus: USERS_PER_ROUND,
      iterations: ROUNDS,
      maxDuration: '1m',
    },
  },
  thresholds: {
    // Exactly one winner per round: more means double booking, fewer means requests failed
    successful_bookings_for_contested_slot: [`count==${ROUNDS}`],
    http_req_failed: ['rate==0'], // 409 is an expected status, see perf/lib/roomly.ts
  },
};

export function setup(): TestData {
  return createTestData({ members: USERS_PER_ROUND, rooms: 1 });
}

export default function (data: TestData): void {
  const token = data.memberTokens[__VU - 1];
  // Every VU in the same iteration targets the same window: round N → N+1 days ahead at 12:00 UTC
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + __ITER + 1);
  start.setUTCHours(12, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);

  const res = http.post(
    `${BASE_URL}/bookings`,
    JSON.stringify({ roomId: data.roomIds[0], title: `Rush ${__ITER}`, attendees: 2, start: start.toISOString(), end: end.toISOString() }),
    { ...auth(token), tags: { name: 'contested_booking' } },
  );
  if (res.status === 201) successfulBookings.add(1);
}
