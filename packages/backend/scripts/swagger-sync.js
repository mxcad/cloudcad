/**
 * 共享模块：生成 swagger_json.json + 异步触发前端 SDK 更新
 *
 * 两个调用方：
 * 1. generate-swagger.js（build 时）— 传入 NestFactory 创建的 app
 * 2. main.ts（dev 启动/重启时）— 传入正在运行的 app
 *
 * 非阻塞，出错只打日志不影响后端。
 */

const fs = require('fs');
const path = require('path');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
const OUTPUT_PATH = path.join(FRONTEND_DIR, 'swagger_json.json');
const SDK_BIN = path.join(
  FRONTEND_DIR,
  'node_modules',
  '@hey-api',
  'openapi-ts',
  'bin',
  'run.js',
);

function buildSwaggerDocument(app) {
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

  if (!document.components) document.components = { schemas: {} };
  if (!document.components.schemas) document.components.schemas = {};

  const { SystemPermission, ProjectPermission } = require('../dist/common/dto/permission.dto');

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

  return document;
}

function writeSwaggerJson(document) {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(document, null, 2), 'utf8');
  console.log(`[swagger] JSON 已更新: ${OUTPUT_PATH}`);
}

function triggerSdkGeneration() {
  if (!fs.existsSync(SDK_BIN)) {
    console.warn('[swagger] SDK binary not found, 跳过 SDK 生成');
    return;
  }

  const { spawn } = require('child_process');
  const child = spawn(process.execPath, [SDK_BIN], {
    cwd: FRONTEND_DIR,
    stdio: 'ignore',
    detached: true,
    shell: true,
  });
  child.unref();
  child.on('error', (err) => {
    console.warn(`[swagger] SDK 生成失败（非阻塞）: ${err.message}`);
  });
  console.log('[swagger] 前端 SDK 更新已触发（非阻塞）');
}

/**
 * 主入口：传入 NestJS app 实例，完成 swagger 写文件 + SDK 触发
 */
function syncSwaggerAndSdk(app) {
  try {
    const document = buildSwaggerDocument(app);
    writeSwaggerJson(document);
    triggerSdkGeneration();
  } catch (err) {
    console.warn(`[swagger] 失败（不影响后端）: ${err.message}`);
  }
}

module.exports = { syncSwaggerAndSdk };
