/**
 * CloudCAD 配置路径常量
 * 
 * 统一管理所有配置文件的路径,实现代码与配置分离
 * 
 * 配置目录结构:
 *   data/
 *   └── configs/
 *       └── frontend/
 *           ├── ini/          # UI 配置、主题配置、服务器配置等
 *           └── brand/        # 品牌配置 (Logo、标题)
 */

const path = require('path');

// 项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// 数据目录
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

// 配置根目录
const CONFIG_DIR = path.join(DATA_DIR, 'configs');

// 前端配置目录
const FRONTEND_CONFIG_DIR = path.join(CONFIG_DIR, 'frontend');

// 具体配置目录
const FRONTEND_INI_DIR = path.join(FRONTEND_CONFIG_DIR, 'ini');
const FRONTEND_BRAND_DIR = path.join(FRONTEND_CONFIG_DIR, 'brand');

module.exports = {
  PROJECT_ROOT,
  DATA_DIR,
  CONFIG_DIR,
  FRONTEND_CONFIG_DIR,
  FRONTEND_INI_DIR,
  FRONTEND_BRAND_DIR,
};
