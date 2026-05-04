import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { IUserService } from '../interfaces/user-service.interface';
/**
 * 系统初始化服务
 *
 * 功能：
 * 1. 检查是否为首次启动（无任何用户）
 * 2. 首次启动时自动创建所有系统默认角色和项目默认角色
 * 3. 首次启动时自动创建管理员账户
 * 4. 后续访问禁止注册
 */
export declare class InitializationService implements OnModuleInit {
    private readonly prisma;
    private readonly configService;
    private readonly userService?;
    private readonly logger;
    constructor(prisma: DatabaseService, configService: ConfigService, userService?: IUserService | undefined);
    /**
     * 模块初始化时执行
     * 优化：使用并行查询减少启动时间
     */
    onModuleInit(): Promise<void>;
    /**
     * 创建系统默认角色
     */
    private createSystemDefaultRoles;
    /**
     * 获取系统角色的关键权限（不能被取消的权限）
     */
    private getCriticalPermissions;
    /**
     * 创建项目默认角色
     * 权限定义来源于 DEFAULT_PROJECT_ROLE_PERMISSIONS（唯一来源）
     */
    private createProjectDefaultRoles;
    /**
     * 检查并创建初始管理员账户
     */
    private checkAndCreateInitialAdmin;
    /**
     * 确保所有用户都有私人空间
     * 用于处理历史数据迁移场景
     * 优化：使用批量操作减少数据库往返
     */
    private ensureAllUsersHavePersonalSpace;
    /**
     * 确保公共资源库存在
     * 创建公共图纸库和公共图块库
     * 优化：并行检查和创建
     */
    private ensurePublicLibraries;
    /**
     * 检查是否允许注册
     *
     * @returns 如果允许注册返回 true，否则返回 false
     */
    isRegistrationAllowed(): Promise<boolean>;
    /**
     * 检查是否为首次启动
     *
     * @returns 如果为首次启动返回 true，否则返回 false
     */
    isFirstStartup(): Promise<boolean>;
}
//# sourceMappingURL=initialization.service.d.ts.map