import { randomUUID } from 'node:crypto';

/** Unique values so parallel tests never collide on shared data. */
export const unique = {
  id: () => randomUUID().slice(0, 8),
  email: () => `member.${randomUUID().slice(0, 8)}@roomly.test`,
  roomName: () => `QA Room ${randomUUID().slice(0, 6)}`,
};
