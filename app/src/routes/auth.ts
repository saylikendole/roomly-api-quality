import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { ApiError } from '../errors.js';
import { newId, store } from '../store.js';
import { createUserBody, loginBody } from '../validation.js';

export const authRouter = Router();

authRouter.post('/auth/login', (req, res) => {
  const { email, password } = loginBody.parse(req.body);
  const user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  // Same response for unknown email and wrong password, so accounts can't be enumerated
  if (!user || user.password !== password) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  const token = randomBytes(24).toString('hex');
  store.tokens.set(token, user.id);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

authRouter.post('/users', requireAuth, requireRole('admin'), (req, res) => {
  const body = createUserBody.parse(req.body);
  if (store.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase())) {
    throw new ApiError(409, 'EMAIL_TAKEN', 'A user with this email already exists');
  }
  const user = { id: newId('u'), ...body };
  store.users.push(user);
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});
