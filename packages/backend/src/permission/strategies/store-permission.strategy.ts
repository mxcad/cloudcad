import { Injectable, Optional, Inject } from '@nestjs/common';
import { SystemPermission } from '../../common/enums/permissions.enum';
import { IPERMISSION_STORE, IPermissionStore } from '../../common/interfaces/permission-store.interface';

export const ISTORE_PERMISSION_STRATEGY = 'IStorePermissionStrategy';

export interface IStorePermissionStrategy {
  checkSystemPermission(userId: string, permission: SystemPermission): Promise<boolean | null>;
  checkSystemPermissionsBatch(userId: string, permissions: SystemPermission[]): Promise<Map<SystemPermission, boolean> | null>;
  clearUserCache(userId: string): Promise<boolean>;
}

@Injectable()
export class StorePermissionStrategy implements IStorePermissionStrategy {
  constructor(
    @Optional() @Inject(IPERMISSION_STORE)
    private readonly permissionStore?: IPermissionStore,
  ) {}

  isEnabled(): boolean {
    return !!this.permissionStore;
  }

  async checkSystemPermission(
    userId: string,
    permission: SystemPermission,
  ): Promise<boolean | null> {
    if (!this.permissionStore) return null;
    return this.permissionStore.checkSystemPermission(userId, permission);
  }

  async checkSystemPermissionsBatch(
    userId: string,
    permissions: SystemPermission[],
  ): Promise<Map<SystemPermission, boolean> | null> {
    if (!this.permissionStore) return null;

    const userPermissions = await this.permissionStore.getUserSystemPermissions(userId);
    const results = new Map<SystemPermission, boolean>();
    for (const permission of permissions) {
      results.set(permission, userPermissions.includes(permission));
    }
    return results;
  }

  async clearUserCache(userId: string): Promise<boolean> {
    if (!this.permissionStore) return false;
    await this.permissionStore.clearUserCache(userId);
    return true;
  }


}
