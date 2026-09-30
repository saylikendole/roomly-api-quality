# Roomly API quality suite

[![CI](https://github.com/saylikendole/roomly-api-quality/actions/workflows/ci.yml/badge.svg)](https://github.com/saylikendole/roomly-api-quality/actions/workflows/ci.yml)
![Playwright](https://img.shields.io/badge/Playwright-API%20testing-2EAD33?logo=playwright)
![k6](https://img.shields.io/badge/k6-performance-7D64FF?logo=k6)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)

API and performance tests for **Roomly**, a small meeting-room booking REST API. The API ships inside this repo so the suite always has a real, controllable system to test, and so the load tests hit something I own instead of a free public API.

100 API tests run in about 8 seconds. They found a double-booking race condition that sequential tests can't see, documented in [BUG-001](docs/bugs/BUG-001-double-booking.md).

## Quick start

Requires Node 20+. [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) is only needed for the performance tests.

```bash
npm install
npm test               # starts the API automatically and runs all API tests
npm run report         # opens the HTML report
```

No browser download is needed. These are pure API tests.

```bash
npm run test:smoke        # 8 critical-path tests
npm run test:security     # OWASP-style checks

npm run start:test        # in a second terminal: start the API
npm run perf:smoke        # 1 user, 30 s
npm run perf:load         # 30 users, office peak
npm run perf:stress       # ramp until it breaks
npm run perf:contention   # reproduces BUG-001 under load
```

## What's tested

| Area | Examples | Spec |
| --- | --- | --- |
| Authentication | Login contract, no account enumeration, bad and forged tokens | `auth.spec.ts` |
| Rooms | Pagination with no gaps or duplicates, filters, capacity boundaries, admin-only creation | `rooms.spec.ts` |
| Creating bookings | Duration and slot boundaries, timezone normalisation, booking horizon, 5-booking limit, field-level validation errors | `bookings-create.spec.ts` |
| Overlap rules | Decision table for every way two time windows can relate, cross-timezone clashes, availability without leaking titles | `bookings-overlap.spec.ts` |
| Viewing and cancelling | Owner-only access (404, not 403), admin override, double cancel | `bookings-manage.spec.ts` |
| Idempotency | Safe retries with `Idempotency-Key`, keys scoped per user | `idempotency.spec.ts` |
| Security sanity | Headers, 413 on large bodies, no stack traces, injection-style IDs, privilege escalation, password never returned | `security.spec.ts` |
| Concurrency | 8 simultaneous requests for one slot (BUG-001), plus a control test | `concurrency.spec.ts` |

The reasoning behind what's covered, and what isn't, is in [docs/TEST-STRATEGY.md](docs/TEST-STRATEGY.md).

## The bug this suite found

Book a slot, then book the same slot again: you get `409 Conflict`, as you should. Every sequential test passes.

Send 8 requests for the same slot **at the same moment**, and several of them get `201 Created`. Under k6 (20 users, 5 rounds) the API created 87 bookings where 5 was correct. The cause is a check-then-act race in `POST /bookings`.

The test for it is marked `test.fail()`. It passes while the bug exists and fails as soon as someone fixes it, which is the prompt to remove the marker and close the bug. Full write-up, root cause and suggested fixes: [BUG-001](docs/bugs/BUG-001-double-booking.md).

## Design decisions

**Every test creates its own member and room.** Fixtures in `tests/fixtures.ts` set up fresh data per test, so tests run in parallel and in any order without sharing state. There's no "run the create test before the delete test" coupling.

**The API client doesn't assert.** `RoomlyClient` returns the raw response and the test decides what the status code means. A client that throws on non-2xx would make negative testing awkward.

**Contracts are strict.** Responses are validated with zod schemas that reject unknown fields. If the API ever starts returning something extra, like an owner's email in the availability endpoint, a test fails.

**Assertions check the error code, not just the status.** `expect(res).toFailWith(422, 'OVER_CAPACITY')` tells the reader exactly which rule is being tested, and fails if a request is rejected for the wrong reason.

**No retries.** In an API suite, a test that only passes on retry is usually a race condition. I'd rather it fail and get looked at.

**Dates are relative.** `slot({ daysAhead: 2, hour: 10 })` always produces a valid future window, so the suite behaves the same whenever it runs.

**409 isn't an error in load tests.** When lots of people book at once, some get "slot taken". That's the API working correctly, so k6 treats 409 as an expected status and only real failures count against the error-rate threshold.

## Performance results

Local run of `perf:load` (30 users for 2 minutes, realistic 70/20/10 browse/book/check mix):

| Threshold | Target | Result |
| --- | --- | --- |
| p95 response time | < 300 ms | 31 ms |
| p99 response time | < 800 ms | 35 ms |
| p95 create booking | < 400 ms | 35 ms |
| Error rate | < 1% | 0% |

These numbers are for an in-memory store on a laptop, so they say more about the test setup than about real-world capacity. CI runs smoke and load on every push and uploads the k6 HTML dashboard as an artifact.

## Project structure

```
app/src/                  the system under test (Express + TypeScript)
  routes/                 auth, rooms, bookings
  rules.ts                booking rules: slots, durations, overlap
tests/
  fixtures.ts             per-test data setup + custom matchers
  support/
    roomly-client.ts      typed API client
    schemas.ts            zod response contracts
    time.ts               date helpers
  specs/                  the tests
perf/
  lib/roomly.ts           shared k6 setup and user journeys
  scenarios/              smoke, load, stress, contention
docs/
  TEST-STRATEGY.md
  bugs/BUG-001-double-booking.md
.github/workflows/ci.yml  type check → API tests → k6 smoke + load
```

## CI

GitHub Actions on every push and pull request:

1. Type check the app, the tests and the k6 scripts
2. Run the API tests (report and JUnit XML uploaded as artifacts)
3. Start the API, then run k6 smoke and load. A broken threshold fails the build.

Stress and contention runs can be triggered manually from the Actions tab.

## About the API

Roomly is a demo API I built to have something realistic to test: token auth with two roles, rooms, bookings with overlap rules, availability, idempotency keys and a consistent error format. It uses an in-memory store so the project has no external dependencies. `/__test/reset` exists only when `ENABLE_TEST_ROUTES=true`.

Seeded accounts: `ada@roomly.test` / `Admin#2026` (admin), `ben@roomly.test` / `Member#2026` (member).

---

Sayli Kendole · Senior QA / Test Automation Engineer
