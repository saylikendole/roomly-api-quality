import { test, expect } from '../fixtures';
import { unique } from '../support/roomly-client';
import { RoomPageSchema, RoomSchema, type Room } from '../support/schemas';

test.describe('Rooms: listing and search', () => {
  test('lists rooms in the documented shape @smoke', async ({ member }) => {
    const res = await member.listRooms();

    expect(res.status()).toBe(200);
    await expect(res).toMatchSchema(RoomPageSchema);
    const page = await res.json();
    expect(page).toMatchObject({ limit: 20, offset: 0 });
    expect(page.items.length).toBeGreaterThan(0);
  });

  test('rooms come back sorted by name @regression', async ({ member }) => {
    const { items } = await (await member.listRooms({ limit: 50 })).json();
    const names = items.map((r: Room) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test('pagination walks the full list with no gaps or duplicates @regression', async ({ member }) => {
    const { total } = await (await member.listRooms({ limit: 50 })).json();
    const seen: string[] = [];
    for (let offset = 0; offset < total; offset += 2) {
      const page = await (await member.listRooms({ limit: 2, offset })).json();
      expect(page.total).toBe(total);
      seen.push(...page.items.map((r: Room) => r.id));
    }
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });

  test('an offset past the end returns an empty page, not an error @regression', async ({ member }) => {
    const res = await member.listRooms({ offset: 10_000 });
    expect(res.status()).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  test('filters by minimum capacity, floor and equipment @regression', async ({ member }) => {
    const byCapacity = (await (await member.listRooms({ minCapacity: 10, limit: 50 })).json()).items as Room[];
    expect(byCapacity.length).toBeGreaterThan(0);
    expect(byCapacity.every((r) => r.capacity >= 10)).toBe(true);

    const byFloor = (await (await member.listRooms({ floor: 1, limit: 50 })).json()).items as Room[];
    expect(byFloor.length).toBeGreaterThan(0);
    expect(byFloor.every((r) => r.floor === 1)).toBe(true);

    // Several equipment values mean "has ALL of them", not "has any"
    const byKit = (await (await member.listRooms({ equipment: 'screen,video', limit: 50 })).json()).items as Room[];
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
      await expect(await member.listRooms(params)).toFailWith(400, 'VALIDATION_ERROR');
    });
  }

  test('limit boundaries 1 and 50 are accepted @regression', async ({ member }) => {
    expect((await member.listRooms({ limit: 1 })).status()).toBe(200);
    expect((await member.listRooms({ limit: 50 })).status()).toBe(200);
  });

  test('unknown room id → 404 @regression', async ({ member }) => {
    await expect(await member.getRoom('r-does-not-exist')).toFailWith(404, 'NOT_FOUND');
  });
});

test.describe('Rooms: administration', () => {
  test('an admin can create a room and it can be fetched afterwards @smoke', async ({ admin }) => {
    const created = await admin.createRoom({ name: unique.roomName(), capacity: 6, floor: 2, equipment: ['whiteboard'] });
    expect(created.status()).toBe(201);
    await expect(created).toMatchSchema(RoomSchema);

    const room = await created.json();
    const fetched = await admin.getRoom(room.id);
    expect(await fetched.json()).toEqual(room);
  });

  test('a member cannot create rooms @security', async ({ member }) => {
    const res = await member.createRoom({ name: unique.roomName(), capacity: 4, floor: 1 });
    await expect(res).toFailWith(403, 'FORBIDDEN');
  });

  // Boundary value analysis on capacity: valid range is 1-50
  for (const [capacity, expected] of [
    [0, 400],
    [1, 201],
    [50, 201],
    [51, 400],
  ] as const) {
    test(`capacity ${capacity} → ${expected} @regression`, async ({ admin }) => {
      const res = await admin.createRoom({ name: unique.roomName(), capacity, floor: 1 });
      expect(res.status()).toBe(expected);
    });
  }

  test('rejects equipment outside the allowed list @regression', async ({ admin }) => {
    const res = await admin.createRoom({ name: unique.roomName(), capacity: 4, floor: 1, equipment: ['coffee machine'] });
    await expect(res).toFailWith(400, 'VALIDATION_ERROR');
  });
});
