import { test, expect } from '../fixtures';
import { unique } from '../support/roomly-client';
import { slot } from '../support/time';

/**
 * Idempotency: mobile apps retry requests on flaky networks. If the first
 * request succeeded but the response was lost, the retry must not create a
 * second booking.
 */
test.describe('Bookings: idempotency keys', () => {
  test('retrying with the same key returns the original booking instead of a duplicate @smoke', async ({ member, room }) => {
    const key = `retry-${unique.id()}`;
    const body = { roomId: room.id, title: 'Retry-safe', attendees: 2, ...slot() };

    const first = await member.createBooking(body, { idempotencyKey: key });
    const retry = await member.createBooking(body, { idempotencyKey: key });

    expect(first.status()).toBe(201);
    expect(retry.status()).toBe(200);
    expect(retry.headers()['idempotent-replay']).toBe('true');
    expect((await retry.json()).id).toBe((await first.json()).id);

    const { total } = await (await member.myBookings()).json();
    expect(total).toBe(1);
  });

  test('without a key, a retry is a new request and hits the overlap rule @regression', async ({ member, room }) => {
    const body = { roomId: room.id, title: 'No key', attendees: 2, ...slot() };
    expect((await member.createBooking(body)).status()).toBe(201);
    await expect(await member.createBooking(body)).toFailWith(409, 'BOOKING_CONFLICT');
  });

  test('keys are scoped per user: the same key from two users creates two bookings @security', async ({
    member,
    newMember,
    room,
  }) => {
    const key = `shared-${unique.id()}`;
    const other = await newMember();

    const mine = await member.createBooking({ roomId: room.id, title: 'Mine', attendees: 1, ...slot({ daysAhead: 2 }) }, { idempotencyKey: key });
    const theirs = await other.createBooking({ roomId: room.id, title: 'Theirs', attendees: 1, ...slot({ daysAhead: 3 }) }, { idempotencyKey: key });

    expect(mine.status()).toBe(201);
    expect(theirs.status()).toBe(201);
    expect((await theirs.json()).id).not.toBe((await mine.json()).id);
  });

  for (const [name, key] of [
    ['too short (7 chars)', 'abcdefg'],
    ['too long (65 chars)', 'k'.repeat(65)],
  ] as const) {
    test(`rejects a key that is ${name} @regression`, async ({ member, room }) => {
      const res = await member.createBooking({ roomId: room.id, title: 'Bad key', attendees: 1, ...slot() }, { idempotencyKey: key });
      await expect(res).toFailWith(400, 'INVALID_IDEMPOTENCY_KEY');
    });
  }
});
