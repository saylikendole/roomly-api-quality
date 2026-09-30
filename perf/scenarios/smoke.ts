import { sleep } from 'k6';
import type { Options } from 'k6/options';
import { createTestData, mixedJourney, type TestData } from '../lib/roomly.ts';

/**
 * Smoke: one user for 30 seconds. Answers "does the script work and is the
 * API basically healthy?" before spending time on a bigger run.
 */
export const options: Options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<200'],
    checks: ['rate==1'],
  },
};

export function setup(): TestData {
  return createTestData({ members: 2, rooms: 3 });
}

export default function (data: TestData): void {
  mixedJourney(data);
  sleep(1);
}
