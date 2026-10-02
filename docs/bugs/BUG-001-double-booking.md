# BUG-001: Two people could book the same room for the same time

| Field | Value |
| --- | --- |
| Severity | High (core business rule broken, data integrity) |
| Priority | P1 |
| Component | `POST /bookings` |
| Found by | `tests/specs/concurrency.spec.ts`, confirmed with `perf/scenarios/contention.ts` |
| Status | **Fixed**, guarded by regression tests in both suites |

## Summary

When several requests for the same room and time slot arrived at nearly the same moment, more than one of them got `201 Created`. The overlap rule worked for requests that arrived one after another, so the ordinary functional tests never saw the problem.

## Steps to reproduce (before the fix)

1. Start the API: `npm run start:test`
2. Create 8 members and one room.
3. Send 8 `POST /bookings` requests at the same time, all for the same room and the same hour.

## Expected result

Exactly one request returns `201 Created`. The other seven return `409 BOOKING_CONFLICT`.

## Actual result (before the fix)

Most or all of the requests returned `201`, and the room ended up with several confirmed bookings for the same hour.

In a k6 contention run (5 rounds of 20 users), the API created **87 bookings where 5 was correct**:

```
successful_bookings_for_contested_slot
✗ 'count<=5' count=87
```

## Root cause

`POST /bookings` checked for a conflict, then waited on the database write, and only then saved the booking:

```ts
const conflict = findConflict(store.bookings, room.id, start, end); // 1. check
if (conflict) throw new ApiError(409, 'BOOKING_CONFLICT', ...);
await dbWrite();                                                     // 2. wait
store.bookings.push(booking);                                        // 3. save
```

Every request that ran step 1 before the first one reached step 3 saw an empty slot. This is a check-then-act race condition, often called TOCTOU (time of check to time of use).

### Related races found during the fix

The same pattern also affected two other rules:

- **The 5-booking limit per member.** One member sending 8 bookings in parallel (to different rooms) got all 8.
- **Idempotency keys.** Three parallel retries with the same key could create more than one booking.

## Fix

`app/src/locks.ts` adds a small keyed lock. `POST /bookings` now does its read-check-write work inside two locks: one for the room and one for the user.

- The **room lock** makes "is the slot free?" and "save the booking" one atomic step for that room.
- The **user lock** does the same for the 5-booking limit and idempotent retries.
- Bookings for different rooms by different users still run in parallel. Locks are always taken in sorted order, so two requests can't deadlock each other.

With a real database, the same job would be done by a transaction using `SELECT ... FOR UPDATE`, or by a PostgreSQL exclusion constraint on `(room_id, tstzrange(start, end))`.

## Verification

| Check | Before | After |
| --- | --- | --- |
| 8 parallel requests, same slot | several `201` | exactly one `201`, seven `409` |
| k6 contention, 5 rounds × 20 users | 87 bookings | 5 bookings |
| One member, 8 parallel bookings | 8 created | 5 created, 3 rejected |
| 3 parallel retries, same idempotency key | duplicates possible | one booking |
| k6 load p95 | 31 ms | 31 ms (no slowdown) |

To make sure the new tests really catch the bug, I ran them against the old code: all three race tests failed. With the fix they pass, including 10 repeated runs in a row.

## Regression protection

- `tests/specs/concurrency.spec.ts` runs on every push. It includes a control test showing that bookings for **different** slots still succeed in parallel, so the fix doesn't simply serialise everything.
- `perf/scenarios/contention.ts` runs in CI with the threshold `count==5`. More means double booking is back. Fewer means requests are failing.
