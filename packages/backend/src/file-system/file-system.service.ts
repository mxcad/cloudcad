import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileStatus, ProjectStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateNodeDto } from './dto/update-node.dto';

@Injectable()
export class FileSystemService {
  private readonly logger = new Logger(FileSystemService.name);

  constructor(private readonly prisma: DatabaseService) {}

  async createProject(userId: string, dto: CreateProjectDto) {
    try {
      const rootNode = await this.prisma.fileSystemNode.create({
        data: {
          name: dto.name,
          description: dto.description,
          isFolder: true,
          isRoot: true,
          projectStatus: ProjectStatus.ACTIVE,
          ownerId: userId,
          members: {
            create: {
              userId,
              role: 'OWNER',
            },
          },
        },
        include: {
          members: {
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
          },
        },
      });

      this.logger.log(`项目创建成功: ${rootNode.name} by user ${userId}`);
      return rootNode;
    } catch (error) {
      this.logger.error(`项目创建失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserProjects(userId: string) {
    try {
      const projects = await this.prisma.fileSystemNode.findMany({
        where: {
          isRoot: true,
          members: {
            some: {
              userId,
            },
          },
        },
        include: {
          members: {
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
          },
          _count: {
            select: {
              children: true,
              members: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      return projects;
    } catch (error) {
      this.logger.error(`查询项目列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getProject(projectId: string) {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  nickname: true,
                  avatar: true,
                  role: true,
                },
              },
            },
          },
          children: {
            select: {
              id: true,
              name: true,
              isFolder: true,
              size: true,
              extension: true,
              fileStatus: true,
              createdAt: true,
              owner: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      return project;
    } catch (error) {
      this.logger.error(`查询项目失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateProject(projectId: string, dto: UpdateNodeDto) {
    try {
      const project = await this.prisma.fileSystemNode.update({
        where: { id: projectId, isRoot: true },
        data: {
          name: dto.name,
          description: dto.description,
          projectStatus: dto.status as ProjectStatus,
        },
        include: {
          members: {
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
          },
        },
      });

      this.logger.log(`项目更新成功: ${project.name}`);
      return project;
    } catch (error) {
      this.logger.error(`项目更新失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteProject(projectId: string) {
    try {
      await this.prisma.fileSystemNode.delete({
        where: { id: projectId, isRoot: true },
      });

      this.logger.log(`项目删除成功: ${projectId}`);
      return { message: '项目删除成功' };
    } catch (error) {
      this.logger.error(`项目删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async createFolder(userId: string, parentId: string, dto: CreateFolderDto) {
    try {
      const parent = await this.prisma.fileSystemNode.findUnique({
        where: { id: parentId },
        select: { isFolder: true, isRoot: true },
      });

      if (!parent) {
        throw new NotFoundException('父节点不存在');
      }

      if (!parent.isFolder) {
        throw new BadRequestException('只能在文件夹下创建子文件夹');
      }

      const folder = await this.prisma.fileSystemNode.create({
        data: {
          name: dto.name,
          isFolder: true,
          isRoot: false,
          parentId,
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
        },
      });

      this.logger.log(`文件夹创建成功: ${folder.name} by user ${userId}`);
      return folder;
    } catch (error) {
      this.logger.error(`文件夹创建失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getNodeTree(nodeId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          children: {
            include: {
              owner: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
              _count: {
                select: {
                  children: true,
                },
              },
            },
            orderBy: [{ isFolder: 'desc' }, { name: 'asc' }],
          },
        },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      return node;
    } catch (error) {
      this.logger.error(`查询节点失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getChildren(nodeId: string) {
    try {
      const children = await this.prisma.fileSystemNode.findMany({
        where: { parentId: nodeId },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          _count: {
            select: {
              children: true,
            },
          },
        },
        orderBy: [{ isFolder: 'desc' }, { name: 'asc' }],
      });

      return children;
    } catch (error) {
      this.logger.error(`查询子节点失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateNode(nodeId: string, dto: UpdateNodeDto) {
    try {
      const node = await this.prisma.fileSystemNode.update({
        where: { id: nodeId },
        data: {
          name: dto.name,
          description: dto.description,
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
      });

      this.logger.log(`节点更新成功: ${node.name}`);
      return node;
    } catch (error) {
      this.logger.error(`节点更新失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteNode(nodeId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { isRoot: true },
      });

      if (node?.isRoot) {
        throw new BadRequestException('请使用删除项目接口删除根节点');
      }

      await this.prisma.fileSystemNode.delete({
        where: { id: nodeId },
      });

      this.logger.log(`节点删除成功: ${nodeId}`);
      return { message: '节点删除成功' };
    } catch (error) {
      this.logger.error(`节点删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async moveNode(nodeId: string, targetParentId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { isRoot: true, parentId: true },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      if (node.isRoot) {
        throw new BadRequestException('不能移动根节点');
      }

      const targetParent = await this.prisma.fileSystemNode.findUnique({
        where: { id: targetParentId },
        select: { isFolder: true },
      });

      if (!targetParent) {
        throw new NotFoundException('目标父节点不存在');
      }

      if (!targetParent.isFolder) {
        throw new BadRequestException('目标父节点必须是文件夹');
      }

      if (nodeId === targetParentId) {
        throw new BadRequestException('不能将节点移动到自身');
      }

      const movedNode = await this.prisma.fileSystemNode.update({
        where: { id: nodeId },
        data: { parentId: targetParentId },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
      });

      this.logger.log(`节点移动成功: ${nodeId} -> ${targetParentId}`);
      return movedNode;
    } catch (error) {
      this.logger.error(`节点移动失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async uploadFile(userId: string, parentId: string, file: Express.Multer.File) {
    try {
      const parent = await this.prisma.fileSystemNode.findUnique({
        where: { id: parentId },
        select: { isFolder: true },
      });

      if (!parent) {
        throw new NotFoundException('父节点不存在');
      }

      if (!parent.isFolder) {
        throw new BadRequestException('只能在文件夹下上传文件');
      }

      const fileNode = await this.prisma.fileSystemNode.create({
        data: {
          name: file.originalname,
          originalName: file.originalname,
          isFolder: false,
          isRoot: false,
          parentId,
          extension: file.originalname.split('.').pop()?.toLowerCase() || '',
          mimeType: file.mimetype,
          size: file.size,
          path: `/uploads/${file.filename}`,
          fileStatus: FileStatus.COMPLETED,
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
        },
      });

      this.logger.log(`文件上传成功: ${fileNode.name} by user ${userId}`);
      return fileNode;
    } catch (error) {
      this.logger.error(`文件上传失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getRootNode(nodeId: string) {
    try {
      let currentNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { id: true, isRoot: true, parentId: true },
      });

      if (!currentNode) {
        throw new NotFoundException('节点不存在');
      }

      while (currentNode && !currentNode.isRoot && currentNode.parentId) {
        currentNode = await this.prisma.fileSystemNode.findUnique({
          where: { id: currentNode.parentId },
          select: { id: true, isRoot: true, parentId: true },
        });
      }

      if (!currentNode?.isRoot) {
        throw new NotFoundException('未找到根节点');
      }

      return currentNode;
    } catch (error) {
      this.logger.error(`查找根节点失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserStorageInfo(userId: string) {
    try {
      // 获取用户所有文件的总大小
      const files = await this.prisma.fileSystemNode.findMany({
        where: {
          ownerId: userId,
          isFolder: false,
          fileStatus: FileStatus.COMPLETED,
        },
        select: {
          size: true,
        },
      });

      const totalUsed = files.reduce((sum, file) => sum + (file.size || 0), 0);
      
      // 设置存储限制为 5GB (5 * 1024 * 1024 * 1024 bytes)
      const totalLimit = 5 * 1024 * 1024 * 1024;
      const available = totalLimit - totalUsed;
      const usagePercentage = Math.round((totalUsed / totalLimit) * 100);

      return {
        totalUsed,
        totalLimit,
        available,
        usagePercentage,
        formatted: {
          totalUsed: this.formatBytes(totalUsed),
          totalLimit: this.formatBytes(totalLimit),
          available: this.formatBytes(available),
        },
      };
    } catch (error) {
      this.logger.error(`获取用户存储信息失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
