import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const enableTestRoutes = process.env.ENABLE_TEST_ROUTES === 'true';

createApp({ enableTestRoutes }).listen(port, () => {
  console.log(`Roomly API listening on http://localhost:${port}${enableTestRoutes ? ' (test routes enabled)' : ''}`);
});
