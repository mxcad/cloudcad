import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface MxCadContext {
  projectId?: string;
  parentId?: string;
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
    
    // 必须有项目信息
    if (!context.projectId) {
      throw new BadRequestException('缺少项目信息');
    }
    
    // 验证用户是否为项目成员
    const membership = await this.prisma.projectMember.findFirst({
      where: {
        userId: context.userId,
        nodeId: context.projectId,
      },
    });
    
    if (!membership) {
      throw new ForbiddenException('您不是该项目的成员，无法上传文件');
    }
    
    // 如果有 parentId，验证是否有文件夹访问权限
    if (context.parentId) {
      // 如果 parentId 等于 projectId，说明是上传到项目根目录
      // 此时应该检查项目成员权限，而不是文件夹访问权限
      if (context.parentId !== context.projectId) {
        const folderAccess = await this.prisma.fileAccess.findFirst({
          where: {
            userId: context.userId,
            nodeId: context.parentId,
          },
        });
        
        if (!folderAccess) {
          throw new ForbiddenException('您无权限访问该文件夹');
        }
      }
      // 如果 parentId == projectId，项目成员权限已经验证过了，无需额外检查
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

    // 检查项目成员权限
    if (fileNode.parentId) {
      const projectMembership = await this.prisma.projectMember.findFirst({
        where: {
          userId: context.userId,
          nodeId: fileNode.parentId,
        },
      });

      if (projectMembership) {
        return true;
      }
    }

    throw new ForbiddenException('您无权限访问该文件');
  }
}