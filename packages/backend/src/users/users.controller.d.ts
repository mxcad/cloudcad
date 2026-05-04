import { DatabaseService } from '../database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { RestoreAccountDto } from './dto/restore-account.dto';
import { ChangePasswordDto, ChangePasswordResponseDto } from '../auth/dto/password-reset.dto';
import type { AuthenticatedRequest } from '../common/types/request.types';
export declare class UsersController {
    private readonly usersService;
    private readonly databaseService;
    constructor(usersService: UsersService, databaseService: DatabaseService);
    create(createUserDto: CreateUserDto): Promise<import("../common/interfaces/user-service.interface").ICreatedUser>;
    findAll(query: QueryUsersDto): Promise<{
        users: {
            role: {
                name: string;
                id: string;
                description: string | null;
                isSystem: boolean;
                permissions: {
                    permission: import("@prisma/client").$Enums.Permission;
                }[];
            };
            id: string;
            email: string | null;
            username: string;
            nickname: string | null;
            avatar: string | null;
            phone: string | null;
            phoneVerified: boolean;
            status: import("@prisma/client").$Enums.UserStatus;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
        }[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    searchByEmail(email: string): Promise<import("../common/interfaces/user-service.interface").IUserDetail>;
    searchUsers(query: QueryUsersDto, req: AuthenticatedRequest): Promise<{
        users: {
            role: {
                name: string;
                id: string;
                description: string | null;
                isSystem: boolean;
                permissions: {
                    permission: import("@prisma/client").$Enums.Permission;
                }[];
            };
            id: string;
            email: string | null;
            username: string;
            nickname: string | null;
            avatar: string | null;
            phone: string | null;
            phoneVerified: boolean;
            status: import("@prisma/client").$Enums.UserStatus;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
        }[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    getProfile(req: AuthenticatedRequest): Promise<{
        hasPassword: boolean;
        role: {
            name: string;
            id: string;
            description: string | null;
            isSystem: boolean;
            permissions: {
                permission: import("@prisma/client").$Enums.Permission;
            }[];
        };
        id: string;
        email: string | null;
        username: string;
        nickname: string | null;
        avatar: string | null;
        phone: string | null;
        phoneVerified: boolean;
        status: import("@prisma/client").$Enums.UserStatus;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getDashboardStats(req: AuthenticatedRequest): Promise<{
        projectCount: number;
        totalFiles: number;
        todayUploads: number;
        fileTypeStats: {
            dwg: number;
            dxf: number;
            other: number;
        };
        storage: {
            used: number;
            total: number;
            remaining: number;
            usagePercent: number;
        };
    }>;
    updateProfile(req: AuthenticatedRequest, updateUserDto: UpdateUserDto): Promise<import("../common/interfaces/user-service.interface").ICreatedUser>;
    findOne(id: string): Promise<{
        hasPassword: boolean;
        role: {
            name: string;
            id: string;
            description: string | null;
            isSystem: boolean;
            permissions: {
                permission: import("@prisma/client").$Enums.Permission;
            }[];
        };
        id: string;
        email: string | null;
        username: string;
        nickname: string | null;
        avatar: string | null;
        phone: string | null;
        phoneVerified: boolean;
        status: import("@prisma/client").$Enums.UserStatus;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: string, updateUserDto: UpdateUserDto): Promise<import("../common/interfaces/user-service.interface").ICreatedUser>;
    remove(id: string): Promise<{
        message: string;
    }>;
    restore(id: string): Promise<import("../common/interfaces/user-service.interface").IUserActionResponse>;
    deleteImmediately(id: string): Promise<{
        message: string;
    }>;
    deactivateAccount(req: AuthenticatedRequest, dto: DeactivateAccountDto): Promise<import("../common/interfaces/user-service.interface").IUserActionResponse>;
    restoreAccount(req: AuthenticatedRequest, dto: RestoreAccountDto): Promise<{
        message: string;
    }>;
    changePassword(req: AuthenticatedRequest, dto: ChangePasswordDto): Promise<ChangePasswordResponseDto>;
}
//# sourceMappingURL=users.controller.d.ts.map