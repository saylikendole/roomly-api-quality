import { test, expect } from '../fixtures';
import { AvailabilitySchema } from '../support/schemas';
import { shift, slot, withOffset } from '../support/time';

/**
 * Overlap rules, tested as a decision table against one existing booking
 * from 10:00 to 11:00 UTC. The rule: two bookings clash when each starts
 * before the other ends. Touching edges (back-to-back) is allowed.
 *
 *   09:00      10:00      11:00      12:00
 *     |          |██████████|          |      existing
 */
const EXISTING = { hour: 10, durationMinutes: 60 } as const;

const cases: Array<{ name: string; startOffset: number; duration: number; clash: boolean }> = [
  { name: 'identical window', startOffset: 0, duration: 60, clash: true },
  { name: 'starts 15 min before, ends inside', startOffset: -15, duration: 30, clash: true },
  { name: 'starts inside, ends 15 min after', startOffset: 45, duration: 30, clash: true },
  { name: 'fully contains the existing booking', startOffset: -30, duration: 120, clash: true },
  { name: 'sits fully inside the existing booking', startOffset: 15, duration: 30, clash: true },
  { name: 'ends exactly when the existing one starts (back-to-back before)', startOffset: -60, duration: 60, clash: false },
  { name: 'starts exactly when the existing one ends (back-to-back after)', startOffset: 60, duration: 60, clash: false },
  { name: 'well before', startOffset: -180, duration: 60, clash: false },
];

test.describe('Bookings: overlap rules', () => {
  for (const c of cases) {
    test(`${c.name} → ${c.clash ? '409 conflict' : '201 created'} @regression`, async ({ member, newMember, room }) => {
      const existing = slot({ daysAhead: 2, ...EXISTING });
      expect((await member.createBooking({ roomId: room.id, title: 'Existing', attendees: 2, ...existing })).status()).toBe(201);

      const other = await newMember();
      const start = shift(existing.start, c.startOffset);
      const res = await other.createBooking({
        roomId: room.id,
        title: 'Candidate',
        attendees: 2,
        start,
        end: shift(start, c.duration),
      });

      if (c.clash) {
        await expect(res).toFailWith(409, 'BOOKING_CONFLICT');
        // The conflict tells you WHEN the room is busy, so a UI could suggest another time
        expect((await res.json()).error.details.conflictingWindow).toEqual(existing);
      } else {
        expect(res.status()).toBe(201);
      }
    });
  }

  test('a clash is detected even when the second request uses a different timezone offset @regression', async ({
    member,
    newMember,
    room,
  }) => {
    const existing = slot({ daysAhead: 2, ...EXISTING });
    await member.createBooking({ roomId: room.id, title: 'Existing (UTC)', attendees: 2, ...existing });

    // Same instant, written as India Standard Time (+05:30)
    const other = await newMember();
    const res = await other.createBooking({
      roomId: room.id,
      title: 'Same slot, IST',
      attendees: 2,
      start: withOffset(existing.start, '+05:30'),
      end: withOffset(existing.end, '+05:30'),
    });
    await expect(res).toFailWith(409, 'BOOKING_CONFLICT');
  });

  test('the same time in a different room is not a conflict @regression', async ({ member, admin, room }) => {
    const window = slot({ daysAhead: 2, ...EXISTING });
    await member.createBooking({ roomId: room.id, title: 'Room A', attendees: 2, ...window });

    const otherRoom = await (await admin.createRoom({ name: `Other ${Date.now()}`, capacity: 4, floor: 1 })).json();
    const res = await member.createBooking({ roomId: otherRoom.id, title: 'Room B', attendees: 2, ...window });
    expect(res.status()).toBe(201);
  });

  test('a cancelled booking no longer blocks its slot @regression', async ({ member, newMember, room }) => {
    const window = slot({ daysAhead: 2, ...EXISTING });
    const first = await (await member.createBooking({ roomId: room.id, title: 'Will cancel', attendees: 2, ...window })).json();
    expect((await member.cancelBooking(first.id)).status()).toBe(200);

    const other = await newMember();
    const res = await other.createBooking({ roomId: room.id, title: 'Takes the slot', attendees: 2, ...window });
    expect(res.status()).toBe(201);
  });
});

test.describe('Rooms: availability', () => {
  test('shows busy windows for the day, without leaking titles or owners @smoke @security', async ({ member, newMember, room }) => {
    const morning = slot({ daysAhead: 3, hour: 9 });
    const afternoon = slot({ daysAhead: 3, hour: 14, durationMinutes: 30 });
    await member.createBooking({ roomId: room.id, title: 'Confidential: layoffs', attendees: 2, ...afternoon });
    await member.createBooking({ roomId: room.id, title: 'Morning sync', attendees: 2, ...morning });

    const viewer = await newMember();
    const res = await viewer.availability(room.id, morning.start.slice(0, 10));

    expect(res.status()).toBe(200);
    await expect(res).toMatchSchema(AvailabilitySchema); // strict schema: any extra field (title, ownerId) fails
    const { busy } = await res.json();
    expect(busy).toEqual([morning, afternoon]); // sorted by start time
    expect(JSON.stringify(busy)).not.toContain('Confidential');
  });

  test('cancelled bookings are not shown as busy @regression', async ({ member, room }) => {
    const window = slot({ daysAhead: 3, hour: 9 });
    const b = await (await member.createBooking({ roomId: room.id, title: 'Cancel me', attendees: 1, ...window })).json();
    await member.cancelBooking(b.id);

    const { busy } = await (await member.availability(room.id, window.start.slice(0, 10))).json();
    expect(busy).toEqual([]);
  });

  for (const date of ['2026-13-01', '01-10-2026', 'tomorrow', '']) {
    test(`rejects an invalid date "${date}" @regression`, async ({ member, room }) => {
      await expect(await member.availability(room.id, date)).toFailWith(400, 'VALIDATION_ERROR');
    });
  }
});
