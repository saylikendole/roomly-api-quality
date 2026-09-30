import { sleep } from 'k6';
import type { Options } from 'k6/options';
import { createTestData, mixedJourney, type TestData } from '../lib/roomly.ts';

/**
 * Stress: keep adding users past the expected peak to find where response
 * times start to degrade. Thresholds here are looser: the goal is to find
 * the breaking point, and to stop early (abortOnFail) once errors pile up.
 */
export const options: Options = {
  scenarios: {
    beyond_peak: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '1m', target: 150 },
        { duration: '1m', target: 300 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }],
    http_req_duration: ['p(95)<1500'],
  },
};

export function setup(): TestData {
  return createTestData({ members: 100, rooms: 20 });
}

export default function (data: TestData): void {
  mixedJourney(data);
  sleep(0.2);
}
