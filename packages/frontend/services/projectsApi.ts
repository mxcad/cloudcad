import { getApiClient } from './apiClient';
import type {
  CreateNodeDto,
  UpdateNodeDto,
  CreateProjectDto,
  MoveNodeDto,
  CopyNodeDto,
  CreateFolderDto,
} from '../types/api-client';

export const projectsApi = {
  // ========== 统一节点操作 ==========

  /**
   * 统一创建节点接口
   *
   * 规则：
   * - parentId 为空 → 创建项目
   * - parentId 有值 → 创建文件夹
   */
  createNode: (data: CreateNodeDto) =>
    getApiClient().FileSystemController_createNode(null, data),

  // ========== 项目操作（兼容旧 API） ==========

  list: () =>
    getApiClient().FileSystemController_getProjects(),

  getDeletedProjects: () =>
    getApiClient().FileSystemController_getDeletedProjects(),

  /**
   * 创建项目（兼容旧 API，内部调用 createNode）
   */
  create: (data: CreateProjectDto) =>
    getApiClient().FileSystemController_createProject(null, data),

  get: (projectId: string) =>
    getApiClient().FileSystemController_getProject({ projectId }),

  update: (projectId: string, data: CreateProjectDto) =>
    getApiClient().FileSystemController_updateProject({ projectId }, data),

  delete: (projectId: string, permanently: boolean = false) =>
    getApiClient().FileSystemController_deleteProject({ projectId, permanently }),

  // ========== 节点操作（兼容旧 API） ==========

  /**
   * 创建文件夹（兼容旧 API，内部调用 createNode）
   */
  createFolder: (parentId: string, data: CreateFolderDto) =>
    getApiClient().FileSystemController_createFolder({ parentId }, data),

  getNode: (nodeId: string) =>
    getApiClient().FileSystemController_getNode({ nodeId }),

  getChildren: (nodeId: string) =>
    getApiClient().FileSystemController_getChildren({ nodeId }),

  updateNode: (nodeId: string, data: UpdateNodeDto) =>
    getApiClient().FileSystemController_updateNode({ nodeId }, data),

  renameNode: (nodeId: string, data: { name: string }) =>
    getApiClient().FileSystemController_updateNode({ nodeId }, data),

  deleteNode: (nodeId: string, permanently: boolean = false) =>
    getApiClient().FileSystemController_deleteNode({ nodeId, permanently }),

  moveNode: (nodeId: string, targetParentId: string) => {
    const data: MoveNodeDto = { targetParentId };
    return getApiClient().FileSystemController_moveNode({ nodeId }, data);
  },

  copyNode: (nodeId: string, targetParentId: string) => {
    const data: CopyNodeDto = { targetParentId };
    return getApiClient().FileSystemController_copyNode({ nodeId }, data);
  },

  getStorageInfo: () =>
    getApiClient().FileSystemController_getStorageInfo(),

  getMembers: (projectId: string) =>
    getApiClient().FileSystemController_getProjectMembers({ projectId }),

  addMember: (projectId: string, data: { userId: string; projectRoleId: string }) =>
    getApiClient().FileSystemController_addProjectMember({ projectId }, data),

  removeMember: (projectId: string, userId: string) =>
    getApiClient().FileSystemController_removeProjectMember({ projectId, userId }),

  updateMember: (projectId: string, userId: string, data: { projectRoleId: string }) =>
    getApiClient().FileSystemController_updateProjectMember({ projectId, userId }, data),

  transferOwnership: (projectId: string, newOwnerId: string) =>
    getApiClient().FileSystemController_transferProjectOwnership({ projectId }, { newOwnerId }),

  // ========== 项目权限检查 ==========

  /**
   * 获取用户在项目中的所有权限
   */
  getPermissions: (projectId: string) =>
    getApiClient().FileSystemController_getUserProjectPermissions({ projectId }),

  /**
   * 检查用户是否具有特定权限
   */
  checkPermission: (projectId: string, permission: string) =>
    getApiClient().FileSystemController_checkProjectPermission({ projectId, permission }),

  /**
   * 获取用户在项目中的角色
   */
  getRole: (projectId: string) =>
    getApiClient().FileSystemController_getUserProjectRole({ projectId }),

  // ========== 项目内回收站 ==========

  /**
   * 获取项目内回收站内容
   */
  getProjectTrash: (projectId: string) =>
    getApiClient().FileSystemController_getProjectTrash({ projectId }),

  /**
   * 恢复已删除的节点
   */
  restoreNode: (nodeId: string) =>
    getApiClient().FileSystemController_restoreNode({ nodeId }),

  /**
   * 清空项目回收站
   */
  clearProjectTrash: (projectId: string) =>
    getApiClient().FileSystemController_clearProjectTrash({ projectId }),

  /**
   * 恢复项目
   */
  restoreProject: (projectId: string) =>
    getApiClient().FileSystemController_restoreTrashItems(null, { itemIds: [projectId] }),
};