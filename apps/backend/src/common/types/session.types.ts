import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    userRole?: string;
    userEmail?: string;
    userPhone?: string;
    user?: {
      id: string;
      email: string;
      username: string;
      role: string;
    };
  }
}
