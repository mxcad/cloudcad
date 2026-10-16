/**
 * @fileoverview .env 配置文件创建（单一事实源）
 *
 * 缺失时从同目录 .env.example 复制为目标文件，随后填充空白必填密钥并收紧权限。
 *
 * 两个消费者：
 * - runtime/scripts/setup-offline.js（离线部署包首次落盘）
 * - scripts/ensure-env-files.js（pnpm install 的 postinstall，开发环境自举）
 *
 * 目标文件已被 .gitignore 排除（保留 .env.example），故自动创建不会入库。
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 * projectRoot 由调用方传入，不依赖 lib/context。
 */

const fs = require('fs');
const path = require('path');
const { fillEmptySecrets } = require('./secret-generator');

const ENV_EXAMPLE_NAME = '.env.example';

/**
 * 需要 .env 的目录与目标文件名清单
 *
 * target：目标文件名。前端用 .env.local 而非 .env —— Vite 读得到且优先级高于
 * .env（本地覆盖），同时被 .gitignore 排除；与离线部署包同一目标名，避免两种
 * 形态各认一个文件。
 */
const ENV_TARGETS = [
  { dirName: ['packages', 'backend'], target: '.env' },
  { dirName: ['packages', 'frontend'], target: '.env.local' },
  { dirName: ['docker'], target: '.env' },
];

/**
 * 解析 projectRoot 下的模板/目标文件对
 * @param {string} projectRoot
 * @returns {{exampleFile: string, envFile: string, dirName: string[]}}
 */
function resolveEnvFiles(projectRoot) {
  return ENV_TARGETS.map((target) => ({
    dirName: target.dirName,
    exampleFile: path.join(projectRoot, ...target.dirName, ENV_EXAMPLE_NAME),
    envFile: path.join(projectRoot, ...target.dirName, target.target),
  }));
}

/**
 * 从 .env.example 创建缺失的 .env 配置文件
 *
 * 目标已存在即跳过（不合并、不覆盖）——已有配置可能含本地修改或密钥。
 * 仅 backend .env 填充空白密钥：它是唯一在生产模式校验 SESSION_SECRET/
 * REDIS_PASSWORD 等必填项的服务；模板里留空的键不填则启动即失败。
 *
 * @param {string} projectRoot 项目根目录
 * @param {{log?: Function, error?: Function}} [logger] 调用方注入的日志函数
 * @returns {{copied: number, skipped: number, touched: string[]}}
 *   touched 为已存在的目标文件路径（调用方据此收紧权限）
 */
function createEnvFilesFromExamples(projectRoot, logger = {}) {
  const log = logger.log || (() => {});
  const error = logger.error || log;
  const files = resolveEnvFiles(projectRoot);

  let copied = 0;
  let skipped = 0;
  let backendEnvCreated = false;
  const touched = [];

  for (const file of files) {
    if (!fs.existsSync(file.exampleFile)) {
      continue;
    }

    if (fs.existsSync(file.envFile)) {
      skipped++;
      touched.push(file.envFile);
      continue;
    }

    try {
      fs.copyFileSync(file.exampleFile, file.envFile);
      log(`  ✓ 创建: ${path.relative(projectRoot, file.envFile)}`);
      if (file.target === '.env') {
        backendEnvCreated = true;
      }
      copied++;
      touched.push(file.envFile);
    } catch (err) {
      error(
        `  ✗ 创建失败: ${path.relative(projectRoot, file.envFile)} - ${err.message}`
      );
    }
  }

  if (copied > 0) {
    log(`已创建 ${copied} 个 .env 配置文件`);
  }
  if (skipped > 0) {
    log(`跳过 ${skipped} 个已存在的 .env 文件`);
  }

  // 无论 .env 是新创建还是已存在，都填补空白密钥
  const backendEnv = path.join(projectRoot, 'packages', 'backend', '.env');
  if (fs.existsSync(backendEnv)) {
    const label = backendEnvCreated ? '新创建' : '已有';
    log(`填充 ${label} .env 文件中的空白密钥...`);
    fillEmptySecrets(backendEnv, log);
  }

  // #424：生产 .env 含真密钥，权限收紧 600（仅属主可读写）
  // Windows（NTFS 无 unix 权限位）下 chmod 为无操作，不报错
  for (const envFile of touched) {
    try {
      fs.chmodSync(envFile, 0o600);
    } catch (_) {
      // 权限设置失败不阻断（Windows 无权限概念/只读文件系统等）
    }
  }

  return { copied, skipped, touched };
}

module.exports = {
  ENV_EXAMPLE_NAME,
  ENV_TARGETS,
  resolveEnvFiles,
  createEnvFilesFromExamples,
};
