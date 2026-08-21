import type { ProjectPermission, ProjectRole } from '../../common/enums/permissions.enum';

export const IPROJECT_PERMISSION_SERVICE = 'IProjectPermissionService';

export interface IProjectPermissionService {
  checkPermission(userId: string, projectId: string, permission: ProjectPermission): Promise<boolean>;
  isProjectOwner(userId: string, projectId: string): Promise<boolean>;
  getUserPermissions(userId: string, projectId: string): Promise<ProjectPermission[]>;
  getUserRole(userId: string, projectId: string): Promise<ProjectRole | null>;
  hasRole(userId: string, projectId: string, roleNames: ProjectRole[]): Promise<boolean>;
  isProjectMember(userId: string, projectId: string): Promise<boolean>;
  checkAnyPermission(userId: string, projectId: string, permissions: ProjectPermission[]): Promise<boolean>;
  checkAllPermissions(userId: string, projectId: string, permissions: ProjectPermission[]): Promise<boolean>;
  clearUserCache(userId: string, projectId: string): Promise<void>;
}
