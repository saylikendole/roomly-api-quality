import type { APIResponse } from '@playwright/test';
import { BaseApi } from './BaseApi';

export interface NewBooking {
  roomId: string;
  title: string;
  start: string;
  end: string;
  attendees: number;
}

/** /bookings, /bookings/me and /bookings/:id */
export class BookingsApi extends BaseApi {
  /** Accepts any object so tests can send invalid bookings. */
  create(booking: NewBooking | Record<string, unknown>, opts: { idempotencyKey?: string } = {}): Promise<APIResponse> {
    const extra: Record<string, string> = opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {};
    return this.request.post('/bookings', { headers: this.headers(extra), data: booking });
  }

  /** The caller's own bookings, sorted by start time. */
  mine(): Promise<APIResponse> {
    return this.request.get('/bookings/me', { headers: this.headers() });
  }

  get(id: string): Promise<APIResponse> {
    return this.request.get(`/bookings/${this.segment(id)}`, { headers: this.headers() });
  }

  cancel(id: string): Promise<APIResponse> {
    return this.request.delete(`/bookings/${this.segment(id)}`, { headers: this.headers() });
  }
}
