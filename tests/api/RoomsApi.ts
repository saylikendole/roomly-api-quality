import type { APIResponse } from '@playwright/test';
import { BaseApi } from './BaseApi';

export interface NewRoom {
  name: string;
  capacity: number;
  floor: number;
  equipment?: string[];
}

export type RoomQuery = Partial<Record<'minCapacity' | 'floor' | 'equipment' | 'limit' | 'offset', string | number>>;

/** /rooms and /rooms/:id/availability */
export class RoomsApi extends BaseApi {
  list(query: RoomQuery = {}): Promise<APIResponse> {
    return this.request.get('/rooms', { headers: this.headers(), params: query });
  }

  get(id: string): Promise<APIResponse> {
    return this.request.get(`/rooms/${this.segment(id)}`, { headers: this.headers() });
  }

  /** Admin only. Accepts any object so tests can send invalid rooms. */
  create(room: NewRoom | Record<string, unknown>): Promise<APIResponse> {
    return this.request.post('/rooms', { headers: this.headers(), data: room });
  }

  /** Busy windows for one UTC day, date as YYYY-MM-DD. */
  availability(roomId: string, date: string): Promise<APIResponse> {
    return this.request.get(`/rooms/${this.segment(roomId)}/availability`, {
      headers: this.headers(),
      params: { date },
    });
  }
}
