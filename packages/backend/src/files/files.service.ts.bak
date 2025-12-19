import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FileAccessRole } from '../common/enums/permissions.enum';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly permissionCacheService: PermissionCacheService
  ) {}

  /**
   * 上传文件
   */
  async upload(userId: string, file: Express.Multer.File, projectId?: string) {
    try {
      // TODO: 实现实际的文件存储逻辑（MinIO）
      const fileRecord = await this.prisma.file.create({
        data: {
          name: file.originalname,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          path: `/uploads/${file.filename}`, // 临时路径，实际应该存储到MinIO
          projectId,
          ownerId: userId,
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // 为文件创建者添加所有者权限
      await this.prisma.fileAccess.create({
        data: {
          fileId: fileRecord.id,
          userId,
          role: FileAccessRole.OWNER,
        },
      });

      this.logger.log(`文件上传成功: ${fileRecord.name} by user ${userId}`);
      return fileRecord;
    } catch (error) {
      this.logger.error(`文件上传失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取用户文件列表
   */
  async findAll(userId: string) {
    try {
      const files = await this.prisma.file.findMany({
        where: {
          OR: [
            { ownerId: userId },
            {
              fileAccesses: {
                some: {
                  userId,
                },
              },
            },
            {
              project: {
                members: {
                  some: {
                    userId,
                  },
                },
              },
            },
          ],
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          fileAccesses: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return files;
    } catch (error) {
      this.logger.error(`查询文件列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 根据项目ID获取文件列表
   */
  async findByProject(projectId: string) {
    try {
      const files = await this.prisma.file.findMany({
        where: { projectId },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          fileAccesses: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return files;
    } catch (error) {
      this.logger.error(`查询项目文件失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 根据ID查询文件
   */
  async findOne(fileId: string) {
    try {
      const file = await this.prisma.file.findUnique({
        where: { id: fileId },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          fileAccesses: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
          },
        },
      });

      if (!file) {
        throw new NotFoundException('文件不存在');
      }

      return file;
    } catch (error) {
      this.logger.error(`查询文件失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 下载文件
   */
  async download(fileId: string) {
    try {
      const file = await this.prisma.file.findUnique({
        where: { id: fileId },
        select: {
          id: true,
          name: true,
          originalName: true,
          mimeType: true,
          size: true,
          path: true,
        },
      });

      if (!file) {
        throw new NotFoundException('文件不存在');
      }

      // TODO: 实现实际的文件下载逻辑（从MinIO获取）
      this.logger.log(`文件下载: ${file.name}`);
      return file;
    } catch (error) {
      this.logger.error(`文件下载失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 更新文件信息
   */
  async update(fileId: string, updateFileDto: any) {
    try {
      const file = await this.prisma.file.update({
        where: { id: fileId },
        data: updateFileDto,
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      this.logger.log(`文件更新成功: ${file.name}`);
      return file;
    } catch (error) {
      this.logger.error(`文件更新失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 删除文件
   */
  async remove(fileId: string) {
    try {
      await this.prisma.file.delete({
        where: { id: fileId },
      });

      // TODO: 删除实际文件（从MinIO）
      this.logger.log(`文件删除成功: ${fileId}`);
      return { message: '文件删除成功' };
    } catch (error) {
      this.logger.error(`文件删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 分享文件给其他用户
   */
  async shareFile(fileId: string, shareData: { userId: string; role: string }) {
    try {
      // 检查用户是否存在
      const user = await this.prisma.user.findUnique({
        where: { id: shareData.userId },
      });

      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      // 检查是否已经有访问权限
      const existingAccess = await this.prisma.fileAccess.findUnique({
        where: {
          userId_fileId: {
            userId: shareData.userId,
            fileId,
          },
        },
      });

      if (existingAccess) {
        throw new ForbiddenException('用户已经有该文件的访问权限');
      }

      const fileAccess = await this.prisma.fileAccess.create({
        data: {
          fileId,
          userId: shareData.userId,
          role: shareData.role as FileAccessRole,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              avatar: true,
            },
          },
        },
      });

      this.logger.log(`文件分享成功: ${fileId} -> ${shareData.userId}`);

      // 清除相关缓存
      this.permissionCacheService.clearUserCache(shareData.userId);
      this.permissionCacheService.clearFileCache(fileId);

      return fileAccess;
    } catch (error) {
      this.logger.error(`文件分享失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取文件访问权限列表
   */
  async getFileAccess(fileId: string) {
    try {
      const accesses = await this.prisma.fileAccess.findMany({
        where: { fileId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              avatar: true,
              role: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return accesses;
    } catch (error) {
      this.logger.error(`获取文件访问权限失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 更新文件访问权限
   */
  async updateFileAccess(fileId: string, userId: string, role: string) {
    try {
      const fileAccess = await this.prisma.fileAccess.update({
        where: {
          userId_fileId: {
            userId,
            fileId,
          },
        },
        data: { role: role as FileAccessRole },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              avatar: true,
            },
          },
        },
      });

      this.logger.log(`文件访问权限更新成功: ${fileId} - ${userId} -> ${role}`);

      // 清除相关缓存
      this.permissionCacheService.clearUserCache(userId);
      this.permissionCacheService.clearFileCache(fileId);

      return fileAccess;
    } catch (error) {
      this.logger.error(`更新文件访问权限失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 移除文件访问权限
   */
  async removeFileAccess(fileId: string, userId: string) {
    try {
      await this.prisma.fileAccess.delete({
        where: {
          userId_fileId: {
            userId,
            fileId,
          },
        },
      });

      this.logger.log(`文件访问权限移除成功: ${fileId} - ${userId}`);

      // 清除相关缓存
      this.permissionCacheService.clearUserCache(userId);
      this.permissionCacheService.clearFileCache(fileId);

      return { message: '访问权限移除成功' };
    } catch (error) {
      this.logger.error(`移除文件访问权限失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
