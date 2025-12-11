// 认证相关类型
export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  username: string;
  nickname?: string;
}

export interface AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    nickname?: string;
    role: 'ADMIN' | 'USER';
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    createdAt: string;
    updatedAt: string;
  };
}

export interface RefreshTokenDto {
  refreshToken: string;
}

// 用户相关类型
export interface User {
  id: string;
  email: string;
  username: string;
  nickname?: string;
  role: 'ADMIN' | 'USER';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserDto {
  email: string;
  password: string;
  username: string;
  nickname?: string;
  role?: 'ADMIN' | 'USER';
}

export interface UpdateUserDto {
  email?: string;
  username?: string;
  nickname?: string;
  role?: 'ADMIN' | 'USER';
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

export interface QueryUsersDto {
  page?: number;
  limit?: number;
  search?: string;
  role?: 'ADMIN' | 'USER';
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

// API 响应类型
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// 错误类型
export interface ApiError {
  message: string;
  error?: string;
  statusCode: number;
}

// 文件上传类型
export interface FileUploadResponse {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  projectId?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

// 项目相关类型
export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectDto {
  name: string;
  description?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
  status?: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
}