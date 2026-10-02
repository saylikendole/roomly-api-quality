import type { APIRequestContext } from '@playwright/test';
import { AuthApi, type Credentials } from './AuthApi';
import { Session } from './BaseApi';
import { BookingsApi } from './BookingsApi';
import { RoomsApi } from './RoomsApi';
import { UsersApi } from './UsersApi';

/**
 * One actor (anonymous, a member or an admin) with an API object per
 * resource, all sharing that actor's session:
 *
 *   await member.bookings.create({ ... });
 *   await admin.rooms.create({ ... });
 *   await anon.auth.login({ ... });
 *
 * This plays the same role as a page object in UI tests: the specs say what
 * a user does, and the API objects know how the HTTP calls are made.
 */
export class RoomlyApi {
  readonly auth: AuthApi;
  readonly users: UsersApi;
  readonly rooms: RoomsApi;
  readonly bookings: BookingsApi;

  private constructor(
    private readonly request: APIRequestContext,
    private readonly session: Session,
  ) {
    this.auth = new AuthApi(request, session);
    this.users = new UsersApi(request, session);
    this.rooms = new RoomsApi(request, session);
    this.bookings = new BookingsApi(request, session);
  }

  static anonymous(request: APIRequestContext): RoomlyApi {
    return new RoomlyApi(request, new Session());
  }

  static async loggedIn(request: APIRequestContext, creds: Credentials): Promise<RoomlyApi> {
    const api = RoomlyApi.anonymous(request);
    const res = await api.auth.login(creds);
    if (!res.ok()) throw new Error(`Login failed for ${creds.email}: ${res.status()} ${await res.text()}`);
    api.session.token = (await res.json()).token;
    return api;
  }

  /** Same actor shape with an arbitrary token, for forged or expired token tests. */
  withToken(token: string): RoomlyApi {
    const session = new Session();
    session.token = token;
    return new RoomlyApi(this.request, session);
  }
}
