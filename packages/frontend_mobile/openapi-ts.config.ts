import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  client: '@hey-api/client-fetch',
  input: '../../swagger_json.json',
  output: 'src/api-sdk',
  plugins: ['@hey-api/client-fetch'],
});
