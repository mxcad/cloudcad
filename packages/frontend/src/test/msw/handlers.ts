/**
 * MSW handler — 由 msw-auto-mock 从 swagger_json.json 自动生成。
 *
 * 每次更新 swagger JSON 后重新生成：
 *   npx msw-auto-mock swagger_json.json -o src/test/msw/generated --base-url "" --typescript
 *
 * 如需覆盖特定接口的返回数据，在测试中使用 server.use()：
 *   import { http, HttpResponse } from 'msw';
 *   server.use(http.post('/api/v1/auth/login', () => HttpResponse.json({ ... })));
 */

export { handlers } from './generated/handlers';
