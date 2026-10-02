import type { APIResponse } from '@playwright/test';
import { BaseApi } from './BaseApi';

export interface Credentials {
  email: string;
  password: string;
}

/** POST /auth/login */
export class AuthApi extends BaseApi {
  /** Accepts any object so tests can send deliberately broken bodies. */
  login(creds: Credentials | Record<string, unknown>): Promise<APIResponse> {
    return this.request.post('/auth/login', { data: creds });
  }
}
