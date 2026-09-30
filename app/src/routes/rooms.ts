import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { notFound } from '../errors.js';
import { newId, store } from '../store.js';
import { availabilityQuery, createRoomBody, listRoomsQuery } from '../validation.js';

export const roomsRouter = Router();

roomsRouter.use('/rooms', requireAuth);

roomsRouter.get('/rooms', (req, res) => {
  const q = listRoomsQuery.parse(req.query);
  const filtered = store.rooms
    .filter((r) => q.minCapacity === undefined || r.capacity >= q.minCapacity)
    .filter((r) => q.floor === undefined || r.floor === q.floor)
    .filter((r) => q.equipment.every((e) => r.equipment.includes(e)))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({
    items: filtered.slice(q.offset, q.offset + q.limit),
    total: filtered.length,
    limit: q.limit,
    offset: q.offset,
  });
});

roomsRouter.get('/rooms/:id', (req, res) => {
  const room = store.rooms.find((r) => r.id === req.params.id);
  if (!room) throw notFound('Room');
  res.json(room);
});

roomsRouter.post('/rooms', requireRole('admin'), (req, res) => {
  const body = createRoomBody.parse(req.body);
  const room = { id: newId('r'), ...body };
  store.rooms.push(room);
  res.status(201).json(room);
});

/** Busy windows for one UTC day. Titles and owners are left out on purpose: other people's meetings are private. */
roomsRouter.get('/rooms/:id/availability', (req, res) => {
  const room = store.rooms.find((r) => r.id === req.params.id);
  if (!room) throw notFound('Room');
  const { date } = availabilityQuery.parse(req.query);
  const dayStart = new Date(`${date}T00:00:00.000Z`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const busy = store.bookings
    .filter((b) => b.roomId === room.id && b.status === 'confirmed')
    .filter((b) => new Date(b.start).getTime() < dayEnd && new Date(b.end).getTime() > dayStart)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((b) => ({ start: b.start, end: b.end }));
  res.json({ roomId: room.id, date, busy });
});
