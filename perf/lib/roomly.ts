import http, { type RefinedResponse, type ResponseType } from 'k6/http';
import { check, fail } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const ADMIN = { email: 'ada@roomly.test', password: 'Admin#2026' };
const JSON_HEADERS = { 'Content-Type': 'application/json' };

// 409 (slot taken) is a correct business answer under load, not a failure.
// Anything else outside 2xx counts towards http_req_failed.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 409));

export const auth = (token: string) => ({ headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` } });

export function login(email: string, password: string): string {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), {
    headers: JSON_HEADERS,
    tags: { name: 'login' },
  });
  if (res.status !== 200) fail(`login failed for ${email}: ${res.status}`);
  return res.json('token') as string;
}

export interface TestData {
  memberTokens: string[];
  roomIds: string[];
}

/** Runs once before the test: creates dedicated members and rooms so load never touches seeded data. */
export function createTestData({ members, rooms }: { members: number; rooms: number }): TestData {
  const adminToken = login(ADMIN.email, ADMIN.password);
  const runId = Date.now().toString(36);
  const memberTokens: string[] = [];
  const roomIds: string[] = [];

  for (let i = 0; i < members; i++) {
    const email = `perf.${runId}.${i}@roomly.test`;
    const res = http.post(
      `${BASE_URL}/users`,
      JSON.stringify({ name: `Perf ${i}`, email, password: 'Perf#Pass2026' }),
      { ...auth(adminToken), tags: { name: 'setup' } },
    );
    if (res.status !== 201) fail(`could not create member: ${res.status}`);
    memberTokens.push(login(email, 'Perf#Pass2026'));
  }
  for (let i = 0; i < rooms; i++) {
    const res = http.post(
      `${BASE_URL}/rooms`,
      JSON.stringify({ name: `Perf Room ${runId}-${i}`, capacity: 12, floor: 5 }),
      { ...auth(adminToken), tags: { name: 'setup' } },
    );
    if (res.status !== 201) fail(`could not create room: ${res.status}`);
    roomIds.push(res.json('id') as string);
  }
  return { memberTokens, roomIds };
}

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick = <T>(items: T[]): T => items[randInt(0, items.length - 1)];

/** A random future window on a 15-minute boundary, spread wide so conflicts stay rare. */
export function randomWindow(): { start: string; end: string } {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + randInt(1, 80));
  start.setUTCHours(randInt(6, 18), randInt(0, 3) * 15, 0, 0);
  const end = new Date(start.getTime() + randInt(1, 4) * 15 * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ---- User journeys -------------------------------------------------------

type Res = RefinedResponse<ResponseType | undefined>;
const ok = (res: Res, name: string, statuses: number[]) =>
  check(res, { [`${name}: status ${statuses.join('/')}`]: (r) => statuses.includes(r.status) });

/** Someone looking for a room: search, then check a room's day. */
export function browse(token: string, roomIds: string[]): void {
  const list = http.get(`${BASE_URL}/rooms?minCapacity=4&limit=20`, { ...auth(token), tags: { name: 'list_rooms' } });
  ok(list, 'list rooms', [200]);

  const date = randomWindow().start.slice(0, 10);
  const avail = http.get(`${BASE_URL}/rooms/${pick(roomIds)}/availability?date=${date}`, {
    ...auth(token),
    tags: { name: 'availability' },
  });
  ok(avail, 'availability', [200]);
}

/** Someone booking a room, then cancelling it (keeps members under the 5-booking limit). */
export function bookAndCancel(token: string, roomIds: string[]): void {
  const res = http.post(
    `${BASE_URL}/bookings`,
    JSON.stringify({ roomId: pick(roomIds), title: 'Load test meeting', attendees: 4, ...randomWindow() }),
    { ...auth(token), tags: { name: 'create_booking' } },
  );
  ok(res, 'create booking', [201, 409]);

  if (res.status === 201) {
    const id = res.json('id') as string;
    const del = http.del(`${BASE_URL}/bookings/${id}`, null, { ...auth(token), tags: { name: 'cancel_booking' } });
    ok(del, 'cancel booking', [200]);
  }
}

export function myBookings(token: string): void {
  const res = http.get(`${BASE_URL}/bookings/me`, { ...auth(token), tags: { name: 'my_bookings' } });
  ok(res, 'my bookings', [200]);
}

/** Realistic traffic mix: most people look, fewer book. */
export function mixedJourney(data: TestData): void {
  const token = data.memberTokens[(__VU - 1) % data.memberTokens.length];
  const roll = Math.random();
  if (roll < 0.7) browse(token, data.roomIds);
  else if (roll < 0.9) bookAndCancel(token, data.roomIds);
  else myBookings(token);
}
