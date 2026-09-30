import { test, expect } from '../fixtures';
import { BookingListSchema, BookingSchema } from '../support/schemas';
import { slot } from '../support/time';

test.describe('Bookings: viewing and cancelling', () => {
  test('"my bookings" lists only my own bookings, in start order @smoke', async ({ member, newMember, room }) => {
    const later = await (await member.createBooking({ roomId: room.id, title: 'Later', attendees: 1, ...slot({ daysAhead: 4 }) })).json();
    const sooner = await (await member.createBooking({ roomId: room.id, title: 'Sooner', attendees: 1, ...slot({ daysAhead: 2 }) })).json();
    const stranger = await newMember();
    await stranger.createBooking({ roomId: room.id, title: 'Not mine', attendees: 1, ...slot({ daysAhead: 3 }) });

    const res = await member.myBookings();
    await expect(res).toMatchSchema(BookingListSchema);
    const { items, total } = await res.json();
    expect(total).toBe(2);
    expect(items.map((b: { id: string }) => b.id)).toEqual([sooner.id, later.id]);
  });

  test('a member cannot read someone else\'s booking, and gets 404 rather than 403 @security', async ({
    member,
    newMember,
    room,
  }) => {
    const booking = await (await member.createBooking({ roomId: room.id, title: 'Private', attendees: 1, ...slot() })).json();
    const intruder = await newMember();

    // 404 (not 403) means an attacker can't even learn that the ID exists
    await expect(await intruder.getBooking(booking.id)).toFailWith(404, 'NOT_FOUND');
  });

  test('an admin can read any booking @regression', async ({ member, admin, room }) => {
    const booking = await (await member.createBooking({ roomId: room.id, title: 'Visible to admin', attendees: 1, ...slot() })).json();
    const res = await admin.getBooking(booking.id);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual(booking);
  });

  test('the owner can cancel a future booking @smoke', async ({ member, room }) => {
    const booking = await (await member.createBooking({ roomId: room.id, title: 'Cancel me', attendees: 1, ...slot() })).json();

    const res = await member.cancelBooking(booking.id);
    expect(res.status()).toBe(200);
    await expect(res).toMatchSchema(BookingSchema);
    expect(await res.json()).toMatchObject({ id: booking.id, status: 'cancelled' });

    // The cancellation is persisted
    expect((await (await member.getBooking(booking.id)).json()).status).toBe('cancelled');
  });

  test('cancelling twice → 409 @regression', async ({ member, room }) => {
    const booking = await (await member.createBooking({ roomId: room.id, title: 'Twice', attendees: 1, ...slot() })).json();
    await member.cancelBooking(booking.id);
    await expect(await member.cancelBooking(booking.id)).toFailWith(409, 'ALREADY_CANCELLED');
  });

  test('another member cannot cancel my booking @security', async ({ member, newMember, room }) => {
    const booking = await (await member.createBooking({ roomId: room.id, title: 'Mine', attendees: 1, ...slot() })).json();
    const intruder = await newMember();

    await expect(await intruder.cancelBooking(booking.id)).toFailWith(404, 'NOT_FOUND');
    expect((await (await member.getBooking(booking.id)).json()).status).toBe('confirmed');
  });

  test('an admin can cancel any booking @regression', async ({ member, admin, room }) => {
    const booking = await (await member.createBooking({ roomId: room.id, title: 'Admin cancels', attendees: 1, ...slot() })).json();
    const res = await admin.cancelBooking(booking.id);
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('cancelled');
  });
});
