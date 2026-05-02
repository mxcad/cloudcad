/**
 * CloudCAD 主题配置模块
 * 处理 myVuetifyThemeConfig.json
 */

const fs = require('fs');
const path = require('path');
const { FRONTEND_INI_DIR } = require('../../runtime/scripts/config-paths');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const THEME_CONFIG_DIR = FRONTEND_INI_DIR;
const CONFIG_PATH = path.join(THEME_CONFIG_DIR, 'myVuetifyThemeConfig.json');
const SOURCE_PATH = path.join(
  PROJECT_ROOT,
  'packages',
  'frontend',
  'public',
  'ini',
  'myVuetifyThemeConfig.json'
);

function ensureConfigDir() {
  if (!fs.existsSync(THEME_CONFIG_DIR)) {
    fs.mkdirSync(THEME_CONFIG_DIR, { recursive: true });
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

  // Validate defaultTheme
  if (data.defaultTheme !== undefined) {
    if (!['light', 'dark'].includes(data.defaultTheme)) {
      errors.push({
        path: basePath + 'defaultTheme',
        error: '必须是 "light" 或 "dark"',
      });
    }
  }

  // Validate themes
  if (data.themes !== undefined) {
    if (typeof data.themes !== 'object') {
      errors.push({
        path: basePath + 'themes',
        error: '必须是对象类型',
      });
    } else {
      ['light', 'dark'].forEach((themeName) => {
        if (data.themes[themeName]) {
          validateTheme(
            data.themes[themeName],
            basePath + 'themes.' + themeName,
            errors
          );
        }
      });
    }
  }

  return errors;
}

function validateTheme(theme, basePath, errors) {
  if (typeof theme !== 'object') {
    errors.push({ path: basePath, error: '主题必须是对象类型' });
    return;
  }

  // Validate colors
  if (theme.colors !== undefined) {
    if (typeof theme.colors !== 'object') {
      errors.push({ path: basePath + '.colors', error: '必须是对象类型' });
    } else {
      Object.entries(theme.colors).forEach(([key, value]) => {
        if (typeof value !== 'string') {
          errors.push({
            path: basePath + '.colors.' + key,
            error: '颜色值必须是字符串',
          });
        } else if (
          !/^#([0-9A-Fa-f]{3}){1,2}$/.test(value) &&
          !value.startsWith('rgb')
        ) {
          // Allow hex or rgb values
        }
      });
    }
  }

  // Validate variables
  if (theme.variables !== undefined) {
    if (typeof theme.variables !== 'object') {
      errors.push({ path: basePath + '.variables', error: '必须是对象类型' });
    } else {
      Object.entries(theme.variables).forEach(([key, value]) => {
        // Variables can be strings (colors) or numbers (opacity)
        if (typeof value !== 'string' && typeof value !== 'number') {
          errors.push({
            path: basePath + '.variables.' + key,
            error: '变量值必须是字符串或数字',
          });
        }
        // Check opacity values are in valid range
        if (key.includes('opacity') && typeof value === 'number') {
          if (value < 0 || value > 1) {
            errors.push({
              path: basePath + '.variables.' + key,
              error: '透明度值必须在 0-1 之间',
            });
          }
        }
      });
    }
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
  THEME_CONFIG_DIR,
  CONFIG_PATH,
  getConfig,
  updateConfig,
  validateConfig,
  exportConfig,
  importConfig,
  resetConfig,
  ensureConfigDir,
};
