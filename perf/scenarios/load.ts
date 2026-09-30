import { sleep } from 'k6';
import type { Options } from 'k6/options';
import { createTestData, mixedJourney, type TestData } from '../lib/roomly.ts';

/**
 * Load: expected peak traffic. 30 concurrent users for 2 minutes, with a
 * ramp up and down. Thresholds are the service-level objectives: if any is
 * broken, k6 exits non-zero and the CI job fails.
 */
export const options: Options = {
  scenarios: {
    office_peak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 30 }, // ramp up
        { duration: '2m', target: 30 }, // steady peak
        { duration: '15s', target: 0 }, // ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // under 1% errors (409 conflicts are expected, not errors)
    http_req_duration: ['p(95)<300', 'p(99)<800'],
    'http_req_duration{name:create_booking}': ['p(95)<400'], // writes may be a little slower
    'http_req_duration{name:availability}': ['p(95)<250'],
    checks: ['rate>0.99'],
  },
};

export function setup(): TestData {
  return createTestData({ members: 30, rooms: 10 });
}

export default function (data: TestData): void {
  mixedJourney(data);
  sleep(Math.random() * 2 + 0.5); // think time between actions
}
