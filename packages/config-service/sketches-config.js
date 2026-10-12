/**
 * CloudCAD 草图 UI 配置模块
 * 处理 CAD 草图界面配置 mySketchesAndNotesUiConfig.json
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
const SKETCHES_CONFIG_DIR = FRONTEND_INI_DIR;
const CONFIG_PATH = path.join(
  SKETCHES_CONFIG_DIR,
  'mySketchesAndNotesUiConfig.json'
);
const SOURCE_PATH = path.join(
  PROJECT_ROOT,
  'packages',
  'frontend',
  'public',
  'ini',
  'mySketchesAndNotesUiConfig.json'
);

function ensureConfigDir() {
  ensureDir(SKETCHES_CONFIG_DIR);
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

  if (!data || typeof data !== 'object') {
    errors.push({
      path: basePath || 'root',
      error: '配置必须是有效 JSON 对象',
    });
    return errors;
  }

  if (!data.mMenuData || !Array.isArray(data.mMenuData)) {
    errors.push({ path: basePath + 'mMenuData', error: '必须是数组类型' });
    return errors;
  }

  // Validate menu items recursively
  data.mMenuData.forEach((menu, idx) => {
    const menuPath = basePath + `mMenuData[${idx}]`;
    validateMenuItem(menu, menuPath, errors);
  });

  return errors;
}

function validateMenuItem(item, path, errors) {
  if (!item || typeof item !== 'object') {
    errors.push({ path, error: '菜单项必须是对象' });
    return;
  }

  // Check for divider type - fewer validation required
  if (item.type === 'divider') {
    return;
  }

  // Required field: tab or label
  if (!item.tab && !item.label && !item.cmd) {
    // Menu item should have at least one of these
  }

  // Validate commandOptions - must be array if present
  if (item.commandOptions !== undefined) {
    if (item.commandOptions === '') {
      // Empty string is allowed (user input)
    } else if (Array.isArray(item.commandOptions)) {
      // Valid array
    } else if (typeof item.commandOptions === 'string') {
      try {
        const parsed = JSON.parse(item.commandOptions);
        if (!Array.isArray(parsed)) {
          errors.push({
            path: path + '.commandOptions',
            error: '必须是数组格式，如 ["C","A"]',
          });
        }
      } catch (e) {
        errors.push({
          path: path + '.commandOptions',
          error: '必须是有效的 JSON 数组格式',
        });
      }
    }
  }

  // Validate boolean fields
  [
    'isShowLabel',
    'isShowToMainPanel',
    'isShowToMainPanelRight',
    'isSeparateMenuArrowIcon',
    'labelWithArrowLayout',
    'col',
    'sameWidth',
  ].forEach((field) => {
    if (item[field] !== undefined && typeof item[field] !== 'boolean') {
      errors.push({ path: path + '.' + field, error: '必须是布尔值' });
    }
  });

  // Validate props - should be object if present
  if (item.props !== undefined && typeof item.props !== 'object') {
    errors.push({ path: path + '.props', error: '必须是对象' });
  }

  // Validate nested list
  if (item.list && Array.isArray(item.list)) {
    item.list.forEach((child, idx) => {
      validateMenuItem(child, path + `.list[${idx}]`, errors);
    });
  }
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
  // sketches 的内置 source 与 schema 存在漂移风险，reset 不校验（与 ui/server 一致）
  return resetFromSource(SOURCE_PATH, CONFIG_PATH);
}

module.exports = {
  SKETCHES_CONFIG_DIR,
  CONFIG_PATH,
  getConfig,
  updateConfig,
  validateConfig,
  exportConfig,
  importConfig,
  resetConfig,
  ensureConfigDir,
};
