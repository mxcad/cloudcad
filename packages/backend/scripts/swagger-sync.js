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

const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const OUTPUT_PATH = path.join(ROOT_DIR, 'swagger_json.json');

function buildSwaggerDocument(app) {
  const config = new DocumentBuilder()
    .setTitle('CloudCAD API')
    .setDescription('图纸管理平台API文档')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer('/api/v1')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    ignoreGlobalPrefix: false,
    operationIdFactory: (controllerKey, methodKey) => {
      const cleanMethod = methodKey.replace(/_v\d+$/, '');
      return `${controllerKey}_${cleanMethod}`;
    },
  });

  if (!document.components) document.components = { schemas: {} };
  if (!document.components.schemas) document.components.schemas = {};

  const { SystemPermission, ProjectPermission } = require('../dist/common/enums/permissions.enum');

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
  const scriptPath = path.join(ROOT_DIR, 'packages', 'api-sdk', 'scripts', 'generate-sdk.cjs');

  if (!fs.existsSync(scriptPath)) {
    console.warn('[swagger] generate-sdk.cjs not found, 跳过 SDK 生成');
    return;
  }

  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync('node', [scriptPath], {
      cwd: path.join(ROOT_DIR, 'packages', 'api-sdk'),
      stdio: 'inherit',
      timeout: 120000,
      shell: true,
    });
    if (result.status === 0) {
      console.log('[swagger] @cloudcad/api-sdk 生成完成');
    } else {
      console.warn(`[swagger] SDK 生成失败 (exit ${result.status})`);
    }
  } catch (err) {
    console.warn(`[swagger] SDK 生成失败: ${err.message}`);
  }
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
