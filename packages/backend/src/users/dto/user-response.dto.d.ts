import { UserStatus } from '@prisma/client';
import { StorageInfoDto } from '../../common/dto/storage-info.dto';
/**
 * 用户角色 DTO
 */
export declare class UserRoleDto {
    id: string;
    name: string;
    description?: string;
    isSystem: boolean;
}
/**
 * 用户响应 DTO
 */
export declare class UserResponseDto {
    id: string;
    email: string;
    username: string;
    nickname?: string;
    avatar?: string;
    phone?: string;
    status: UserStatus;
    role: UserRoleDto;
    hasPassword: boolean;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * 用户列表响应 DTO
 */
export declare class UserListResponseDto {
    users: UserResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
/**
 * 用户搜索结果 DTO
 */
export declare class UserSearchResultDto {
    id: string;
    email: string;
    username: string;
    nickname?: string;
    avatar?: string;
}
/**
 * 修改密码响应 DTO
 */
export declare class ChangePasswordResponseDto {
    message: string;
}
/**
 * 用户资料响应 DTO
 */
export declare class UserProfileResponseDto {
    id: string;
    email: string;
    username: string;
    nickname?: string;
    avatar?: string;
    status: UserStatus;
    role: UserRoleDto;
    hasPassword: boolean;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * 文件类型统计 DTO
 */
export declare class FileTypeStatsDto {
    dwg: number;
    dxf: number;
    other: number;
}
/**
 * 用户仪表盘统计 DTO
 */
export declare class UserDashboardStatsDto {
    projectCount: number;
    totalFiles: number;
    todayUploads: number;
    fileTypeStats: FileTypeStatsDto;
    storage: StorageInfoDto;
}
//# sourceMappingURL=user-response.dto.d.ts.map