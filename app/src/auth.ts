import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errors.js';
import { store, type Role, type User } from './store.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  const userId = scheme === 'Bearer' && token ? store.tokens.get(token) : undefined;
  const user = userId ? store.users.find((u) => u.id === userId) : undefined;
  if (!user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'A valid bearer token is required');
  }
  req.user = user;
  next();
}

export const requireRole =
  (role: Role) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      throw new ApiError(403, 'FORBIDDEN', `This action requires the ${role} role`);
    }
    next();
  };
