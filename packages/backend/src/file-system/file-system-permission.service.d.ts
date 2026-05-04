import { ProjectPermission, ProjectRole } from '../common/enums/permissions.enum';
import { ProjectPermissionService } from '../roles/project-permission.service';
import { DatabaseService } from '../database/database.service';
import { FileTreeService } from './services/file-tree.service';
/**
 * 文件系统权限服务
 *
 * 功能：
 * 1. 检查文件系统节点权限
 * 2. 管理项目成员权限
 * 3. 使用项目权限系统进行权限检查
 */
export declare class FileSystemPermissionService {
    private readonly prisma;
    private readonly projectPermissionService;
    private readonly fileTreeService;
    private readonly logger;
    constructor(prisma: DatabaseService, projectPermissionService: ProjectPermissionService, fileTreeService: FileTreeService);
    /**
     * 检查节点权限
     *
     * @param userId 用户 ID
     * @param nodeId 节点 ID
     * @param requiredPermission 所需权限
     * @returns 是否具有权限
     */
    checkNodePermission(userId: string, nodeId: string, requiredPermission: ProjectPermission): Promise<boolean>;
    /**
     * 获取用户在节点上的访问角色
     *
     * @param userId 用户 ID
     * @param nodeId 节点 ID
     * @returns 访问角色
     */
    getNodeAccessRole(userId: string, nodeId: string): Promise<string | null>;
    /**
     * 检查节点是否属于公共资源库
     * @param nodeId 节点 ID
     * @returns 是否属于公共资源库
     */
    isLibraryNode(nodeId: string): Promise<boolean>;
    /**
     * 检查用户是否具有指定角色之一
     *
     * @param userId 用户 ID
     * @param nodeId 节点 ID
     * @param roles 角色列表
     * @returns 是否具有指定角色
     */
    hasNodeAccessRole(userId: string, nodeId: string, roles: ProjectRole[]): Promise<boolean>;
    /**
     * 设置项目成员权限
     *
     * @param projectId 项目 ID
     * @param userId 用户 ID
     * @param projectRoleId 项目角色 ID
     */
    setProjectMemberRole(projectId: string, userId: string, projectRoleId: string): Promise<void>;
    /**
     * 移除项目成员
     *
     * @param projectId 项目 ID
     * @param userId 用户 ID
     */
    removeProjectMember(projectId: string, userId: string): Promise<void>;
    /**
     * 获取项目成员列表
     *
     * @param projectId 项目 ID
     * @returns 项目成员列表
     */
    getProjectMembers(projectId: string): Promise<({
        user: {
            id: string;
            email: string | null;
            username: string;
            nickname: string | null;
            avatar: string | null;
        };
        projectRole: {
            name: string;
            id: string;
            description: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        projectId: string;
        projectRoleId: string;
    })[]>;
    /**
     * 批量添加项目成员
     *
     * @param projectId 项目 ID
     * @param members 成员列表
     */
    batchAddProjectMembers(projectId: string, members: Array<{
        userId: string;
        projectRoleId: string;
    }>): Promise<void>;
    /**
     * 批量更新项目成员角色
     *
     * @param projectId 项目 ID
     * @param updates 更新列表
     */
    batchUpdateProjectMembers(projectId: string, updates: Array<{
        userId: string;
        projectRoleId: string;
    }>): Promise<void>;
    /**
     * 清除节点权限缓存
     * 注意：此方法会清除项目中所有成员的缓存
     *
     * @param nodeId 节点 ID（项目根节点 ID）
     */
    clearNodeCache(nodeId: string): Promise<void>;
    /**
     * 清除特定用户在特定项目的缓存
     *
     * @param userId 用户 ID
     * @param projectId 项目 ID
     */
    clearUserProjectCache(userId: string, projectId: string): Promise<void>;
    /**
     * 清除用户权限缓存
     *
     * @param userId 用户 ID
     * @param projectId 项目 ID（可选）
     */
    clearUserCache(userId: string, projectId?: string): Promise<void>;
}
//# sourceMappingURL=file-system-permission.service.d.ts.map