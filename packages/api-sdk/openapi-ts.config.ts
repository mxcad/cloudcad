import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  // 注意：openapi-ts 0.9x 只解析 plugins，顶层 client 键已废弃（写它无效且误导），
  // 客户端由下方 plugins 里的 @hey-api/client-fetch 指定。
  input: '../../swagger_json.json',
  output: 'src',
  plugins: [
    // swagger servers 与 paths 均含 /api/v1 前缀，禁用 server baseUrl 提取，
    // 避免生成 baseUrl '/api/v1' + url '/api/v1/...' 双前缀（请求 /api/v1/api/v1/...）
    { name: '@hey-api/client-fetch', baseUrl: false },
  ],
});
