import { randomUUID } from 'node:crypto';

export type Role = 'admin' | 'member';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // Plain text is fine for a demo app. Never do this in production.
  role: Role;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  floor: number;
  equipment: string[];
}

export type BookingStatus = 'confirmed' | 'cancelled';

export interface Booking {
  id: string;
  roomId: string;
  ownerId: string;
  title: string;
  start: string; // ISO 8601, UTC
  end: string; // ISO 8601, UTC
  attendees: number;
  status: BookingStatus;
  createdAt: string;
}

export interface Store {
  users: User[];
  rooms: Room[];
  bookings: Booking[];
  tokens: Map<string, string>; // token -> userId
  idempotency: Map<string, string>; // `${userId}:${key}` -> bookingId
}

const seedUsers = (): User[] => [
  { id: 'u-admin', name: 'Ada Admin', email: 'ada@roomly.test', password: 'Admin#2026', role: 'admin' },
  { id: 'u-ben', name: 'Ben Member', email: 'ben@roomly.test', password: 'Member#2026', role: 'member' },
  { id: 'u-cleo', name: 'Cleo Member', email: 'cleo@roomly.test', password: 'Member#2026', role: 'member' },
];

const seedRooms = (): Room[] => [
  { id: 'r-aurora', name: 'Aurora', capacity: 4, floor: 1, equipment: ['screen'] },
  { id: 'r-boreal', name: 'Boreal', capacity: 8, floor: 1, equipment: ['screen', 'whiteboard'] },
  { id: 'r-cirrus', name: 'Cirrus', capacity: 12, floor: 2, equipment: ['screen', 'video', 'whiteboard'] },
  { id: 'r-delta', name: 'Delta', capacity: 2, floor: 2, equipment: [] },
  { id: 'r-ember', name: 'Ember', capacity: 20, floor: 3, equipment: ['screen', 'video', 'microphone'] },
  { id: 'r-fjord', name: 'Fjord', capacity: 6, floor: 3, equipment: ['whiteboard'] },
];

export const store: Store = {
  users: seedUsers(),
  rooms: seedRooms(),
  bookings: [],
  tokens: new Map(),
  idempotency: new Map(),
};

export function resetStore(): void {
  store.users = seedUsers();
  store.rooms = seedRooms();
  store.bookings = [];
  store.tokens.clear();
  store.idempotency.clear();
}

export const newId = (prefix: string): string => `${prefix}-${randomUUID()}`;

/**
 * Stands in for a round trip to a real database. Keeps the app free of
 * external dependencies while giving it realistic async behaviour.
 */
export const dbWrite = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 20));
