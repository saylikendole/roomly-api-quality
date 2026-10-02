# Test strategy

This is the thinking behind the suite: what's tested, at which level, and what's deliberately left out.

## What matters most in a room booking API

Ranked by the damage a bug would do:

1. **No double bookings.** If two teams turn up to the same room, users stop trusting the tool.
2. **People only see and change their own bookings.** Meeting titles can be sensitive.
3. **Time is handled correctly.** Timezones, slot boundaries and "back-to-back is fine" are where booking systems usually break.
4. **Clear errors.** A client app needs a stable error code to show the right message.
5. **Performance at office peak.** Monday 9 am is when everyone books at once.

Test effort follows that order.

## Levels

| Level | Tool | What it covers | Where |
| --- | --- | --- | --- |
| API functional | Playwright `request` | Business rules, validation, permissions, contracts | `tests/specs` |
| API security sanity | Playwright `request` | Auth, object-level access, headers, injection-style input | `tests/specs/security.spec.ts` |
| Concurrency | Playwright + `Promise.all` | Race conditions on shared resources | `tests/specs/concurrency.spec.ts` |
| Performance | k6 | Latency and errors under realistic and extreme load | `perf/scenarios` |

There is no UI in this project on purpose. Most booking rules live in the API, and testing them there is faster and more precise than going through a browser. My [Gigbox E2E suite](https://github.com/saylikendole/gigbox-e2e) covers the browser side.

## Test design techniques used

- **Boundary value analysis:** duration (15/240/255 min), capacity (0/1/50/51), page size (0/1/50/51), title length (100/101), booking horizon (89/91 days).
- **Decision table:** the overlap rules in `bookings-overlap.spec.ts`. Every way two time windows can relate is listed, with the expected result for each.
- **Equivalence partitioning:** invalid request bodies grouped by type of mistake (missing field, wrong type, out of range) with one representative each.
- **Negative and permission testing:** every "should not be allowed" rule has a test, and it checks the exact error code, not just "some 4xx".
- **Contract testing:** every successful response is validated against a strict zod schema. Strict mode means an unexpected new field fails the test, which is how a leaked `password` or `ownerEmail` would get caught.

## Structure

Tests never build URLs or headers. They go through an API object model in `tests/api/`, the API equivalent of the Page Object Model: one class per resource, grouped per actor (anonymous, member, admin). Endpoint changes are fixed in one place, and specs read as business behaviour.

## Isolation and flakiness

- Every test creates its own member and its own room through fixtures. Tests never share bookings, so they run fully in parallel and in any order.
- Dates are generated relative to today at fixed UTC times, so results don't depend on when the suite runs.
- **Retries are off.** On an API suite, a test that passes on the second try is hiding a problem (often a race condition), and I'd rather see it.

## Known bugs

Known bugs stay in the suite, marked with `test.fail()` and linked to a bug report. The suite stays green, the bug stays visible, and a fix is detected automatically. See [BUG-001](bugs/BUG-001-double-booking.md).

## Performance approach

| Scenario | Purpose | Load | Gate |
| --- | --- | --- | --- |
| Smoke | Script and system work at all | 1 user, 30 s | Every push |
| Load | Expected office peak | 30 users, ~3 min | Every push |
| Stress | Find the breaking point | up to 300 req/s | Manual |
| Contention | Correctness under simultaneous writes | 20 users, same slot | Manual until BUG-001 is fixed |

Traffic in load and stress tests follows a realistic mix: 70% browsing, 20% booking and cancelling, 10% checking "my bookings". Thresholds act as service-level objectives: p95 under 300 ms, p99 under 800 ms, under 1% errors. A `409 Conflict` counts as a correct answer, not an error.

## Out of scope (and what I'd add next)

- **Rate limiting and brute-force protection** on login: needs an API change first.
- **Token expiry:** tokens don't expire in this demo.
- **Soak testing** (hours at steady load) to find memory leaks. Not worth it against an in-memory store.
- **Consumer-driven contracts** (for example Pact) if a real frontend team consumed this API.
