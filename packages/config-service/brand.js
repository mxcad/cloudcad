/**
 * CloudCAD 品牌配置模块
 * 处理 Logo、标题、版权、客服与法务文本的品牌定制
 *
 * 写入的 `config.json` 由前端 `/brand/config.json` 直接消费，
 * 未声明的字段透传保留（前端按「存在才覆盖、缺失走内置默认值」合并），
 * 因此这里只校验「存在」的字段，不做必填校验。
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

/** 顶层字符串字段（允许空串，用于清空回到内置默认值） */
const TOP_LEVEL_STRING_FIELDS = [
  'logo',
  'tagline',
  'subtitle',
  'docsUrl',
  'copyrightYear',
  'copyrightHolder',
  'copyrightLine',
];
/** 客服联系方式字段（客服弹框与法务正文同源） */
const SUPPORT_STRING_FIELDS = ['email', 'phone', 'hours'];
/** 法务标量字段 */
const LEGAL_SCALAR_FIELDS = ['productName', 'productShortName'];
/** 按应用覆盖的品牌字段 */
const APP_BRAND_FIELDS = ['title', 'tagline', 'logo'];
/** 法务签约主体字段 */
const LEGAL_IDENTITY_FIELDS = ['entityName'];

const MAX_TITLE_LENGTH = 100;
const MAX_FIELD_LENGTH = 200;

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

/** 单个可选字符串字段：存在才校验类型与长度，空串放行 */
function validateStringField(obj, field, label, maxLength, errors) {
  if (obj[field] === undefined) return;
  if (typeof obj[field] !== 'string') {
    errors.push(`${label} 必须是字符串`);
  } else if (obj[field].length > maxLength) {
    errors.push(`${label} 不能超过 ${maxLength} 个字符`);
  }
}

/** 一组可选字符串字段（同一嵌套对象） */
function validateStringFields(obj, fields, label, maxLength, errors) {
  if (obj === undefined) return;
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    errors.push(`${label} 必须是对象`);
    return;
  }
  fields.forEach((field) => {
    validateStringField(obj, field, `${label}.${field}`, maxLength, errors);
  });
}

function validateConfig(data) {
  const errors = [];

  if (data.title !== undefined) {
    if (typeof data.title !== 'string') {
      errors.push('title 必须是字符串');
    } else if (data.title.length === 0) {
      errors.push('title 不能为空');
    } else if (data.title.length > MAX_TITLE_LENGTH) {
      errors.push('title 不能超过 100 个字符');
    }
  }

  TOP_LEVEL_STRING_FIELDS.forEach((field) => {
    validateStringField(data, field, field, MAX_FIELD_LENGTH, errors);
  });

  validateStringFields(
    data.support,
    SUPPORT_STRING_FIELDS,
    'support',
    MAX_FIELD_LENGTH,
    errors
  );

  if (data.legal !== undefined) {
    if (
      data.legal === null ||
      typeof data.legal !== 'object' ||
      Array.isArray(data.legal)
    ) {
      errors.push('legal 必须是对象');
    } else {
      LEGAL_SCALAR_FIELDS.forEach((field) => {
        validateStringField(
          data.legal,
          field,
          `legal.${field}`,
          MAX_FIELD_LENGTH,
          errors
        );
      });

      if (data.legal.identities !== undefined) {
        if (
          data.legal.identities === null ||
          typeof data.legal.identities !== 'object' ||
          Array.isArray(data.legal.identities)
        ) {
          errors.push('legal.identities 必须是对象');
        } else {
          Object.keys(data.legal.identities).forEach((language) => {
            validateStringFields(
              data.legal.identities[language],
              LEGAL_IDENTITY_FIELDS,
              `legal.identities.${language}`,
              MAX_FIELD_LENGTH,
              errors
            );
          });
        }
      }
    }
  }

  if (data.apps !== undefined) {
    if (
      data.apps === null ||
      typeof data.apps !== 'object' ||
      Array.isArray(data.apps)
    ) {
      errors.push('apps 必须是对象');
    } else {
      Object.keys(data.apps).forEach((appId) => {
        APP_BRAND_FIELDS.forEach((field) => {
          validateStringField(
            data.apps[appId],
            field,
            `apps.${appId}.${field}`,
            field === 'title' ? MAX_TITLE_LENGTH : MAX_FIELD_LENGTH,
            errors
          );
        });
      });
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
