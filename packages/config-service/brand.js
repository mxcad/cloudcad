/**
 * CloudCAD 品牌配置模块
 * 处理 Logo 和标题的品牌定制
 */

const fs = require('fs');
const path = require('path');

// 品牌配置保存到 dist 目录，因为部署包使用的是 dist
const BRAND_DIR = path.join(__dirname, '..', 'frontend', 'dist', 'brand');
const CONFIG_PATH = path.join(BRAND_DIR, 'config.json');
const LOGO_PATH = path.join(BRAND_DIR, 'logo.png');
const ALLOWED_LOGO_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/gif',
];
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB

const DEFAULT_CONFIG = {
  title: '梦想网页CAD实时协同平台',
  logo: '/brand/logo.png',
};

function ensureBrandDir() {
  if (!fs.existsSync(BRAND_DIR)) {
    fs.mkdirSync(BRAND_DIR, { recursive: true });
  }
}

function getConfig() {
  ensureBrandDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify(DEFAULT_CONFIG, null, 2),
      'utf8'
    );
    return { ...DEFAULT_CONFIG };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

function updateConfig(updates) {
  ensureBrandDir();
  const config = getConfig();
  Object.assign(config, updates);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  return config;
}

function uploadLogo(buffer, mimeType) {
  ensureBrandDir();

  if (!ALLOWED_LOGO_TYPES.includes(mimeType)) {
    return {
      success: false,
      error: `不支持的图片格式，仅支持: ${ALLOWED_LOGO_TYPES.join(', ')}`,
    };
  }

  if (buffer.length > MAX_LOGO_SIZE) {
    return {
      success: false,
      error: `图片大小不能超过 ${MAX_LOGO_SIZE / 1024 / 1024}MB`,
    };
  }

  fs.writeFileSync(LOGO_PATH, buffer);
  return { success: true };
}

function validateConfig(data) {
  const errors = [];

  if (data.title !== undefined) {
    if (typeof data.title !== 'string') {
      errors.push('title 必须是字符串');
    } else if (data.title.length === 0) {
      errors.push('title 不能为空');
    } else if (data.title.length > 100) {
      errors.push('title 不能超过 100 个字符');
    }
  }

  if (data.logo !== undefined) {
    if (typeof data.logo !== 'string') {
      errors.push('logo 必须是字符串');
    }
  }

  return errors;
}

module.exports = {
  BRAND_DIR,
  CONFIG_PATH,
  LOGO_PATH,
  DEFAULT_CONFIG,
  getConfig,
  updateConfig,
  uploadLogo,
  validateConfig,
  ensureBrandDir,
};
