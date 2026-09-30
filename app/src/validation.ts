import { z } from 'zod';

export const loginBody = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const createUserBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email(),
  password: z.string().min(8).max(72),
  role: z.enum(['admin', 'member']).default('member'),
});

export const createRoomBody = z.object({
  name: z.string().trim().min(1).max(50),
  capacity: z.int().min(1).max(50),
  floor: z.int().min(0).max(20),
  equipment: z.array(z.enum(['screen', 'whiteboard', 'video', 'microphone'])).max(4).default([]),
});

export const listRoomsQuery = z.object({
  minCapacity: z.coerce.number().int().min(1).optional(),
  floor: z.coerce.number().int().min(0).optional(),
  equipment: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const availabilityQuery = z.object({
  date: z.iso.date(),
});

export const createBookingBody = z.object({
  roomId: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  // Offsets are required so a booking time is never ambiguous
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  attendees: z.int().min(1),
});
