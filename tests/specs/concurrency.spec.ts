import { test, expect } from '../fixtures';
import { unique } from '../support/unique';
import { slot } from '../support/time';

/**
 * Race-condition tests. Sequential tests can't see these bugs: every request
 * passes the "is it free?" check on its own, and the problem only appears
 * when several requests are in flight at the same moment.
 *
 * Regression guard for BUG-001 (double booking), see docs/bugs/BUG-001-double-booking.md
 */
test.describe('Concurrency', () => {
  test('simultaneous requests for the same slot produce exactly one booking @regression', async ({ newMember, room }) => {
    test.info().annotations.push({ type: 'regression', description: 'BUG-001: double booking under concurrent requests (fixed)' });

    const window = slot({ daysAhead: 5, hour: 13 });
    const members = await Promise.all(Array.from({ length: 8 }, () => newMember()));

    // Fire all requests at once, the way a busy Monday morning would
    const responses = await Promise.all(
      members.map((m, i) => m.bookings.create({ roomId: room.id, title: `Racer ${i + 1}`, attendees: 2, ...window })),
    );
    const statuses = responses.map((r) => r.status());

    expect(statuses.filter((s) => s === 201), `statuses: ${statuses.join(', ')}`).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(members.length - 1);

    // And the room really holds one booking for that hour
    const { busy } = await (await members[0].rooms.availability(room.id, window.start.slice(0, 10))).json();
    expect(busy).toEqual([window]);
  });

  test('simultaneous requests for DIFFERENT slots all succeed (control test) @regression', async ({ newMember, room }) => {
    // Proves the fix serialises only what conflicts, not every booking
    const members = await Promise.all(Array.from({ length: 8 }, () => newMember()));

    const responses = await Promise.all(
      members.map((m, i) =>
        m.bookings.create({ roomId: room.id, title: `Slot ${i + 1}`, attendees: 2, ...slot({ daysAhead: 5, hour: 8 + i }) }),
      ),
    );

    expect(responses.map((r) => r.status())).toEqual(Array(members.length).fill(201));
  });

  test('one member sending 8 bookings at once still gets at most 5 @regression', async ({ member, admin }) => {
    // Spread over different rooms, so only the per-member limit can stop them
    const rooms = await Promise.all(
      Array.from({ length: 8 }, async () => (await admin.rooms.create({ name: unique.roomName(), capacity: 4, floor: 1 })).json()),
    );

    const responses = await Promise.all(
      rooms.map((r, i) => member.bookings.create({ roomId: r.id, title: `Parallel ${i + 1}`, attendees: 1, ...slot({ daysAhead: 6 }) })),
    );
    const statuses = responses.map((r) => r.status());

    expect(statuses.filter((s) => s === 201), `statuses: ${statuses.join(', ')}`).toHaveLength(5);
    expect(statuses.filter((s) => s === 422)).toHaveLength(3);
  });

  test('parallel retries with the same idempotency key create one booking @regression', async ({ member, room }) => {
    const key = `parallel-${unique.id()}`;
    const body = { roomId: room.id, title: 'Double-tapped', attendees: 2, ...slot({ daysAhead: 7 }) };

    // A user double-taps "Book" on a slow connection: both requests leave before either returns
    const responses = await Promise.all([1, 2, 3].map(() => member.bookings.create(body, { idempotencyKey: key })));
    const ids = new Set(await Promise.all(responses.map(async (r) => (await r.json()).id)));

    expect(responses.map((r) => r.status()).sort()).toEqual([200, 200, 201]);
    expect(ids.size).toBe(1);
  });
});
