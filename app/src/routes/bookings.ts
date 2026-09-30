import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { ApiError, notFound } from '../errors.js';
import { assertValidWindow, findConflict, RULES } from '../rules.js';
import { dbWrite, newId, store, type Booking } from '../store.js';
import { createBookingBody } from '../validation.js';

export const bookingsRouter = Router();

bookingsRouter.use('/bookings', requireAuth);

bookingsRouter.post('/bookings', async (req, res) => {
  const user = req.user!;
  const idemKey = req.header('idempotency-key');
  if (idemKey !== undefined && (idemKey.length < 8 || idemKey.length > 64)) {
    throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8-64 characters');
  }

  // A retried request with the same key returns the original booking instead of creating a duplicate
  if (idemKey) {
    const existingId = store.idempotency.get(`${user.id}:${idemKey}`);
    const existing = existingId && store.bookings.find((b) => b.id === existingId);
    if (existing) {
      res.status(200).set('Idempotent-Replay', 'true').json(existing);
      return;
    }
  }

  const body = createBookingBody.parse(req.body);
  const room = store.rooms.find((r) => r.id === body.roomId);
  if (!room) throw notFound('Room');

  const start = new Date(body.start);
  const end = new Date(body.end);
  assertValidWindow(start, end);

  if (body.attendees > room.capacity) {
    throw new ApiError(422, 'OVER_CAPACITY', `${room.name} holds at most ${room.capacity} people`);
  }

  if (user.role === 'member') {
    const upcoming = store.bookings.filter(
      (b) => b.ownerId === user.id && b.status === 'confirmed' && new Date(b.end) > new Date(),
    ).length;
    if (upcoming >= RULES.maxUpcomingBookingsPerMember) {
      throw new ApiError(
        422,
        'BOOKING_LIMIT_REACHED',
        `Members can hold at most ${RULES.maxUpcomingBookingsPerMember} upcoming bookings`,
      );
    }
  }

  const conflict = findConflict(store.bookings, room.id, start, end);
  if (conflict) {
    throw new ApiError(409, 'BOOKING_CONFLICT', 'The room is already booked for part of this time', {
      conflictingWindow: { start: conflict.start, end: conflict.end },
    });
  }

  const booking: Booking = {
    id: newId('b'),
    roomId: room.id,
    ownerId: user.id,
    title: body.title,
    start: start.toISOString(),
    end: end.toISOString(),
    attendees: body.attendees,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };

  await dbWrite();
  store.bookings.push(booking);
  if (idemKey) store.idempotency.set(`${user.id}:${idemKey}`, booking.id);

  res.status(201).location(`/bookings/${booking.id}`).json(booking);
});

bookingsRouter.get('/bookings/me', (req, res) => {
  const mine = store.bookings
    .filter((b) => b.ownerId === req.user!.id)
    .sort((a, b) => a.start.localeCompare(b.start));
  res.json({ items: mine, total: mine.length });
});

/** Non-owners get 404, not 403, so booking IDs can't be probed to learn what exists. */
function findVisibleBooking(id: string, userId: string, isAdmin: boolean): Booking {
  const booking = store.bookings.find((b) => b.id === id);
  if (!booking || (!isAdmin && booking.ownerId !== userId)) throw notFound('Booking');
  return booking;
}

bookingsRouter.get('/bookings/:id', (req, res) => {
  res.json(findVisibleBooking(req.params.id, req.user!.id, req.user!.role === 'admin'));
});

bookingsRouter.delete('/bookings/:id', async (req, res) => {
  const booking = findVisibleBooking(req.params.id, req.user!.id, req.user!.role === 'admin');
  if (booking.status === 'cancelled') {
    throw new ApiError(409, 'ALREADY_CANCELLED', 'This booking is already cancelled');
  }
  if (new Date(booking.start) <= new Date()) {
    throw new ApiError(422, 'ALREADY_STARTED', 'Bookings that have started cannot be cancelled');
  }
  await dbWrite();
  booking.status = 'cancelled';
  res.json(booking);
});
