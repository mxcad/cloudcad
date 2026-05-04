import { EventEmitter2 } from '@nestjs/event-emitter';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { UserCleanupService } from '../common/services/user-cleanup.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { IUserService, ICreatedUser, IUserDetail, IUserActionResponse } from '../common/interfaces/user-service.interface';
import { ISmsVerificationService, IEmailVerificationService } from '../common/interfaces/verification.interface';
import { IPasswordHasher } from './interfaces/password-hasher.interface';
import { IAccountVerificationStrategy } from './interfaces/account-verification-strategy.interface';
export declare class UsersService implements IUserService {
    private readonly prisma;
    private readonly permissionCacheService;
    private readonly userCleanupService;
    private readonly configService;
    private readonly runtimeConfigService;
    private readonly passwordHasher;
    private readonly verificationStrategies;
    private readonly smsVerificationService;
    private readonly emailVerificationService;
    private readonly eventEmitter;
    private readonly logger;
    constructor(prisma: DatabaseService, permissionCacheService: PermissionCacheService, userCleanupService: UserCleanupService, configService: ConfigService, runtimeConfigService: RuntimeConfigService, passwordHasher: IPasswordHasher, verificationStrategies: IAccountVerificationStrategy[], smsVerificationService: ISmsVerificationService, emailVerificationService: IEmailVerificationService, eventEmitter: EventEmitter2);
    /**
     * 创建用户（包含私人空间创建）
     */
    create(createUserDto: CreateUserDto): Promise<ICreatedUser>;
    /**
     * 查询用户列表
     */
    findAll(query: QueryUsersDto, userId?: string): Promise<{
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
    /**
     * 根据 ID 查询用户（IUserService.findById）
     */
    findById(id: string): Promise<IUserDetail>;
    /**
     * 根据 ID 查询用户（控制器路由）
     */
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
    /**
     * findById 和 findOne 的内部实现
     */
    private findByIdInternal;
    /**
     * 根据邮箱查询用户
     */
    findByEmail(email: string): Promise<IUserDetail>;
    /**
     * 根据邮箱查询用户（包含密码，用于登录验证）
     */
    findByEmailWithPassword(email: string): Promise<{
        role: {
            name: string;
            id: string;
            description: string | null;
            isSystem: boolean;
            permissions: {
                permission: import("@prisma/client").$Enums.Permission;
            }[];
        };
        password: string | null;
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
    } | null>;
    /**
     * 更新用户
     */
    update(id: string, updateUserDto: UpdateUserDto): Promise<ICreatedUser>;
    /**
     * 软删除用户（管理员操作）
     * 设置 deletedAt 后，用户进入冷静期，30天后由 UserCleanupService 清理数据
     */
    softDelete(id: string): Promise<{
        message: string;
    }>;
    /**
     * 立即注销用户（管理员操作）
     * 清理用户数据后直接物理删除用户记录，无法恢复
     */
    deleteImmediately(id: string): Promise<{
        message: string;
    }>;
    /**
     * 恢复用户（清除 deletedAt，冷静期内可恢复）
     */
    restore(id: string): Promise<IUserActionResponse>;
    /**
     * 物理删除用户（保留方法，暂不使用）
     */
    remove(id: string): Promise<{
        message: string;
    }>;
    /**
     * 注销用户账户（IUserService.deactivate）
     * 支持多种验证方式：密码、手机验证码、邮箱验证码、微信扫码
     * 使用策略模式委派各验证方式
     */
    deactivate(userId: string, password?: string, phoneCode?: string, emailCode?: string, wechatConfirm?: string): Promise<IUserActionResponse>;
    /**
     * 恢复已注销账户（冷静期内自助恢复）
     */
    restoreAccount(userId: string, verificationMethod: 'password' | 'phoneCode' | 'emailCode', code: string): Promise<{
        message: string;
    }>;
    /**
     * 验证邮箱验证码（复用邮箱验证服务）
     */
    private verifyEmailCode;
    /**
     * 更新用户状态
     */
    updateStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'): Promise<{
        role: {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            parentId: string | null;
            category: import("@prisma/client").$Enums.RoleCategory;
            level: number;
            isSystem: boolean;
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
    /**
     * 验证密码
     */
    validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean>;
    /**
     * 修改密码
     * - 有密码用户：需要验证旧密码
     * - 无密码用户（手机/微信自动注册）：可以直接设置密码
     */
    changePassword(userId: string, oldPassword: string | undefined, newPassword: string): Promise<{
        message: string;
    }>;
    /**
     * 获取用户仪表盘统计数据
     */
    getDashboardStats(userId: string): Promise<{
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
    /**
     * 获取 restoreAccount 用的前提条件错误提示
     */
    private getRestorePrerequisiteError;
    /**
     * 获取 restoreAccount 用的验证失败提示
     */
    private getRestoreVerifyFailedError;
    /**
     * 获取验证前提条件错误的提示信息（deactivate 用）
     */
    private getPrerequisiteError;
    /**
     * 获取验证失败的提示信息
     */
    private getVerifyFailedError;
}
//# sourceMappingURL=users.service.d.ts.map