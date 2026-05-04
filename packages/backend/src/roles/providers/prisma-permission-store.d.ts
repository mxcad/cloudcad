import { DatabaseService } from '../../database/database.service';
import { SystemPermission, ProjectPermission } from '../../common/enums/permissions.enum';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { RoleInheritanceService } from '../../common/services/role-inheritance.service';
import { IPermissionStore } from '../../common/interfaces/permission-store.interface';
export declare class PrismaPermissionStore implements IPermissionStore {
    private readonly prisma;
    private readonly cacheService;
    private readonly roleInheritanceService;
    private readonly logger;
    constructor(prisma: DatabaseService, cacheService: PermissionCacheService, roleInheritanceService: RoleInheritanceService);
    getUserSystemPermissions(userId: string): Promise<SystemPermission[]>;
    checkSystemPermission(userId: string, permission: SystemPermission): Promise<boolean>;
    getUserProjectPermissions(userId: string, projectId: string): Promise<ProjectPermission[]>;
    checkProjectPermission(userId: string, projectId: string, permission: ProjectPermission): Promise<boolean>;
    getUserProjectRole(userId: string, projectId: string): Promise<string | null>;
    isProjectOwner(userId: string, projectId: string): Promise<boolean>;
    clearUserCache(userId: string): Promise<void>;
    clearProjectCache(projectId: string): Promise<void>;
}
//# sourceMappingURL=prisma-permission-store.d.ts.map