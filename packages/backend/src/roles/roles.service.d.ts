import { DatabaseService } from '../database/database.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleDto } from './dto/role.dto';
import { RoleCategory } from '../common/enums/permissions.enum';
import { PermissionCacheService } from '../common/services/permission-cache.service';
/**
 * 角色管理服务
 *
 * 功能：
 * 1. 角色的增删改查
 * 2. 支持自定义角色
 * 3. 权限分配和移除
 * 4. 角色类别和级别管理
 */
export declare class RolesService {
    private readonly prisma;
    private readonly cacheService;
    private readonly logger;
    constructor(prisma: DatabaseService, cacheService: PermissionCacheService);
    /**
     * 获取所有角色
     */
    findAll(): Promise<RoleDto[]>;
    /**
     * 根据类别获取角色
     */
    findByCategory(category: RoleCategory): Promise<RoleDto[]>;
    /**
     * 根据 ID 获取角色
     */
    findOne(id: string): Promise<RoleDto>;
    /**
     * 创建角色
     */
    create(createRoleDto: CreateRoleDto): Promise<RoleDto>;
    /**
     * 更新角色
     */
    update(id: string, updateRoleDto: UpdateRoleDto): Promise<RoleDto>;
    /**
     * 删除角色
     */
    remove(id: string): Promise<void>;
    /**
     * 为角色分配权限
     */
    addPermissions(roleId: string, permissions: string[]): Promise<RoleDto>;
    /**
     * 从角色移除权限
     */
    removePermissions(roleId: string, permissions: string[]): Promise<RoleDto>;
    /**
     * 获取角色的所有权限（返回数据库存储的原始值：大写格式）
     */
    getRolePermissions(roleId: string): Promise<string[]>;
    /**
     * 验证权限是否有效（支持大写和小写格式）
     */
    private validatePermissions;
    /**
     * 将 Prisma Role 对象映射到 RoleDto
     * 返回数据库存储的原始权限值（大写格式）
     */
    private mapToRoleDto;
}
//# sourceMappingURL=roles.service.d.ts.map