import { FileStatus, ProjectStatus } from "@prisma/client";
/**
 * 文件系统节点 DTO
 */
export declare class FileSystemNodeDto {
    id: string;
    name: string;
    description?: string;
    isFolder: boolean;
    isRoot: boolean;
    parentId?: string;
    path?: string;
    size?: number;
    mimeType?: string;
    fileHash?: string;
    fileStatus?: FileStatus;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
    ownerId: string;
    personalSpaceKey?: string;
    libraryKey?: string;
    childrenCount?: number;
    projectId?: string;
}
/**
 * 项目 DTO
 */
export declare class ProjectDto {
    id: string;
    name: string;
    description?: string;
    status: ProjectStatus;
    ownerId: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
    memberCount?: number;
}
/**
 * 项目成员 DTO
 */
export declare class ProjectMemberDto {
    id: string;
    email: string;
    username: string;
    nickname?: string;
    avatar?: string;
    projectRoleId: string;
    projectRoleName: string;
    joinedAt: Date;
}
/**
 * 统一分页列表响应 DTO - 所有列表接口都用这个格式
 */
export declare class NodeListResponseDto {
    nodes: FileSystemNodeDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
/**
 * 项目列表响应 DTO - 现在它只是 NodeListResponseDto 的别名
 */
export declare class ProjectListResponseDto extends NodeListResponseDto {
}
/**
 * 节点树响应 DTO
 */
export declare class NodeTreeResponseDto extends FileSystemNodeDto {
    children?: FileSystemNodeDto[];
}
/**
 * 回收站项目 DTO
 */
export declare class TrashItemDto {
    id: string;
    name: string;
    description?: string;
    isFolder: boolean;
    originalParentId: string;
    size?: number;
    mimeType?: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date;
    ownerId: string;
    projectId?: string;
}
/**
 * 回收站列表响应 DTO - 现在它也是 NodeListResponseDto 的别名
 */
export declare class TrashListResponseDto extends NodeListResponseDto {
}
/**
 * 项目内回收站响应 DTO - 现在它也是 NodeListResponseDto 的别名
 */
export declare class ProjectTrashResponseDto extends NodeListResponseDto {
}
/**
 * 操作成功响应 DTO
 */
export declare class OperationSuccessDto {
    message: string;
    nodeId?: string;
    success: boolean;
}
/**
 * 批量操作响应 DTO
 */
export declare class BatchOperationResponseDto {
    successCount: number;
    failedCount: number;
    successIds: string[];
    failedIds: string[];
    errors?: string[];
}
/**
 * 项目用户权限列表响应 DTO
 */
export declare class ProjectUserPermissionsDto {
    projectId: string;
    userId: string;
    permissions: string[];
}
/**
 * 权限检查结果响应 DTO
 */
export declare class PermissionCheckResponseDto {
    projectId: string;
    userId: string;
    permission: string;
    hasPermission: boolean;
}
//# sourceMappingURL=file-system-response.dto.d.ts.map