import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectPermissionService } from '../../roles/project-permission.service';
import { DatabaseService } from '../../database/database.service';
import { PermissionService } from '../services/permission.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
/**
 * 项目权限检查 Guard
 *
 * 功能：
 * 1. 检查用户是否具有所需的项目权限
 * 2. 支持 AND 和 OR 逻辑
 * 3. 自动从请求中提取用户信息和项目 ID
 * 4. 项目所有者自动通过所有权限检查
 * 5. **智能节点类型判断**：自动检测公开资源库节点并检查系统权限
 */
export declare class RequireProjectPermissionGuard implements CanActivate {
    private readonly reflector;
    private readonly projectPermissionService;
    private readonly systemPermissionService;
    private readonly prisma;
    private readonly fileTreeService;
    constructor(reflector: Reflector, projectPermissionService: ProjectPermissionService, systemPermissionService: PermissionService, prisma: DatabaseService, fileTreeService: FileTreeService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    /**
     * 从请求中提取节点ID
     *
     * 支持多种参数名：
     * - nodeId: 直接的节点ID
     * - parentId: 父节点ID（用于创建子节点等操作）
     */
    private extractNodeId;
    /**
     * 检查公开资源库权限
     */
    private checkLibraryPermission;
    /**
     * 从请求中提取项目ID
     *
     * 逻辑：
     * 1. 优先从 params/query/body 中获取 projectId
     * 2. 如果没有，则通过 nodeId 查找节点
     * 3. 如果节点是根节点（isRoot = true），nodeId 就是 projectId
     * 4. 如果节点不是根节点，返回节点的 projectId
     */
    private extractProjectId;
    /**
     * 直接通过节点 ID 获取项目 ID
     *
     * 逻辑：
     * 1. 查找节点
     * 2. 如果是根节点（isRoot = true），nodeId 就是 projectId
     * 3. 如果不是根节点，返回节点的 projectId
     * 4. 如果节点的 projectId 为 null，尝试递归查找父节点的 projectId
     */
    private extractProjectIdFromNode;
    /**
     * 检查权限
     */
    private checkPermissions;
}
//# sourceMappingURL=require-project-permission.guard.d.ts.map