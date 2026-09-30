import { test, expect } from '../fixtures';
import { BookingSchema } from '../support/schemas';
import { slot, withOffset } from '../support/time';

test.describe('Bookings: creating', () => {
  test('a member can book a free room @smoke', async ({ member, room }) => {
    const window = slot({ daysAhead: 2, hour: 9 });
    const res = await member.createBooking({ roomId: room.id, title: 'Sprint planning', attendees: 5, ...window });

    expect(res.status()).toBe(201);
    await expect(res).toMatchSchema(BookingSchema);
    const booking = await res.json();
    expect(booking).toMatchObject({ roomId: room.id, status: 'confirmed', ...window });
    expect(res.headers()['location']).toBe(`/bookings/${booking.id}`);

    // The booking is really persisted, not just echoed back
    const fetched = await member.getBooking(booking.id);
    expect(await fetched.json()).toEqual(booking);
  });

  test('times sent with a timezone offset are stored and returned in UTC @regression', async ({ member, room }) => {
    const utc = slot({ daysAhead: 3, hour: 8 });
    const res = await member.createBooking({
      roomId: room.id,
      title: 'Copenhagen stand-up',
      attendees: 2,
      start: withOffset(utc.start, '+02:00'),
      end: withOffset(utc.end, '+02:00'),
    });

    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({ start: utc.start, end: utc.end });
  });

  test('a time without a timezone offset is rejected as ambiguous @regression', async ({ member, room }) => {
    const { start, end } = slot({ daysAhead: 2 });
    const res = await member.createBooking({
      roomId: room.id,
      title: 'No offset',
      attendees: 1,
      start: start.replace('.000Z', ''),
      end: end.replace('.000Z', ''),
    });
    await expect(res).toFailWith(400, 'VALIDATION_ERROR');
  });

  test.describe('duration boundaries (15-240 minutes, 15-minute slots)', () => {
    for (const [minutes, status, code] of [
      [15, 201, null],
      [240, 201, null],
      [255, 422, 'INVALID_DURATION'],
    ] as const) {
      test(`${minutes} minutes → ${status} @regression`, async ({ member, room }) => {
        const res = await member.createBooking({
          roomId: room.id,
          title: 'Duration check',
          attendees: 1,
          ...slot({ daysAhead: 2, hour: 8, durationMinutes: minutes }),
        });
        if (code) await expect(res).toFailWith(status, code);
        else expect(res.status()).toBe(status);
      });
    }

    test('start not on a 15-minute boundary → 422 @regression', async ({ member, room }) => {
      const res = await member.createBooking({
        roomId: room.id,
        title: 'Odd start',
        attendees: 1,
        ...slot({ daysAhead: 2, hour: 10, minute: 5, durationMinutes: 30 }),
      });
      await expect(res).toFailWith(422, 'NOT_ON_SLOT_BOUNDARY');
    });

    test('end equal to start → 422 @regression', async ({ member, room }) => {
      const { start } = slot({ daysAhead: 2 });
      const res = await member.createBooking({ roomId: room.id, title: 'Zero length', attendees: 1, start, end: start });
      await expect(res).toFailWith(422, 'INVALID_TIME_RANGE');
    });

    test('end before start → 422 @regression', async ({ member, room }) => {
      const { start, end } = slot({ daysAhead: 2 });
      const res = await member.createBooking({ roomId: room.id, title: 'Backwards', attendees: 1, start: end, end: start });
      await expect(res).toFailWith(422, 'INVALID_TIME_RANGE');
    });
  });

  test.describe('booking horizon', () => {
    test('a start in the past → 422 @regression', async ({ member, room }) => {
      const res = await member.createBooking({ roomId: room.id, title: 'Yesterday', attendees: 1, ...slot({ daysAhead: -1 }) });
      await expect(res).toFailWith(422, 'START_IN_PAST');
    });

    test('89 days ahead is accepted, 91 days ahead is not @regression', async ({ member, room }) => {
      const ok = await member.createBooking({ roomId: room.id, title: 'Far', attendees: 1, ...slot({ daysAhead: 89 }) });
      expect(ok.status()).toBe(201);

      const tooFar = await member.createBooking({ roomId: room.id, title: 'Too far', attendees: 1, ...slot({ daysAhead: 91 }) });
      await expect(tooFar).toFailWith(422, 'TOO_FAR_AHEAD');
    });
  });

  test.describe('capacity (room holds 8)', () => {
    test('attendees equal to capacity is allowed @regression', async ({ member, room }) => {
      const res = await member.createBooking({ roomId: room.id, title: 'Full room', attendees: room.capacity, ...slot() });
      expect(res.status()).toBe(201);
    });

    test('one attendee over capacity → 422 @regression', async ({ member, room }) => {
      const res = await member.createBooking({
        roomId: room.id,
        title: 'Overflow',
        attendees: room.capacity + 1,
        ...slot(),
      });
      await expect(res).toFailWith(422, 'OVER_CAPACITY');
    });
  });

  test('a member can hold at most 5 upcoming bookings @regression', async ({ member, room }) => {
    for (let day = 1; day <= 5; day++) {
      const res = await member.createBooking({ roomId: room.id, title: `Booking ${day}`, attendees: 1, ...slot({ daysAhead: day }) });
      expect(res.status(), `booking ${day} should succeed`).toBe(201);
    }
    const sixth = await member.createBooking({ roomId: room.id, title: 'One too many', attendees: 1, ...slot({ daysAhead: 6 }) });
    await expect(sixth).toFailWith(422, 'BOOKING_LIMIT_REACHED');
  });

  test('cancelling frees up a place under the 5-booking limit @regression', async ({ member, room }) => {
    const ids: string[] = [];
    for (let day = 1; day <= 5; day++) {
      ids.push((await (await member.createBooking({ roomId: room.id, title: `B${day}`, attendees: 1, ...slot({ daysAhead: day }) })).json()).id);
    }
    await member.cancelBooking(ids[0]);
    const res = await member.createBooking({ roomId: room.id, title: 'Now allowed', attendees: 1, ...slot({ daysAhead: 6 }) });
    expect(res.status()).toBe(201);
  });

  test('booking a room that does not exist → 404 @regression', async ({ member }) => {
    const res = await member.createBooking({ roomId: 'r-nope', title: 'Ghost room', attendees: 1, ...slot() });
    await expect(res).toFailWith(404, 'NOT_FOUND');
  });

  const window = slot();
  const valid = { roomId: 'placeholder', title: 'Valid', attendees: 1, ...window };
  const invalidBodies: Array<[string, Record<string, unknown>]> = [
    ['missing title', { ...valid, title: undefined }],
    ['blank title', { ...valid, title: '   ' }],
    ['title over 100 characters', { ...valid, title: 'x'.repeat(101) }],
    ['zero attendees', { ...valid, attendees: 0 }],
    ['fractional attendees', { ...valid, attendees: 2.5 }],
    ['attendees as a string', { ...valid, attendees: '3' }],
    ['start is not a date', { ...valid, start: 'tomorrow at ten' }],
    ['missing end', { ...valid, end: undefined }],
  ];
  for (const [name, body] of invalidBodies) {
    test(`request validation: ${name} → 400 @regression`, async ({ member, room }) => {
      const res = await member.createBooking({ ...body, roomId: room.id });
      await expect(res).toFailWith(400, 'VALIDATION_ERROR');
    });
  }

  test('title of exactly 100 characters is accepted @regression', async ({ member, room }) => {
    const res = await member.createBooking({ roomId: room.id, title: 'x'.repeat(100), attendees: 1, ...slot() });
    expect(res.status()).toBe(201);
  });

  test('validation errors say which field is wrong @regression', async ({ member, room }) => {
    const res = await member.createBooking({ roomId: room.id, title: '', attendees: 0, ...slot() });
    const { error } = await res.json();
    const paths = error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['title', 'attendees']));
  });
});
