import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  client: '@hey-api/client-fetch',
  input: '../../swagger_json.json',
  output: 'src',
  plugins: [
    // swagger servers 与 paths 均含 /api/v1 前缀，禁用 server baseUrl 提取，
    // 避免生成 baseUrl '/api/v1' + url '/api/v1/...' 双前缀（请求 /api/v1/api/v1/...）
    { name: '@hey-api/client-fetch', baseUrl: false },
  ],
});
