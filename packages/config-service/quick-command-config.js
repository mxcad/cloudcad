/**
 * CloudCAD 命令别名配置模块
 * 处理 myQuickCommand.json
 */

const path = require('path');
const { FRONTEND_INI_DIR } = require('../../runtime/scripts/config-paths');
const {
  ensureDir,
  writeJsonFile,
  readOrSeed,
  resetFromSource,
} = require('./lib/ini-store');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const QUICK_COMMAND_DIR = FRONTEND_INI_DIR;
const CONFIG_PATH = path.join(QUICK_COMMAND_DIR, 'myQuickCommand.json');
const SOURCE_PATH = path.join(
  PROJECT_ROOT,
  'packages',
  'frontend',
  'public',
  'ini',
  'myQuickCommand.json'
);

function ensureConfigDir() {
  ensureDir(QUICK_COMMAND_DIR);
}

function getConfig() {
  ensureConfigDir();
  return readOrSeed(CONFIG_PATH, SOURCE_PATH);
}

function updateConfig(config) {
  ensureConfigDir();
  writeJsonFile(CONFIG_PATH, config);
  return config;
}

function validateConfig(data, basePath = '') {
  const errors = [];

  if (!Array.isArray(data)) {
    errors.push({
      path: basePath || 'root',
      error: '配置必须是数组类型',
    });
    return errors;
  }

  data.forEach((item, idx) => {
    if (!Array.isArray(item)) {
      errors.push({
        path: basePath + `[${idx}]`,
        error: '每个元素必须是数组',
      });
      return;
    }

    if (item.length === 0) {
      errors.push({
        path: basePath + `[${idx}]`,
        error: '命令数组不能为空',
      });
      return;
    }

    // First element should be the main command (string)
    if (typeof item[0] !== 'string') {
      errors.push({
        path: basePath + `[${idx}][0]`,
        error: '第一个元素必须是命令名称（字符串）',
      });
    }

    // Subsequent elements should be aliases (strings)
    item.slice(1).forEach((alias, aliasIdx) => {
      if (typeof alias !== 'string') {
        errors.push({
          path: basePath + `[${idx}][${aliasIdx + 1}]`,
          error: '别名必须是字符串类型',
        });
      }
    });
  });

  return errors;
}

function exportConfig() {
  const config = getConfig();
  if (!config) {
    return { success: false, error: '配置文件不存在' };
  }
  return { success: true, data: config };
}

function importConfig(newConfig) {
  const errors = validateConfig(newConfig);

  if (errors.length > 0) {
    return { success: false, errors };
  }

  updateConfig(newConfig);
  return { success: true };
}

// 统一契约（routes/config-resource.js 工厂消费）：
// { ok: true, data } | { ok: false, error, errors? }
function resetConfig() {
  // quick-command 的内置 source 通过校验，reset 时校验以防内置源损坏
  return resetFromSource(SOURCE_PATH, CONFIG_PATH, validateConfig);
}

module.exports = {
  QUICK_COMMAND_DIR,
  CONFIG_PATH,
  getConfig,
  updateConfig,
  validateConfig,
  exportConfig,
  importConfig,
  resetConfig,
  ensureConfigDir,
};
