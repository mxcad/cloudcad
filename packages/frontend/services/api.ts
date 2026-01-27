// 导出新的 API 服务
export { apiService } from './apiService';
export {
  authApi,
  usersApi,
  projectsApi,
  filesApi,
  fontsApi,
  rolesApi,
  galleryApi,
} from './apiService';

// 保留原有的 Mock API 以备后用
import {
  MAX_UPLOAD_SIZE,
  type Role,
  type User,
} from '../types';
import { mockDb } from './mockDb';

export const mockApi = {
  auth: {
    getCurrentUser: () => mockDb.getCurrentUser(),
    getRole: () => mockDb.getCurrentUserRole(),
  },
  files: {
    list: (parentId: string | null) => mockDb.getFiles(parentId),
    getTrash: () => mockDb.getTrash(),
    createFolder: (parentId: string | null, name: string) =>
      mockDb.createFolder(parentId, name),
    upload: async (parentId: string | null, file: File) => {
      if (file.size > MAX_UPLOAD_SIZE) {
        throw new Error(
          `文件大小超过限制 (${MAX_UPLOAD_SIZE / 1024 / 1024}MB)`
        );
      }
      return mockDb.uploadFile(parentId, file);
    },
    rename: (id: string, name: string) => mockDb.renameFile(id, name),
    delete: (id: string) => mockDb.deleteFile(id),
    restore: (id: string) => mockDb.restoreFile(id),
    permanentlyDelete: (id: string) => mockDb.permanentlyDelete(id),
    emptyTrash: () => mockDb.emptyTrash(),
    toggleShare: (id: string) => mockDb.toggleShare(id),
    updateMembers: (id: string, userIds: string[]) =>
      mockDb.updateProjectMembers(id, userIds),
  },
  libraries: {
    list: (type: 'block' | 'font') => mockDb.getLibraries(type),
    get: (id: string) => mockDb.getLibraryById(id),
    create: (name: string, type: 'block' | 'font', description: string) =>
      mockDb.createLibrary(name, type, description),
    updateMembers: (id: string, userIds: string[]) =>
      mockDb.updateLibraryMembers(id, userIds),
  },
  assets: {
    listByLibrary: (libraryId: string) => mockDb.getAssetsByLibrary(libraryId),
    add: async (libraryId: string, file: File, category: 'block' | 'font') => {
      if (file.size > MAX_UPLOAD_SIZE) {
        throw new Error(
          `文件大小超过限制 (${MAX_UPLOAD_SIZE / 1024 / 1024}MB)`
        );
      }
      return mockDb.addAsset(libraryId, file, category);
    },
  },
  users: {
    list: () => mockDb.getUsers(),
    create: (data: Partial<User>) => mockDb.createUser(data),
    update: (id: string, data: Partial<User>) => mockDb.updateUser(id, data),
    delete: (id: string) => mockDb.deleteUser(id),
  },
  roles: {
    list: () => mockDb.getRoles(),
    create: (name: string, description: string, permissions: string[]) =>
      mockDb.createRole(name, description, permissions),
    update: (id: string, data: Partial<Role>) => mockDb.updateRole(id, data),
    delete: (id: string) => mockDb.deleteRole(id),
  },
  dashboard: {
    getStats: () => mockDb.getStats(),
  },
};
