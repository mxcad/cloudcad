// @types/express-session@1.19.0 的 SessionData 无 index signature（仅 cookie 字段），
// 此处补充后端自定义的 session 字段，供 req.session.xxx 直接访问。
// 使用点：src/main.ts（userId）、src/auth/jwt.strategy.executor.ts（userId/userRole/userEmail/userPhone）。
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    userRole?: string;
    userEmail?: string;
    userPhone?: string;
  }
}
