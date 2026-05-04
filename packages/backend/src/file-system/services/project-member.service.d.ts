import { DatabaseService } from '../../database/database.service';
import { FileSystemPermissionService } from '../file-system-permission.service';
import { AuditLogService } from '../../audit/audit-log.service';
export declare class ProjectMemberService {
    private readonly prisma;
    private readonly permissionService;
    private readonly auditLogService;
    private readonly logger;
    constructor(prisma: DatabaseService, permissionService: FileSystemPermissionService, auditLogService: AuditLogService);
    getProjectMembers(projectId: string): Promise<{
        id: string;
        email: string | null;
        username: string;
        nickname: string | null;
        avatar: string | null;
        projectRoleId: string;
        projectRoleName: string;
        joinedAt: Date;
    }[]>;
    addProjectMember(projectId: string, userId: string, projectRoleId: string, operatorId: string): Promise<{
        user: {
            id: string;
            email: string | null;
            username: string;
            nickname: string | null;
            avatar: string | null;
        };
        projectRole: {
            permissions: {
                permission: import("@prisma/client").$Enums.ProjectPermission;
            }[];
        } & {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            isSystem: boolean;
            projectId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        projectId: string;
        projectRoleId: string;
    }>;
    updateProjectMember(projectId: string, userId: string, projectRoleId: string, operatorId: string): Promise<{
        user: {
            id: string;
            email: string | null;
            username: string;
            nickname: string | null;
            avatar: string | null;
        };
        projectRole: {
            permissions: {
                permission: import("@prisma/client").$Enums.ProjectPermission;
            }[];
        } & {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            isSystem: boolean;
            projectId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        projectId: string;
        projectRoleId: string;
    }>;
    removeProjectMember(projectId: string, userId: string, operatorId: string): Promise<{
        message: string;
    }>;
    transferProjectOwnership(projectId: string, newOwnerId: string, currentOwnerId: string): Promise<{
        message: string;
    }>;
    batchAddProjectMembers(projectId: string, members: Array<{
        userId: string;
        projectRoleId: string;
    }>): Promise<{
        message: string;
        addedCount: number;
        failedCount: number;
        errors: Array<{
            userId: string;
            error: string;
        }>;
    }>;
    batchUpdateProjectMembers(projectId: string, updates: Array<{
        userId: string;
        projectRoleId: string;
    }>): Promise<{
        message: string;
        updatedCount: number;
        failedCount: number;
        errors: Array<{
            userId: string;
            error: string;
        }>;
    }>;
}
//# sourceMappingURL=project-member.service.d.ts.map