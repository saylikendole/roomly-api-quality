import { test, expect } from '../fixtures';
import { unique } from '../support/unique';
import { RoomSchema } from '../support/schemas';

test.describe('Rooms: administration', () => {
  test('an admin can create a room and it can be fetched afterwards @smoke', async ({ admin }) => {
    const created = await admin.rooms.create({ name: unique.roomName(), capacity: 6, floor: 2, equipment: ['whiteboard'] });
    expect(created.status()).toBe(201);
    await expect(created).toMatchSchema(RoomSchema);

    const room = await created.json();
    const fetched = await admin.rooms.get(room.id);
    expect(await fetched.json()).toEqual(room);
  });

  test('a member cannot create rooms @security', async ({ member }) => {
    const res = await member.rooms.create({ name: unique.roomName(), capacity: 4, floor: 1 });
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
      const res = await admin.rooms.create({ name: unique.roomName(), capacity, floor: 1 });
      expect(res.status()).toBe(expected);
    });
  }

  test('rejects equipment outside the allowed list @regression', async ({ admin }) => {
    const res = await admin.rooms.create({ name: unique.roomName(), capacity: 4, floor: 1, equipment: ['coffee machine'] });
    await expect(res).toFailWith(400, 'VALIDATION_ERROR');
  });
});
