/**
 * CloudCAD UI 配置模块
 * 处理 CAD 编辑器界面配置 myUiConfig.json
 */

const fs = require('fs');
const path = require('path');
const { FRONTEND_INI_DIR } = require('../../runtime/scripts/config-paths');

const UI_CONFIG_DIR = FRONTEND_INI_DIR;
const CONFIG_PATH = path.join(UI_CONFIG_DIR, 'myUiConfig.json');

const DEFAULT_CONFIG = {
  title: 'CAD梦想在线画图',
  headerTitle: 'CAD梦想在线画图',
  isShowNameOCurrentlyOpenDrawing: true,
  isShowHeader: true,
  logoImg: true,
  isShowHeaderTopBar: true,
  isShowHeaderTopBarRightBtns: true,
  isSketchesAndNotesUiMode: true,
  isShowSketchesAndNotesUiMode: true,
  headerTopBarRightBtns: ['language', 'theme'],
  defaultActiveLanguage: 'zh-CN',
  isShowUseAiFunctionButton: false,
  isShowTitleButtonBar: true,
  isShowTopButtonBar: true,
  isShowMenuBar: true,
  isShowFooter: true,
  isMobileCommandLineMode: true,
  isShowModelNav: true,
  isShowCommandLinePanel: true,
  isShowCommandInput: true,
  isShowFooterStatusBar: true,
  isShowLeftDrawer: true,
  isShowRightDrawer: true,
  isShowSkeletonLoader: false,
  isPriorityLoadingUi: false,
};

const UI_CONFIG_SCHEMA = {
  booleanFields: [
    'isShowNameOCurrentlyOpenDrawing',
    'isShowHeader',
    'logoImg',
    'isShowHeaderTopBar',
    'isShowHeaderTopBarRightBtns',
    'isSketchesAndNotesUiMode',
    'isShowSketchesAndNotesUiMode',
    'isShowUseAiFunctionButton',
    'isShowTitleButtonBar',
    'isShowTopButtonBar',
    'isShowMenuBar',
    'isShowFooter',
    'isMobileCommandLineMode',
    'isShowModelNav',
    'isShowCommandLinePanel',
    'isShowCommandInput',
    'isShowFooterStatusBar',
    'isShowLeftDrawer',
    'isShowRightDrawer',
    'isShowSkeletonLoader',
    'isPriorityLoadingUi',
  ],
  stringFields: [
    { key: 'title', maxLength: 100 },
    { key: 'headerTitle', maxLength: 100 },
    { key: 'defaultActiveLanguage', enum: ['zh-CN', 'en-US'] },
  ],
  enumArrays: {
    footerRightBtnSwitchData: [
      '栅格',
      '正交',
      '极轴',
      '对象捕捉',
      '对象追踪',
      'DYN',
      '线宽',
    ],
    leftDrawerComponents: [
      'DrawingComparison',
      'TextSearch',
      'BlockLibrary',
      'CodeEditor',
      'DatabaseDisplay',
      'PatternRec',
    ],
    rightDrawerComponents: ['EntityAttribute'],
  },
};

function ensureConfigDir() {
  if (!fs.existsSync(UI_CONFIG_DIR)) {
    fs.mkdirSync(UI_CONFIG_DIR, { recursive: true });
  }
}

