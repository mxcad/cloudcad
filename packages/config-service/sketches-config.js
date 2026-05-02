/**
 * CloudCAD 草图 UI 配置模块
 * 处理 CAD 草图界面配置 mySketchesAndNotesUiConfig.json
 */

const fs = require('fs');
const path = require('path');
const { FRONTEND_INI_DIR } = require('../../runtime/scripts/config-paths');

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
  if (!fs.existsSync(SKETCHES_CONFIG_DIR)) {
    fs.mkdirSync(SKETCHES_CONFIG_DIR, { recursive: true });
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

function resetConfig() {
  ensureConfigDir();
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
