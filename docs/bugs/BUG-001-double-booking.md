# BUG-001: Two people can book the same room for the same time

| Field | Value |
| --- | --- |
| Severity | High (core business rule broken, data integrity) |
| Priority | P1 |
| Component | `POST /bookings` |
| Found by | `tests/specs/concurrency.spec.ts`, confirmed with `perf/scenarios/contention.ts` |
| Status | Open, documented in the suite with `test.fail()` |

## Summary

When several requests for the same room and time slot arrive at nearly the same moment, more than one of them gets `201 Created`. The overlap rule works for requests that arrive one after another, so ordinary functional tests never see the problem.

## Steps to reproduce

1. Start the API: `npm run start:test`
2. Create 8 members and one room (the fixtures in `tests/fixtures.ts` do this).
3. Send 8 `POST /bookings` requests at the same time, all for the same room, 13:00-14:00 UTC, 5 days ahead.

Or run the automated reproductions:

```bash
npx playwright test tests/specs/concurrency.spec.ts   # 8 parallel requests
npm run start:test & npm run perf:contention          # 20 users x 5 rounds under k6
```

## Expected result

Exactly one request returns `201 Created`. The other seven return `409 BOOKING_CONFLICT`.

## Actual result

Most or all of the requests return `201`. The room ends up with several confirmed bookings for the same hour.

In one k6 contention run (5 rounds, 20 users each), **87 bookings were created where 5 was the correct number**.

```
successful_bookings_for_contested_slot
✗ 'count<=5' count=87
```

## Root cause

`app/src/routes/bookings.ts` checks for a conflict, then waits on the (simulated) database write, and only then saves the booking:

```ts
const conflict = findConflict(store.bookings, room.id, start, end); // 1. check
if (conflict) throw new ApiError(409, 'BOOKING_CONFLICT', ...);
// ...
await dbWrite();                                                     // 2. wait
store.bookings.push(booking);                                        // 3. save
```

Every request that runs step 1 before the first one reaches step 3 sees an empty slot. This is a check-then-act race condition (often called TOCTOU: time of check to time of use).

## Suggested fix

The check and the write need to happen as one atomic step. Options, depending on the storage:

- **Relational database:** an exclusion constraint on `(room_id, tstzrange(start, end))` (PostgreSQL), or `SELECT ... FOR UPDATE` on the room row inside a transaction.
- **In this demo's in-memory store:** a per-room lock around check-and-save, or re-checking for conflicts after the await and before pushing.

## How we'll know it's fixed

The concurrency test is marked `test.fail()`, so it passes while the bug exists. Once a fix lands, that test will start **failing**, which is the signal to remove `test.fail()` and close this bug. The k6 contention threshold (`count<=5`) will also go green, and that scenario can then join the CI gate.
