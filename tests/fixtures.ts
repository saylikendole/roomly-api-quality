import { test as base, expect as baseExpect, type APIResponse } from '@playwright/test';
import type { z } from 'zod';
import { RoomlyApi } from './api/RoomlyApi';
import { unique } from './support/unique';
import { ErrorSchema, RoomSchema, type Room } from './support/schemas';

export const SEEDED = {
  admin: { email: 'ada@roomly.test', password: 'Admin#2026' },
  member: { email: 'ben@roomly.test', password: 'Member#2026' },
} as const;

type Fixtures = {
  /** Unauthenticated client */
  anon: RoomlyApi;
  /** Logged-in admin (seeded account) */
  admin: RoomlyApi;
  /** A brand-new member created for this test only */
  member: RoomlyApi;
  /** Factory for extra fresh members, e.g. for permission or concurrency tests */
  newMember: () => Promise<RoomlyApi>;
  /** A fresh 8-person room created for this test only */
  room: Room;
};

/**
 * Test isolation strategy: every test gets its own member and its own room.
 * Tests can run fully in parallel against one server without stepping on
 * each other's bookings, and no test depends on another having run first.
 */
export const test = base.extend<Fixtures>({
  anon: async ({ request }, use) => {
    await use(RoomlyApi.anonymous(request));
  },

  admin: async ({ request }, use) => {
    await use(await RoomlyApi.loggedIn(request, SEEDED.admin));
  },

  newMember: async ({ request, admin }, use) => {
    await use(async () => {
      const creds = { email: unique.email(), password: 'Str0ng#Pass' };
      const res = await admin.users.create({ name: 'Test Member', ...creds });
      baseExpect(res.status(), await res.text()).toBe(201);
      return RoomlyApi.loggedIn(request, creds);
    });
  },

  member: async ({ newMember }, use) => {
    await use(await newMember());
  },

  room: async ({ admin }, use) => {
    const res = await admin.rooms.create({ name: unique.roomName(), capacity: 8, floor: 4, equipment: ['screen'] });
    baseExpect(res.status(), await res.text()).toBe(201);
    await use(RoomSchema.parse(await res.json()));
  },
});

/** Custom matchers keep assertions readable and failure messages useful. */
export const expect = baseExpect.extend({
  async toMatchSchema(response: APIResponse, schema: z.ZodType) {
    const body = await response.json().catch(() => undefined);
    const result = schema.safeParse(body);
    return {
      pass: result.success,
      name: 'toMatchSchema',
      message: () =>
        result.success
          ? 'Expected response NOT to match the schema, but it did'
          : `Response does not match the contract:\n${result.error.issues
              .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
              .join('\n')}\n\nBody:\n${JSON.stringify(body, null, 2)}`,
    };
  },

  async toFailWith(response: APIResponse, status: number, code: string) {
    const body = await response.json().catch(() => undefined);
    const parsed = ErrorSchema.safeParse(body);
    const pass = response.status() === status && parsed.success && parsed.data.error.code === code;
    return {
      pass,
      name: 'toFailWith',
      message: () =>
        `Expected ${status} ${code}, got ${response.status()} ${
          parsed.success ? parsed.data.error.code : '(body is not a valid error object)'
        }\n\nBody:\n${JSON.stringify(body, null, 2)}`,
    };
  },
});
