/**
 * 应用配置常量
 * 从环境变量读取配置
 */

/** 应用名称 */
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'CloudCAD';

/** Logo 路径 */
export const APP_LOGO = import.meta.env.VITE_APP_LOGO || '/logo.png';

/** API 基础路径 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
/** 协同 URL */
export const APP_COOPERATE_URL =
  import.meta.env.VITE_APP_COOPERATE_URL || 'http://localhost:3091';

/**
 * 图库配置
 */
export const GALLERY_CONFIG = {
  /** 分类最大层级（支持三级分类） */
  MAX_TYPE_LEVEL: 3,
  /** 默认分页大小 */
  DEFAULT_PAGE_SIZE: 20,
} as const;

/**
 * 分页配置
 */
export const PAGINATION_CONFIG = {
  /** 默认分页大小 */
  DEFAULT_PAGE_SIZE: 20,
  /** 每页数量选项 */
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
  /** 默认分页信息 */
  DEFAULT_PAGINATION: {
    index: 0,
    size: 20,
    count: 0,
    max: 0,
    up: false,
    down: false,
  },
} as const;
