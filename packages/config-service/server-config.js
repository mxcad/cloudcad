/**
 * CloudCAD 服务器配置模块
 * 处理 myServerConfig.json
 */

const fs = require('fs');
const path = require('path');
const { FRONTEND_INI_DIR } = require('../../runtime/scripts/config-paths');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SERVER_CONFIG_DIR = FRONTEND_INI_DIR;
const CONFIG_PATH = path.join(SERVER_CONFIG_DIR, 'myServerConfig.json');
const SOURCE_PATH = path.join(
  PROJECT_ROOT,
  'packages',
  'frontend',
  'public',
  'ini',
  'myServerConfig.json'
);

function ensureConfigDir() {
  if (!fs.existsSync(SERVER_CONFIG_DIR)) {
    fs.mkdirSync(SERVER_CONFIG_DIR, { recursive: true });
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

  // Validate uploadFileConfig
  if (data.uploadFileConfig !== undefined) {
    if (typeof data.uploadFileConfig !== 'object') {
      errors.push({
        path: basePath + 'uploadFileConfig',
        error: '必须是对象类型',
      });
    } else {
      // Validate create object
      if (data.uploadFileConfig.create !== undefined) {
        if (typeof data.uploadFileConfig.create !== 'object') {
          errors.push({
            path: basePath + 'uploadFileConfig.create',
            error: '必须是对象类型',
          });
        }
      }
      // Validate accept object
      if (data.uploadFileConfig.create?.accept !== undefined) {
        if (typeof data.uploadFileConfig.create.accept !== 'object') {
          errors.push({
            path: basePath + 'uploadFileConfig.create.accept',
            error: '必须是对象类型',
          });
        }
      }
    }
  }

  // Validate aiConfig
  if (data.aiConfig !== undefined) {
    if (typeof data.aiConfig !== 'object') {
      errors.push({ path: basePath + 'aiConfig', error: '必须是对象类型' });
    }
  }

  // Validate wasmConfig
  if (data.wasmConfig !== undefined) {
    if (typeof data.wasmConfig !== 'object') {
      errors.push({ path: basePath + 'wasmConfig', error: '必须是对象类型' });
    }
    if (data.wasmConfig?.type !== undefined) {
      if (!['2d', '2d-st'].includes(data.wasmConfig.type)) {
        errors.push({
          path: basePath + 'wasmConfig.type',
          error: '必须是 2d 或 2d-st',
        });
      }
    }
  }

  // Validate boolean fields
  const booleanFields = [
    'supportTruetypeFont',
    'webgl1',
    'useUtf8',
    'isAutomaticJumpToMobilePage',
    'chunked',
  ];
  booleanFields.forEach((field) => {
    if (data[field] !== undefined && typeof data[field] !== 'boolean') {
      errors.push({ path: basePath + field, error: '必须是布尔值' });
    }
  });

  // Validate array fields
  if (data.font !== undefined) {
    if (!Array.isArray(data.font)) {
      errors.push({ path: basePath + 'font', error: '必须是数组类型' });
    }
  }

  if (data.bigFont !== undefined) {
    if (!Array.isArray(data.bigFont)) {
      errors.push({ path: basePath + 'bigFont', error: '必须是数组类型' });
    }
  }

  if (data.trueTypeFont !== undefined) {
    if (!Array.isArray(data.trueTypeFont)) {
      errors.push({
        path: basePath + 'trueTypeFont',
        error: '必须是二维数组类型',
      });
    } else {
      // Check if it's a 2D array
      const is2D = data.trueTypeFont.every(
        (item) =>
          Array.isArray(item) && item.every((i) => typeof i === 'string')
      );
      if (!is2D) {
        errors.push({
          path: basePath + 'trueTypeFont',
          error: '必须是二维字符串数组，如 [["simsun"], ["思原黑体"]]',
        });
      }
    }
  }

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
  SERVER_CONFIG_DIR,
  CONFIG_PATH,
  getConfig,
  updateConfig,
  validateConfig,
  exportConfig,
  importConfig,
  resetConfig,
  ensureConfigDir,
};