function getConfig() {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_PATH)) {
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

function validateConfig(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push({ path: '', error: '配置必须是有效 JSON 对象' });
    return errors;
  }

  UI_CONFIG_SCHEMA.booleanFields.forEach((field) => {
    if (data[field] !== undefined && typeof data[field] !== 'boolean') {
      errors.push({ path: field, error: '必须是布尔类型' });
    }
  });

  UI_CONFIG_SCHEMA.stringFields.forEach(
    ({ key, maxLength, enum: enumVals }) => {
      if (data[key] !== undefined) {
        if (typeof data[key] !== 'string') {
          errors.push({ path: key, error: '必须是字符串类型' });
        } else {
          if (maxLength && data[key].length > maxLength) {
            errors.push({ path: key, error: `长度不能超过 ${maxLength}` });
          }
          if (enumVals && !enumVals.includes(data[key])) {
            errors.push({
              path: key,
              error: `值 '${data[key]}' 不在允许的枚举值中`,
            });
          }
        }
      }
    }
  );

  Object.entries(UI_CONFIG_SCHEMA.enumArrays).forEach(
    ([key, allowedValues]) => {
      if (data[key] !== undefined) {
        if (!Array.isArray(data[key])) {
          errors.push({ path: key, error: '必须是数组类型' });
        } else {
          data[key].forEach((item, idx) => {
            if (!allowedValues.includes(item)) {
              errors.push({
                path: `${key}[${idx}]`,
                error: `值 '${item}' 不在允许的枚举值中`,
              });
            }
          });
        }
      }
    }
  );

  const buttonArrays = [
    'mTopButtonBarData',
    'mTitleButtonBarData',
    'headerTopBarCustomRightBtns',
  ];

  buttonArrays.forEach((key) => {
    if (data[key] !== undefined) {
      if (!Array.isArray(data[key])) {
        errors.push({ path: key, error: '必须是数组类型' });
      } else {
        data[key].forEach((btn, idx) => {
          if (!btn.cmd) {
            errors.push({
              path: `${key}[${idx}]`,
              error: '缺少必需字段 cmd',
            });
          }
          if (!btn.icon && !btn.prompt && !btn.tab) {
            errors.push({
              path: `${key}[${idx}]`,
              error: 'icon/prompt/tab 至少需要一个',
            });
          }
        });
      }
    }
  });

  if (data.mLeftButtonBarData?.buttonBarData) {
    data.mLeftButtonBarData.buttonBarData.forEach((btn, idx) => {
      if (!btn.cmd) {
        errors.push({
          path: `mLeftButtonBarData.buttonBarData[${idx}]`,
          error: '缺少必需字段 cmd',
        });
      }
      if (!btn.icon && !btn.prompt) {
        errors.push({
          path: `mLeftButtonBarData.buttonBarData[${idx}]`,
          error: 'icon/prompt 至少需要一个',
        });
      }
    });
  }

  if (data.mRightButtonBarData?.buttonBarData) {
    data.mRightButtonBarData.buttonBarData.forEach((btn, idx) => {
      if (!btn.cmd) {
        errors.push({
          path: `mRightButtonBarData.buttonBarData[${idx}]`,
          error: '缺少必需字段 cmd',
        });
      }
      if (!btn.icon && !btn.prompt) {
        errors.push({
          path: `mRightButtonBarData.buttonBarData[${idx}]`,
          error: 'icon/prompt 至少需要一个',
        });
      }
    });
  }

  if (data.mTitleButtonBarData) {
    data.mTitleButtonBarData.forEach((btn, idx) => {
      if (!btn.cmd) {
        errors.push({
          path: `mTitleButtonBarData[${idx}]`,
          error: '缺少必需字段 cmd',
        });
      }
      if (!btn.icon && !btn.prompt) {
        errors.push({
          path: `mTitleButtonBarData[${idx}]`,
          error: 'icon/prompt 至少需要一个',
        });
      }
    });
  }

  if (data.mTopButtonBarData) {
    data.mTopButtonBarData.forEach((btn, idx) => {
      if (!btn.cmd) {
        errors.push({
          path: `mTopButtonBarData[${idx}]`,
          error: '缺少必需字段 cmd',
        });
      }
      if (!btn.icon && !btn.prompt) {
        errors.push({
          path: `mTopButtonBarData[${idx}]`,
          error: 'icon/prompt 至少需要一个',
        });
      }
    });
  }

  if (data.mMenuBarData) {
    if (!Array.isArray(data.mMenuBarData)) {
      errors.push({ path: 'mMenuBarData', error: '必须是数组类型' });
    }
  }

  const rightMenuArrays = [
    'mRightMenuData',
    'mRightMenuDataCommandRuning',
    'mRightMenuDataCommandRuningOsnapSet',
    'mRightMenuDataSelectEntity',
  ];

  rightMenuArrays.forEach((key) => {
    if (data[key] !== undefined) {
      if (!Array.isArray(data[key])) {
        errors.push({ path: key, error: '必须是数组类型' });
      } else {
        data[key].forEach((item, idx) => {
          if (!item.label) {
            errors.push({
              path: `${key}[${idx}]`,
              error: '缺少必需字段 label',
            });
          }
        });
      }
    }
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

module.exports = {
  UI_CONFIG_DIR,
  CONFIG_PATH,
  DEFAULT_CONFIG,
  getConfig,
  updateConfig,
  validateConfig,
  exportConfig,
  importConfig,
  ensureConfigDir,
};
