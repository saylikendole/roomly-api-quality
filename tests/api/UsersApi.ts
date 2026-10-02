import type { APIResponse } from '@playwright/test';
import { BaseApi } from './BaseApi';

export interface NewUser {
  name: string;
  email: string;
  password: string;
  role?: 'admin' | 'member';
}

/** POST /users (admin only) */
export class UsersApi extends BaseApi {
  create(user: NewUser): Promise<APIResponse> {
    return this.request.post('/users', { headers: this.headers(), data: user });
  }
}
