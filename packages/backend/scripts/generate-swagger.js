/**
 * Build 时生成 Swagger JSON + 触发前端 SDK 更新
 *
 * 使用方法: node scripts/generate-swagger.js
 * 或在 build 后自动执行: pnpm build
 */

const { NestFactory } = require('@nestjs/core');
const { syncSwaggerAndSdk } = require('./swagger-sync');

async function generateSwagger() {
  const { VersioningType } = require('@nestjs/common');
  const app = await NestFactory.create(require('../dist/app.module').AppModule, {
    logger: false,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  syncSwaggerAndSdk(app);

  // 直接退出，避免 Redis 等资源清理时的错误信息
  process.exit(0);
}

generateSwagger().catch((err) => {
  console.error('Failed to generate swagger:', err);
  process.exit(1);
});
