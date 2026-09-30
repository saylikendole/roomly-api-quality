import { randomUUID } from 'node:crypto';
import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface Credentials {
  email: string;
  password: string;
}

export interface NewBooking {
  roomId: string;
  title: string;
  start: string;
  end: string;
  attendees: number;
}

export interface NewRoom {
  name: string;
  capacity: number;
  floor: number;
  equipment?: string[];
}

/**
 * Thin, typed wrapper over Playwright's APIRequestContext.
 * It returns the raw APIResponse on purpose: tests decide what a status code
 * means. Hiding failures inside the client makes negative tests impossible.
 */
export class RoomlyClient {
  private token?: string;

  constructor(private readonly request: APIRequestContext) {}

  static async loggedIn(request: APIRequestContext, creds: Credentials): Promise<RoomlyClient> {
    const client = new RoomlyClient(request);
    const res = await client.login(creds);
    if (!res.ok()) throw new Error(`Login failed for ${creds.email}: ${res.status()} ${await res.text()}`);
    client.token = (await res.json()).token;
    return client;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...extra };
  }

  withToken(token: string): RoomlyClient {
    const c = new RoomlyClient(this.request);
    c.token = token;
    return c;
  }

  login(creds: Credentials | Record<string, unknown>): Promise<APIResponse> {
    return this.request.post('/auth/login', { data: creds });
  }

  createUser(user: { name: string; email: string; password: string; role?: 'admin' | 'member' }) {
    return this.request.post('/users', { headers: this.headers(), data: user });
  }

  listRooms(params: Record<string, string | number> = {}) {
    return this.request.get('/rooms', { headers: this.headers(), params });
  }

  getRoom(id: string) {
    return this.request.get(`/rooms/${encodeURIComponent(id)}`, { headers: this.headers() });
  }

  createRoom(room: NewRoom | Record<string, unknown>) {
    return this.request.post('/rooms', { headers: this.headers(), data: room });
  }

  availability(roomId: string, date: string) {
    return this.request.get(`/rooms/${encodeURIComponent(roomId)}/availability`, {
      headers: this.headers(),
      params: { date },
    });
  }

  createBooking(booking: NewBooking | Record<string, unknown>, opts: { idempotencyKey?: string } = {}) {
    const extra: Record<string, string> = opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {};
    return this.request.post('/bookings', { headers: this.headers(extra), data: booking });
  }

  myBookings() {
    return this.request.get('/bookings/me', { headers: this.headers() });
  }

  getBooking(id: string) {
    return this.request.get(`/bookings/${encodeURIComponent(id)}`, { headers: this.headers() });
  }

  cancelBooking(id: string) {
    return this.request.delete(`/bookings/${encodeURIComponent(id)}`, { headers: this.headers() });
  }
}

/** Unique values so parallel tests never collide on shared data. */
export const unique = {
  id: () => randomUUID().slice(0, 8),
  email: () => `member.${randomUUID().slice(0, 8)}@roomly.test`,
  roomName: () => `QA Room ${randomUUID().slice(0, 6)}`,
};
