import { test, expect } from '../../fixtures';
import { RoomPageSchema, type Room } from '../../support/schemas';

/**
 * These tests read the WHOLE room list, so they need it to stay still while
 * they run. They live in the "catalogue" project, which Playwright runs
 * before any test that creates rooms (see playwright.config.ts). That makes
 * exact assertions on the seeded catalogue safe.
 */
const SEEDED_ROOM_IDS_BY_NAME = ['r-aurora', 'r-boreal', 'r-cirrus', 'r-delta', 'r-ember', 'r-fjord'];

test.describe('Rooms: listing and search', () => {
  test('lists rooms in the documented shape @smoke', async ({ member }) => {
    const res = await member.rooms.list();

    expect(res.status()).toBe(200);
    await expect(res).toMatchSchema(RoomPageSchema);
    const page = await res.json();
    expect(page).toMatchObject({ limit: 20, offset: 0 });
    expect(page.items.length).toBeGreaterThan(0);
  });

  test('rooms come back sorted by name @regression', async ({ member }) => {
    const { items } = await (await member.rooms.list({ limit: 50 })).json();
    const names = items.map((r: Room) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test('the list contains exactly the seeded rooms, in name order @regression', async ({ member }) => {
    const page = await (await member.rooms.list({ limit: 50 })).json();
    expect(page.total).toBe(SEEDED_ROOM_IDS_BY_NAME.length);
    expect(page.items.map((r: Room) => r.id)).toEqual(SEEDED_ROOM_IDS_BY_NAME);
  });

  for (const pageSize of [1, 2, 4]) {
    test(`pagination with page size ${pageSize} returns every room exactly once, in order @regression`, async ({ member }) => {
      const seen: string[] = [];
      for (let offset = 0; offset < SEEDED_ROOM_IDS_BY_NAME.length; offset += pageSize) {
        const page = await (await member.rooms.list({ limit: pageSize, offset })).json();
        expect(page).toMatchObject({ total: SEEDED_ROOM_IDS_BY_NAME.length, limit: pageSize, offset });
        expect(page.items.length).toBeLessThanOrEqual(pageSize);
        seen.push(...page.items.map((r: Room) => r.id));
      }
      // No gaps, no duplicates, same order as the unpaged list
      expect(seen).toEqual(SEEDED_ROOM_IDS_BY_NAME);
    });
  }

  test('an offset past the end returns an empty page, not an error @regression', async ({ member }) => {
    const res = await member.rooms.list({ offset: 10_000 });
    expect(res.status()).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  test('filters by minimum capacity, floor and equipment @regression', async ({ member }) => {
    const byCapacity = (await (await member.rooms.list({ minCapacity: 10, limit: 50 })).json()).items as Room[];
    expect(byCapacity.length).toBeGreaterThan(0);
    expect(byCapacity.every((r) => r.capacity >= 10)).toBe(true);

    const byFloor = (await (await member.rooms.list({ floor: 1, limit: 50 })).json()).items as Room[];
    expect(byFloor.length).toBeGreaterThan(0);
    expect(byFloor.every((r) => r.floor === 1)).toBe(true);

    // Several equipment values mean "has ALL of them", not "has any"
    const byKit = (await (await member.rooms.list({ equipment: 'screen,video', limit: 50 })).json()).items as Room[];
    expect(byKit.length).toBeGreaterThan(0);
    expect(byKit.every((r) => r.equipment.includes('screen') && r.equipment.includes('video'))).toBe(true);
  });

  const badQueries: Array<[string, Record<string, string | number>]> = [
    ['limit below minimum (0)', { limit: 0 }],
    ['limit above maximum (51)', { limit: 51 }],
    ['non-numeric limit', { limit: 'ten' }],
    ['negative offset', { offset: -1 }],
    ['decimal capacity', { minCapacity: 2.5 }],
  ];
  for (const [name, params] of badQueries) {
    test(`rejects ${name} with 400 @regression`, async ({ member }) => {
      await expect(await member.rooms.list(params)).toFailWith(400, 'VALIDATION_ERROR');
    });
  }

  test('limit boundaries 1 and 50 are accepted @regression', async ({ member }) => {
    expect((await member.rooms.list({ limit: 1 })).status()).toBe(200);
    expect((await member.rooms.list({ limit: 50 })).status()).toBe(200);
  });

  test('unknown room id → 404 @regression', async ({ member }) => {
    await expect(await member.rooms.get('r-does-not-exist')).toFailWith(404, 'NOT_FOUND');
  });
});
