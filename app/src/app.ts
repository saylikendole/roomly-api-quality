import express from 'express';
import { errorHandler, notFound } from './errors.js';
import { authRouter } from './routes/auth.js';
import { bookingsRouter } from './routes/bookings.js';
import { roomsRouter } from './routes/rooms.js';
import { resetStore } from './store.js';

export function createApp({ enableTestRoutes = false } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(authRouter);
  app.use(roomsRouter);
  app.use(bookingsRouter);

  // Only mounted when ENABLE_TEST_ROUTES=true, never in a real deployment
  if (enableTestRoutes) {
    app.post('/__test/reset', (_req, res) => {
      resetStore();
      res.status(204).end();
    });
  }

  app.use(() => {
    throw notFound('Route');
  });
  app.use(errorHandler);

  return app;
}
