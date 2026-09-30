import { test, expect } from '../fixtures';
import { slot } from '../support/time';

test.describe('Concurrency', () => {
  /**
   * Known defect, see docs/bugs/BUG-001-double-booking.md
   *
   * test.fail() inverts the result: this test PASSES while the bug exists and
   * starts FAILING the moment someone fixes it. That failure is the reminder
   * to remove the marker and close the bug, so a fix can never go unnoticed
   * and the bug can never silently come back.
   */
  test('simultaneous requests for the same slot produce exactly one booking @regression', async ({ newMember, room }) => {
    test.info().annotations.push({ type: 'issue', description: 'BUG-001: double booking under concurrent requests' });
    test.fail();

    const window = slot({ daysAhead: 5, hour: 13 });
    const members = await Promise.all(Array.from({ length: 8 }, () => newMember()));

    // Fire all requests at once, the way a busy Monday morning would
    const responses = await Promise.all(
      members.map((m, i) => m.createBooking({ roomId: room.id, title: `Racer ${i + 1}`, attendees: 2, ...window })),
    );
    const statuses = responses.map((r) => r.status());

    expect(statuses.filter((s) => s === 201), `statuses: ${statuses.join(', ')}`).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(members.length - 1);
  });

  test('simultaneous requests for DIFFERENT slots all succeed (control test) @regression', async ({ newMember, room }) => {
    const members = await Promise.all(Array.from({ length: 8 }, () => newMember()));

    const responses = await Promise.all(
      members.map((m, i) =>
        m.createBooking({ roomId: room.id, title: `Slot ${i + 1}`, attendees: 2, ...slot({ daysAhead: 5, hour: 8 + i }) }),
      ),
    );

    expect(responses.map((r) => r.status())).toEqual(Array(members.length).fill(201));
  });
});
