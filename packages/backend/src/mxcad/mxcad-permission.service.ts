import {
  Injectable,
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

    console.log(`[validateUploadPermission] 开始检查权限: userId=${context.userId}, nodeId=${context.nodeId}`);

    // 获取 nodeId 对应的节点信息（包括已删除的）
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: context.nodeId },
      select: { id: true, ownerId: true, parentId: true, isRoot: true, name: true, deletedAt: true },
    });

    console.log(`[validateUploadPermission] 节点信息:`, node);

    if (!node) {
      throw new BadRequestException(`节点不存在: ${context.nodeId}`);
    }

    if (node.deletedAt) {
      throw new BadRequestException(`节点已被删除: ${node.name} (${context.nodeId}), 删除时间: ${node.deletedAt}`);
    }

    // 使用当前节点的父节点作为目标父节点
    // 如果当前节点是项目根目录（没有父节点），则使用当前节点本身
    const targetNodeId = node.parentId || node.id;

    console.log(`[validateUploadPermission] 目标节点: ${targetNodeId} (节点: ${node.name})`);

    // 1. 检查用户是否是目标节点所有者
    const targetNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: targetNodeId, deletedAt: null },
      select: { ownerId: true, parentId: true, isRoot: true, name: true },
    });

    if (targetNode?.ownerId === context.userId) {
      console.log(`[validateUploadPermission] 用户是目标节点所有者，允许上传`);
      return true;
    }

    // 2. 检查用户是否有目标节点的显式访问权限
    const access = await this.prisma.fileAccess.findUnique({
      where: {
        userId_nodeId: { userId: context.userId, nodeId: targetNodeId },
      },
    });

    console.log(`[validateUploadPermission] 目标节点显式访问权限:`, access);

    if (access) {
      console.log(`[validateUploadPermission] 用户有目标节点显式访问权限，允许上传`);
      return true;
    }

    // 3. 检查用户是否有项目根目录的访问权限
    if (targetNode && !targetNode.isRoot && targetNode.parentId) {
      console.log(`[validateUploadPermission] 目标节点不是根目录，检查父节点权限: parentId=${targetNode.parentId}`);
      
      // 递归查找项目根目录
      let currentNode = targetNode;
      let depth = 0;
      const maxDepth = 10; // 防止无限循环

      while (currentNode && !currentNode.isRoot && currentNode.parentId && depth < maxDepth) {
        depth++;
        const parentNode = await this.prisma.fileSystemNode.findUnique({
          where: { id: currentNode.parentId },
          select: { id: true, isRoot: true, parentId: true, ownerId: true, name: true },
        });

        console.log(`[validateUploadPermission] 检查父节点 (深度${depth}):`, parentNode);

        if (!parentNode) break;

        // 检查用户是否是该节点的所有者
        if (parentNode.ownerId === context.userId) {
          console.log(`[validateUploadPermission] 用户是父节点所有者，允许上传`);
          return true;
        }

        // 检查用户是否有该节点的访问权限
        const parentAccess = await this.prisma.fileAccess.findUnique({
          where: {
            userId_nodeId: { userId: context.userId, nodeId: parentNode.id },
          },
        });

        console.log(`[validateUploadPermission] 父节点访问权限:`, parentAccess);

        if (parentAccess) {
          console.log(`[validateUploadPermission] 用户有父节点访问权限，允许上传`);
          return true;
        }

        currentNode = parentNode;
      }

      if (depth >= maxDepth) {
        console.warn(`[validateUploadPermission] 达到最大递归深度，停止检查`);
      }
    }

    console.warn(`[validateUploadPermission] 权限检查失败: 用户 ${context.userId} 没有任何访问权限`);
    throw new ForbiddenException('您没有该节点的访问权限，无法上传文件');
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

    // 检查文件访问权限
    const fileAccess = await this.prisma.fileAccess.findFirst({
      where: {
        userId: context.userId,
        nodeId: fileNodeId,
      },
    });

    if (fileAccess) {
      return true;
    }

    // 检查项目访问权限
    if (fileNode.parentId) {
      const projectAccess = await this.prisma.fileAccess.findUnique({
        where: {
          userId_nodeId: { userId: context.userId, nodeId: fileNode.parentId },
        },
      });

      if (projectAccess) {
        return true;
      }
    }

    throw new ForbiddenException('您无权限访问该文件');
  }
}
