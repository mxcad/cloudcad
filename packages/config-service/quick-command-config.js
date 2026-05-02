/**
 * CloudCAD 命令别名配置模块
 * 处理 myQuickCommand.json
 */

const fs = require('fs');
const path = require('path');
const { FRONTEND_INI_DIR } = require('../../runtime/scripts/config-paths');

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
  if (!fs.existsSync(QUICK_COMMAND_DIR)) {
    fs.mkdirSync(QUICK_COMMAND_DIR, { recursive: true });
  }
}

function getConfig() {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_PATH)) {
    if (fs.existsSync(SOURCE_PATH)) {
      try {
        const sourceConfig = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
        fs.writeFileSync(
          CONFIG_PATH,
          JSON.stringify(sourceConfig, null, 2),
          'utf8'
        );
        return sourceConfig;
      } catch (e) {
        return null;
      }
    }
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return null;
  }
}

function updateConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
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

function resetConfig() {
  if (!fs.existsSync(SOURCE_PATH)) {
    return { success: false, error: '默认配置文件不存在' };
  }

  try {
    const defaultConfig = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
    const errors = validateConfig(defaultConfig);
    if (errors.length > 0) {
      return { success: false, errors };
    }
    updateConfig(defaultConfig);
    return { success: true };
  } catch (e) {
    return { success: false, error: '读取默认配置失败: ' + e.message };
  }
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
