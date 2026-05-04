import { SystemPermission, ProjectPermission } from '../enums/permissions.enum';
export declare const IPERMISSION_STORE: unique symbol;
export interface IPermissionStore {
    getUserSystemPermissions(userId: string): Promise<SystemPermission[]>;
    checkSystemPermission(userId: string, permission: SystemPermission): Promise<boolean>;
    getUserProjectPermissions(userId: string, projectId: string): Promise<ProjectPermission[]>;
    checkProjectPermission(userId: string, projectId: string, permission: ProjectPermission): Promise<boolean>;
    getUserProjectRole(userId: string, projectId: string): Promise<string | null>;
    isProjectOwner(userId: string, projectId: string): Promise<boolean>;
    clearUserCache(userId: string): Promise<void>;
    clearProjectCache(projectId: string): Promise<void>;
}
//# sourceMappingURL=permission-store.interface.d.ts.map