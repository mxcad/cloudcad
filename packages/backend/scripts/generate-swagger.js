/**
 * Build 时生成 Swagger JSON + 触发 @cloudcad/api-sdk 更新
 *
 * 使用方法: node scripts/generate-swagger.js
 * 或在 build 后自动执行: pnpm build
 */

const { NestFactory } = require('@nestjs/core');
const { syncSwaggerAndSdk } = require('./swagger-sync');
const { VersioningType } = require('@nestjs/common');

// 标记 swagger 生成模式（必须在本文件首个 require('../dist/app.module') 之前设置：
// redis.module.js 在模块加载时求值 isSwaggerGeneration，之后设置不会生效），
// redis.module.ts 据此在 Redis 不可达时立即放弃重试，避免服务初始化期间发出的
// Redis 命令触发连接风暴/未处理 error 事件崩溃构建
process.env.GENERATE_SWAGGER = '1';

async function generateSwagger() {
  const { AppModule } = require('../dist/app.module');

  try {
    // 最小化配置，跳过数据库/Redis 连接
    const app = await NestFactory.create(AppModule, {
      logger: false,
      bodyParser: false,
    });

    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    syncSwaggerAndSdk(app);

    // 直接退出
    process.exit(0);
  } catch (err) {
    console.error('Failed to generate swagger:', err);
    process.exit(1);
  }
}

generateSwagger().catch((err) => {
  console.error('Failed to generate swagger:', err);
  process.exit(1);
});