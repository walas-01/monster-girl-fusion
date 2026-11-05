import 'express-session';
import type { User } from '../auth/users.js';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
    expiresAt?: number;
  }
}

declare global {
  namespace Express {
    interface Request { account?: User; }
  }
}
