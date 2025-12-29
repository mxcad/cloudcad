import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
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
    
    // 1. 检查用户是否是节点所有者
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: context.nodeId },
      select: { ownerId: true },
    });
    
    if (node?.ownerId === context.userId) {
      // 节点所有者，允许上传
      return true;
    }
    
    // 2. 检查用户是否有显式的节点访问权限
    const access = await this.prisma.fileAccess.findUnique({
      where: {
        userId_nodeId: { userId: context.userId, nodeId: context.nodeId },
      },
    });
    
    if (!access) {
      throw new ForbiddenException('您没有该节点的访问权限，无法上传文件');
    }

    return true;
  }

  /**
   * 验证文件访问权限
   */
  async validateFileAccess(context: MxCadContext, fileNodeId: string): Promise<boolean> {
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