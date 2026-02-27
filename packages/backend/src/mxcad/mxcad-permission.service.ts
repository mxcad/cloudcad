import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface MxCadContext {
  nodeId?: string;
  userId?: string;
  userRole?: string;
}

@Injectable()
export class MxCadPermissionService {
  private readonly logger = new Logger(MxCadPermissionService.name);

  constructor(private readonly prisma: DatabaseService) {}

  /**
   * 验证上传权限
   */
  async validateUploadPermission(context: MxCadContext): Promise<boolean> {
    // 必须有用户身份验证（通过JWT token确认）
    if (!context.userId) {
      throw new UnauthorizedException('用户未认证，请先登录');
    }

    // 必须有节点信息
    if (!context.nodeId) {
      throw new BadRequestException('缺少节点信息');
    }

    this.logger.debug(
      `开始检查权限: userId=${context.userId}, nodeId=${context.nodeId}`
    );

    // 获取 nodeId 对应的节点信息（包括已删除的）
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: context.nodeId },
      select: {
        id: true,
        ownerId: true,
        parentId: true,
        isRoot: true,
        name: true,
        deletedAt: true,
      },
    });

    this.logger.debug(`节点信息: ${JSON.stringify(node)}`);

    if (!node) {
      throw new BadRequestException(`节点不存在: ${context.nodeId}`);
    }

    if (node.deletedAt) {
      throw new BadRequestException(
        `节点已被删除: ${node.name} (${context.nodeId}), 删除时间: ${node.deletedAt}`
      );
    }

    // 使用当前节点的父节点作为目标父节点
    // 如果当前节点是项目根目录（没有父节点），则使用当前节点本身
    const targetNodeId = node.parentId || node.id;

    this.logger.debug(
      `目标节点: ${targetNodeId} (节点: ${node.name})`
    );

    // 1. 检查用户是否是目标节点所有者
    const targetNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: targetNodeId, deletedAt: null },
      select: { id: true, ownerId: true, parentId: true, isRoot: true, name: true },
    });

    if (targetNode?.ownerId === context.userId) {
      this.logger.debug('用户是目标节点所有者，允许上传');
      return true;
    }

    // 2. 检查用户是否有项目成员权限
    const projectRootId = targetNode?.isRoot 
      ? targetNode.id 
      : await this.findProjectRootId(targetNode?.parentId ?? undefined);
    if (projectRootId) {
      const isProjectMember = await this.checkProjectMember(context.userId, projectRootId);
      if (isProjectMember) {
        this.logger.debug('用户是项目成员，允许上传');
        return true;
      }
    }

    // 3. 检查用户是否有项目根目录的访问权限（递归向上查找）
    if (targetNode && !targetNode.isRoot && targetNode.parentId) {
      this.logger.debug(
        `目标节点不是根目录，检查父节点权限: parentId=${targetNode.parentId}`
      );

      // 递归查找项目根目录
      let currentNode = targetNode;
      let depth = 0;
      const maxDepth = 10; // 防止无限循环

      while (
        currentNode &&
        !currentNode.isRoot &&
        currentNode.parentId &&
        depth < maxDepth
      ) {
        depth++;
        const parentNode = await this.prisma.fileSystemNode.findUnique({
          where: { id: currentNode.parentId },
          select: {
            id: true,
            isRoot: true,
            parentId: true,
            ownerId: true,
            name: true,
          },
        });

        this.logger.debug(
          `检查父节点 (深度${depth}): ${JSON.stringify(parentNode)}`
        );

        if (!parentNode) break;

        // 检查用户是否是该节点的所有者
        if (parentNode.ownerId === context.userId) {
          this.logger.debug('用户是父节点所有者，允许上传');
          return true;
        }

        currentNode = parentNode;
      }

      // 递归深度达到限制时，拒绝访问
      if (depth >= maxDepth) {
        this.logger.error(
          `达到最大递归深度 (${maxDepth})，拒绝访问以防止绕过权限检查`
        );
        throw new ForbiddenException('权限验证失败：目录层级过深，无法验证权限');
      }
    }

    this.logger.warn(
      `权限检查失败: 用户 ${context.userId} 没有任何访问权限`
    );
    throw new ForbiddenException('您没有该节点的访问权限，无法上传文件');
  }

  /**
   * 查找项目根目录 ID
   * @param nodeId 节点 ID
   * @returns 项目根目录 ID，如果找不到返回 null
   */
  private async findProjectRootId(nodeId: string | undefined): Promise<string | null> {
    if (!nodeId) return null;

    let currentNodeId: string | undefined = nodeId;
    let depth = 0;
    const maxDepth = 10;

    while (currentNodeId && depth < maxDepth) {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: currentNodeId, deletedAt: null },
        select: { id: true, isRoot: true, parentId: true },
      });

      if (!node) break;

      if (node.isRoot) {
        return node.id;
      }

      currentNodeId = node.parentId ?? undefined;
      depth++;
    }

    return null;
  }

  /**
   * 检查用户是否是项目成员
   * @param userId 用户 ID
   * @param projectRootId 项目根目录 ID
   * @returns 是否是项目成员
   */
  private async checkProjectMember(userId: string, projectRootId: string): Promise<boolean> {
    try {
      // 检查 ProjectMember 表中是否有记录
      const member = await this.prisma.projectMember.findFirst({
        where: {
          userId: userId,
          projectId: projectRootId,
        },
      });

      return !!member;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`检查项目成员失败: ${err.message}`);
      return false;
    }
  }

  /**
   * 验证文件访问权限
   */
  async validateFileAccess(
    context: MxCadContext,
    fileNodeId: string
  ): Promise<boolean> {
    // 如果没有用户信息，允许匿名访问（用于 MxCAD-App 文件访问）
    if (!context.userId) {
      return true;
    }

    // 检查文件所有者
    const fileNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: fileNodeId },
    });

    if (!fileNode) {
      throw new BadRequestException('文件不存在');
    }

    // 如果是文件所有者，允许访问
    if (fileNode.ownerId === context.userId) {
      return true;
    }

    throw new ForbiddenException('您无权限访问该文件');
  }
}