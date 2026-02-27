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
export const APP_COOPERATE_URL = import.meta.env.VITE_APP_COOPERATE_URL || 'http://localhost:3091';