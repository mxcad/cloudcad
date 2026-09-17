import { describe, it, expect } from 'vitest';

import { APP_COOPERATE_URL } from './appConfig';

describe('APP_COOPERATE_URL（协同服务 URL）', () => {
  it('必须是同源相对路径：http/https 部署形态下浏览器均按页面 origin+协议解析，公网 TLS（#408）无需改前端', () => {
    expect(APP_COOPERATE_URL).not.toMatch(/^wss?:\/\//);
    expect(APP_COOPERATE_URL.startsWith('/')).toBe(true);
  });

  it('默认指向后端代理路径 /api/cooperate（由后端 HTTP 代理转发至协同服务 3091）', () => {
    expect(APP_COOPERATE_URL).toBe('/api/cooperate');
  });
});
