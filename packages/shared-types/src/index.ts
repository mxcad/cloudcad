/**
 * CloudCAD 共享类型定义
 * 统一导出所有类型
 */

// ==================== 认证相关 ====================
export * from './auth';

// ==================== 用户相关 ====================
export * from './user';

// ==================== 枚举类型 ====================
export * from './enums';

// ==================== 项目相关 ====================
export * from './project';

// ==================== 文件相关 ====================
export * from './file';

// ==================== 资源库相关 ====================
export * from './library';

// ==================== 通用类型 ====================

/** API响应基础类型 */
export interface ApiResponse<T = any> {
  /** 响应数据 */
  data: T;
  /** 响应消息 */
  message?: string;
  /** 响应状态码 */
  statusCode: number;
  /** 响应时间戳 */
  timestamp: string;
}

/** 分页查询参数 */
export interface PaginationQuery {
  /** 页码 */
  page?: number;
  /** 每页数量 */
  limit?: number;
  /** 排序字段 */
  sortBy?: string;
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/** 分页响应数据 */
export interface PaginatedResponse<T> {
  /** 数据列表 */
  data: T[];
  /** 分页信息 */
  pagination: {
    /** 当前页码 */
    page: number;
    /** 每页数量 */
    limit: number;
    /** 总记录数 */
    total: number;
    /** 总页数 */
    totalPages: number;
  };
}

/** 错误响应类型 */
export interface ErrorResponse {
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code?: string;
  /** 错误详情 */
  details?: any;
  /** 响应时间戳 */
  timestamp: string;
  /** 请求路径 */
  path: string;
}

/** 文件上传配置 */
export interface UploadConfig {
  /** 最大文件大小（字节） */
  maxSize: number;
  /** 允许的文件类型 */
  allowedTypes: string[];
  /** 上传路径 */
  uploadPath: string;
}

/** 系统配置 */
export interface SystemConfig {
  /** 系统名称 */
  name: string;
  /** 系统版本 */
  version: string;
  /** 文件上传配置 */
  upload: UploadConfig;
  /** 功能开关 */
  features: {
    /** 是否启用注册 */
    registration: boolean;
    /** 是否启用邮箱验证 */
    emailVerification: boolean;
    /** 是否启用文件分享 */
    fileSharing: boolean;
  };
}