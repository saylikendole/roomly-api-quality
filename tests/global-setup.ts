import { request, type FullConfig } from '@playwright/test';

/** Starts every run from the seeded state, even when reusing a server that's been used before. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0].use.baseURL;
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post('/__test/reset');
  if (res.status() !== 204) {
    throw new Error(`Could not reset test data (${res.status()}). Is the API running with ENABLE_TEST_ROUTES=true?`);
  }
  await ctx.dispose();
}
