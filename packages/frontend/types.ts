export enum Permission {
  // System
  VIEW_DASHBOARD = 'VIEW_DASHBOARD',
  MANAGE_USERS = 'MANAGE_USERS',
  MANAGE_ROLES = 'MANAGE_ROLES',

  // Projects
  PROJECT_CREATE = 'PROJECT_CREATE',
  PROJECT_DELETE = 'PROJECT_DELETE',
  PROJECT_VIEW_ALL = 'PROJECT_VIEW_ALL', // Admin can view all projects regardless of membership

  // Assets
  LIBRARY_MANAGE = 'LIBRARY_MANAGE', // Create/Delete libraries
  ASSET_UPLOAD = 'ASSET_UPLOAD',
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem?: boolean; // Cannot be deleted if true
}

export interface User {
  id: string;
  name: string;
  email: string;
  roleId: string; // References Role.id
  avatar: string;
  usedStorage: number; // in bytes
  totalStorage: number; // in bytes
}

export type FileType = 'folder' | 'image' | 'cad' | 'font' | 'block' | 'pdf';

export interface FileNode {
  id: string;
  parentId: string | null;
  name: string;
  type: FileType;
  size: number; // in bytes
  updatedAt: string;
  ownerId: string;
  shared: boolean;
  shareLink?: string;
  thumbnail?: string;
  deletedAt?: string; // Timestamp if in trash, undefined otherwise
  // Access Control for Root Folders (Projects)
  allowedUserIds?: string[]; // If empty/undefined, public to all authorized users
}

export interface Library {
  id: string;
  name: string;
  type: 'block' | 'font';
  description: string;
  coverUrl?: string;
  itemCount: number;
  createdAt: string;
  allowedUserIds?: string[]; // Access control
}

export interface Asset {
  id: string;
  libraryId: string;
  name: string;
  category: 'block' | 'font';
  url: string;
  tags: string[];
  size: number;
}

export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB
