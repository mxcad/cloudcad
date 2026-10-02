import type { SystemPermission} from '../../common/enums/permissions.enum';
import type { PermissionContext } from '../../common/utils/permission.utils';

export const IPERMISSION_SERVICE = 'IPermissionService';

export interface IPermissionService {
  checkSystemPermission(userId: string, permission: SystemPermission): Promise<boolean>;
  checkSystemPermissionWithContext(userId: string, permission: SystemPermission, context: PermissionContext): Promise<boolean>;
  clearUserCache(userId: string): Promise<void>;
}
