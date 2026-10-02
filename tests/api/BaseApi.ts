import type { APIRequestContext } from '@playwright/test';

/**
 * Who is calling the API. Shared by every API object that belongs to one
 * actor, so logging in once authenticates all of them.
 */
export class Session {
  token?: string;
}

/**
 * Base class for the API object model: the API-testing version of the Page
 * Object Model. Each subclass wraps one resource (auth, users, rooms,
 * bookings) the way a page object wraps one page, so tests describe intent
 * (`bookings.create(...)`) and never build URLs or headers themselves.
 *
 * Methods return the raw APIResponse on purpose: the test decides what a
 * status code means. An API object that threw on non-2xx would make
 * negative testing impossible.
 */
export abstract class BaseApi {
  constructor(
    protected readonly request: APIRequestContext,
    protected readonly session: Session,
  ) {}

  protected headers(extra: Record<string, string> = {}): Record<string, string> {
    return { ...(this.session.token ? { Authorization: `Bearer ${this.session.token}` } : {}), ...extra };
  }

  /** Encodes a path segment, so injection-style IDs in security tests reach the API exactly as written. */
  protected segment(value: string): string {
    return encodeURIComponent(value);
  }
}
