import { OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
/**
 * 角色缓存服务
 * 在应用启动时从数据库加载系统角色，避免硬编码
 */
export declare class RolesCacheService implements OnModuleInit {
    private readonly prisma;
    private readonly logger;
    private systemRoles;
    constructor(prisma: DatabaseService);
    onModuleInit(): Promise<void>;
    /**
     * 从数据库加载系统角色
     */
    private loadSystemRoles;
    /**
     * 根据角色名称获取角色ID
     */
    getRoleId(roleName: string): string | undefined;
    /**
     * 获取所有系统角色名称
     */
    getSystemRoleNames(): string[];
    /**
     * 检查是否是系统角色
     */
    isSystemRole(roleName: string): boolean;
    /**
     * 刷新缓存（用于测试或动态更新）
     */
    refresh(): Promise<void>;
}
//# sourceMappingURL=roles-cache.service.d.ts.map