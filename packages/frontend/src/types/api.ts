/**
 * API 类型定义
 * 此文件由脚本自动生成，请勿手动修改
 * 运行 `pnpm generate:types` 重新生成
 */

// 临时类型定义，等待后端启动后自动生成
export interface User {
  id: string;
  email: string;
  username: string;
  nickname?: string;
  avatar?: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface File {
  id: string;
  name: string;
  originalName?: string;
  path: string;
  size: number;
  mimeType: string;
  status: string;
  ownerId: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

// API 响应类型
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  statusCode: number;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}