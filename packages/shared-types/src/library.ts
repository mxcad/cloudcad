/**
 * 资源库相关类型定义
 */

import { LibraryType, AssetStatus, FontStatus } from './enums';

export interface Library {
  /** 资源库ID */
  id: string;
  /** 资源库名称 */
  name: string;
  /** 资源库类型 */
  type: LibraryType;
  /** 资源库描述 */
  description: string;
  /** 封面URL */
  coverUrl?: string;
  /** 资源数量 */
  itemCount: number;
  /** 创建时间 */
  createdAt: string;
  /** 允许访问的用户ID列表 */
  allowedUserIds?: string[];
}

export interface CreateLibraryDto {
  /** 资源库名称 */
  name: string;
  /** 资源库类型 */
  type: LibraryType;
  /** 资源库描述 */
  description: string;
}

export interface UpdateLibraryDto {
  /** 资源库名称 */
  name?: string;
  /** 资源库描述 */
  description?: string;
  /** 允许访问的用户ID列表 */
  allowedUserIds?: string[];
}

export interface Asset {
  /** 资源ID */
  id: string;
  /** 资源库名称 */
  name: string;
  /** 资源描述 */
  description?: string;
  /** 所属资源库ID */
  libraryId: string;
  /** 资源分类 */
  category: 'block' | 'font';
  /** 资源路径 */
  path: string;
  /** 缩略图URL */
  thumbnail?: string;
  /** 资源大小 */
  size: number;
  /** MIME类型 */
  mimeType: string;
  /** 资源状态 */
  status: AssetStatus;
  /** 资源标签 */
  tags: string[];
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

export interface CreateAssetDto {
  /** 资源名称 */
  name: string;
  /** 资源描述 */
  description?: string;
  /** 所属资源库ID */
  libraryId: string;
  /** 资源文件 */
  file: Blob;
  /** 资源标签 */
  tags?: string[];
}

export interface UpdateAssetDto {
  /** 资源名称 */
  name?: string;
  /** 资源描述 */
  description?: string;
  /** 资源状态 */
  status?: AssetStatus;
  /** 资源标签 */
  tags?: string[];
}

export interface Font {
  /** 字体ID */
  id: string;
  /** 字体名称 */
  name: string;
  /** 字体族名 */
  family: string;
  /** 字体路径 */
  path: string;
  /** 字体大小 */
  size: number;
  /** 字体状态 */
  status: FontStatus;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

export interface CreateFontDto {
  /** 字体名称 */
  name: string;
  /** 字体族名 */
  family: string;
  /** 字体文件 */
  file: Blob;
}

export interface UpdateFontDto {
  /** 字体名称 */
  name?: string;
  /** 字体族名 */
  family?: string;
  /** 字体状态 */
  status?: FontStatus;
}