import type { SystemPermission} from '../../common/enums/permissions.enum';
import type { PermissionContext } from '../../common/utils/permission.utils';

export interface Role {
  id: string;
  name: string;
  description?: string;
  category?: string;
  isSystem: boolean;
  permissions?: { permission: SystemPermission }[];
}

export interface UserWithPermissions {
  id: string;
  email: string;
  username: string;
  nickname?: string;
  avatar?: string;
  role: Role;
  status: string;
}

export const IPERMISSION_SERVICE = 'IPermissionService';

export interface IPermissionService {
  checkSystemPermission(userId: string, permission: SystemPermission): Promise<boolean>;
  getUserPermissions(user: UserWithPermissions): Promise<SystemPermission[]>;
  hasRole(user: UserWithPermissions, roleNames: string[]): boolean;
  checkSystemPermissionWithContext(userId: string, permission: SystemPermission, context: PermissionContext): Promise<boolean>;
  checkSystemPermissionsBatch(userId: string, permissions: SystemPermission[]): Promise<Map<SystemPermission, boolean>>;
  clearUserCache(userId: string): Promise<void>;
}
