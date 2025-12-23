import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MxCadContext } from './interceptors/mxcad-context.interceptor';

@Injectable()
export class MxCadPermissionService {
  constructor(private readonly prisma: DatabaseService) {}

  /**
   * 验证上传权限
   */
  async validateUploadPermission(context: MxCadContext): Promise<boolean> {
    if (!context.userId) {
      throw new UnauthorizedException('用户未登录');
    }
    
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
      throw new ForbiddenException('无权限访问该项目');
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
          throw new ForbiddenException('无权限访问该文件夹');
        }
      }
      // 如果 parentId == projectId，项目成员权限已经验证过了，无需额外检查
    }
    
    return true;
  }

  /**
   * 验证文件访问权限
   */
  async validateFileAccess(context: MxCadContext, fileId: string): Promise<boolean> {
    if (!context.userId) {
      throw new UnauthorizedException('用户未登录');
    }
    
    // 检查文件是否属于用户有权限的项目
    const fileNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: fileId },
    });
    
    if (!fileNode) {
      throw new BadRequestException('文件不存在');
    }
    
    // 检查用户是否为文件所有者或有访问权限
    if (fileNode.ownerId === context.userId) {
      return true;
    }
    
    const fileAccess = await this.prisma.fileAccess.findFirst({
      where: {
        userId: context.userId,
        nodeId: fileId,
      },
    });
    
    if (!fileAccess) {
      throw new ForbiddenException('无权限访问该文件');
    }
    
    return true;
  }
}