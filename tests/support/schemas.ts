import { z } from 'zod';

/**
 * Response contracts. Tests validate every successful response against these,
 * so a renamed field, a changed type or an extra leaked field fails loudly.
 * `.strict()` rejects unknown keys: that's how we'd notice the API starting to
 * return data it shouldn't (for example, a password hash).
 */

const isoUtc = z.iso.datetime(); // no offset allowed, the API always answers in UTC

export const UserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    role: z.enum(['admin', 'member']),
  })
  .strict();

export const LoginResponseSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{48}$/),
    user: UserSchema,
  })
  .strict();

export const RoomSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1),
    capacity: z.int().positive(),
    floor: z.int().nonnegative(),
    equipment: z.array(z.enum(['screen', 'whiteboard', 'video', 'microphone'])),
  })
  .strict();

export const RoomPageSchema = z
  .object({
    items: z.array(RoomSchema),
    total: z.int().nonnegative(),
    limit: z.int().positive(),
    offset: z.int().nonnegative(),
  })
  .strict();

export const BookingSchema = z
  .object({
    id: z.string().startsWith('b-'),
    roomId: z.string(),
    ownerId: z.string(),
    title: z.string(),
    start: isoUtc,
    end: isoUtc,
    attendees: z.int().positive(),
    status: z.enum(['confirmed', 'cancelled']),
    createdAt: isoUtc,
  })
  .strict();

export const BookingListSchema = z
  .object({
    items: z.array(BookingSchema),
    total: z.int().nonnegative(),
  })
  .strict();

export const AvailabilitySchema = z
  .object({
    roomId: z.string(),
    date: z.iso.date(),
    busy: z.array(z.object({ start: isoUtc, end: isoUtc }).strict()),
  })
  .strict();

export const ErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().regex(/^[A-Z_]+$/),
        message: z.string().min(1),
        details: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

export type Room = z.infer<typeof RoomSchema>;
export type Booking = z.infer<typeof BookingSchema>;
export type User = z.infer<typeof UserSchema>;
