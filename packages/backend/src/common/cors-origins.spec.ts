///////////////////////////////////////////////////////////////////////////////

import { resolveCorsOrigins } from './cors-origins';

describe('resolveCorsOrigins', () => {
  describe('生产环境：FRONTEND_URL 恒允许，CORS_ORIGINS 只追加', () => {
    it('CORS_ORIGINS 设置时 FRONTEND_URL 仍在允许列表内（回归：曾整体替换致本机前端全灭）', () => {
      expect(
        resolveCorsOrigins(
          'production',
          'http://localhost:9000',
          'https://app.cloudcad.com,https://admin.cloudcad.com'
        )
      ).toEqual([
        'http://localhost:9000',
        'https://app.cloudcad.com',
        'https://admin.cloudcad.com',
      ]);
    });

    it('未设置 CORS_ORIGINS 时只允许 FRONTEND_URL', () => {
      expect(
        resolveCorsOrigins('production', 'http://localhost:9000')
      ).toEqual(['http://localhost:9000']);
    });

    it('CORS_ORIGINS 与 FRONTEND_URL 重复时去重', () => {
      expect(
        resolveCorsOrigins(
          'production',
          'http://localhost:9000',
          'http://localhost:9000,https://a.com'
        )
      ).toEqual(['http://localhost:9000', 'https://a.com']);
    });

    it('CORS_ORIGINS 的空项与首尾空白被清理', () => {
      expect(
        resolveCorsOrigins('production', 'http://localhost:9000', ' https://a.com ,, ')
      ).toEqual(['http://localhost:9000', 'https://a.com']);
    });

    it('FRONTEND_URL 缺失时回退默认地址', () => {
      expect(resolveCorsOrigins('production', '', 'https://a.com')).toEqual([
        'http://localhost:8000',
        'https://a.com',
      ]);
    });

    it('两项都缺失时仍有回退地址，不会输出空列表', () => {
      expect(resolveCorsOrigins('production', '', '')).toEqual([
        'http://localhost:8000',
      ]);
    });
  });

  describe('非生产环境：放行本地开发端口', () => {
    it('放行 FRONTEND_URL 与本地端口，忽略 CORS_ORIGINS', () => {
      expect(
        resolveCorsOrigins('development', 'http://localhost:9000', 'https://a.com')
      ).toEqual([
        'http://localhost:9000',
        'http://localhost:5173',
        'http://localhost:8000',
      ]);
    });

    it('FRONTEND_URL 就是本地端口时去重', () => {
      expect(resolveCorsOrigins('development', 'http://localhost:8000')).toEqual([
        'http://localhost:8000',
        'http://localhost:5173',
      ]);
    });

    it('非 production 的任何取值都走本地放行规则', () => {
      expect(resolveCorsOrigins('test', 'http://localhost:9000')).toEqual([
        'http://localhost:9000',
        'http://localhost:5173',
        'http://localhost:8000',
      ]);
    });
  });
});
