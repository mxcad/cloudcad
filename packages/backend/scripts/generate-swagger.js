/**
 * 生成 Swagger JSON 文件（使用编译后的代码）
 *
 * 使用方法: node scripts/generate-swagger.js
 * 或在 build 后自动执行: pnpm build
 *
 * 输出: packages/frontend/swagger_json.json
 */

const { NestFactory } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const fs = require('fs');
const path = require('path');
const { AppModule } = require('../dist/app.module');
const { SystemPermission, ProjectPermission } = require('../dist/common/dto/permission.dto');

async function generateSwagger() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
  });

  const config = new DocumentBuilder()
    .setTitle('CloudCAD API')
    .setDescription('图纸管理平台API文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => {
      const cleanMethod = methodKey.replace(/_v\d+$/, '');
      return `${controllerKey}_${cleanMethod}`;
    },
  });

  // 添加权限枚举到 OpenAPI 规范中
  if (!document.components) {
    document.components = { schemas: {} };
  }
  if (!document.components.schemas) {
    document.components.schemas = {};
  }

  document.components.schemas.SystemPermission = {
    type: 'string',
    enum: Object.values(SystemPermission),
    description: '系统权限枚举',
  };

  document.components.schemas.ProjectPermission = {
    type: 'string',
    enum: Object.values(ProjectPermission),
    description: '项目权限枚举',
  };

  document.components.schemas.Permission = {
    type: 'string',
    enum: [
      ...Object.values(SystemPermission),
      ...Object.values(ProjectPermission),
    ],
    description: '统一权限枚举',
  };

  // 输出到 packages/frontend/swagger_json.json
  const outputPath = path.join(__dirname, '..', '..', 'frontend', 'swagger_json.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');
  console.log(`Swagger JSON generated: ${outputPath}`);

  // 异步触发前端 SDK 重新生成（不阻塞，出错不影响后端启动）
  regenerateFrontendSdk();

  // 直接退出，避免 Redis 等资源清理时的错误信息
  process.exit(0);
}

generateSwagger().catch((err) => {
  console.error('Failed to generate swagger:', err);
  process.exit(1);
});

/**
 * 异步触发前端 SDK 重新生成
 * - swagger_json.json 变更后自动同步 SDK
 * - 完全非阻塞，出错只打印警告
 */
function regenerateFrontendSdk() {
  const { spawn } = require('child_process');
  const sdkBin = path.join(__dirname, '..', '..', 'frontend', 'node_modules', '@hey-api', 'openapi-ts', 'bin', 'run.js');

  if (!fs.existsSync(sdkBin)) {
    console.warn('[swagger] SDK binary not found, skipping SDK generation');
    return;
  }

  const frontendDir = path.join(__dirname, '..', '..', 'frontend');
  const child = spawn(process.execPath, [sdkBin], {
    cwd: frontendDir,
    stdio: 'ignore',
    detached: true,
    shell: true,
  });

  child.unref();

  child.on('error', (err) => {
    console.warn('[swagger] Frontend SDK generation failed (non-blocking):', err.message);
  });

  console.log('[swagger] Frontend SDK generation triggered (non-blocking)');
}
