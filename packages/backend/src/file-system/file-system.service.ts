import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileStatus, ProjectStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { MinioStorageProvider } from '../storage/minio-storage.provider';
import { FileHashService } from './file-hash.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateNodeDto } from './dto/update-node.dto';

@Injectable()
export class FileSystemService {
  private readonly logger = new Logger(FileSystemService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storage: MinioStorageProvider,
    private readonly fileHashService: FileHashService,
  ) {}

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

  async getChildren(nodeId: string, userId?: string) {
    try {
      // 如果提供了userId，检查权限
      if (userId) {
        const hasPermission = await this.checkNodeAccess(nodeId, userId);
        if (!hasPermission) {
          throw new ForbiddenException('没有权限访问此节点');
        }
      }

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

      // 计算文件哈希
      const fileBuffer = file.buffer;
      const fileHash = await this.fileHashService.calculateHash(fileBuffer);

      // 检查是否已存在相同文件
      const existingFile = await this.prisma.fileSystemNode.findFirst({
        where: {
          fileHash,
          isFolder: false,
          fileStatus: FileStatus.COMPLETED,
        },
      });

      let storageKey: string;
      if (existingFile) {
        // 文件已存在，创建引用
        this.logger.log(`文件已存在，创建引用: ${file.originalname} -> ${existingFile.id}`);
        storageKey = existingFile.path || '';
      } else {
        // 上传新文件到MinIO
        const fileName = `${Date.now()}-${file.originalname}`;
        storageKey = `files/${userId}/${fileName}`;
        
        await this.storage.uploadFile(storageKey, fileBuffer);
        this.logger.log(`文件上传到MinIO成功: ${storageKey}`);
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
          path: storageKey,
          fileHash,
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

  async checkProjectPermission(projectId: string, userId: string, roles: string[]): Promise<boolean> {
    try {
      const membership = await this.prisma.projectMember.findFirst({
        where: {
          nodeId: projectId,
          userId,
        },
      });

      if (!membership) {
        return false;
      }

      return roles.includes(membership.role);
    } catch (error) {
      this.logger.error(`检查项目权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  async checkNodeAccess(nodeId: string, userId: string): Promise<boolean> {
    try {
      // 获取节点
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { ownerId: true, isRoot: true, parentId: true },
      });

      if (!node) {
        return false;
      }

      // 如果是节点所有者，直接允许访问
      if (node.ownerId === userId) {
        return true;
      }

      // 如果是根节点，检查项目成员权限
      if (node.isRoot) {
        const membership = await this.prisma.projectMember.findFirst({
          where: {
            nodeId,
            userId,
          },
        });
        return !!membership;
      }

      // 如果不是根节点，向上查找根节点并检查项目权限
      const rootNode = await this.getRootNode(nodeId);
      if (rootNode) {
        const membership = await this.prisma.projectMember.findFirst({
          where: {
            nodeId: rootNode.id,
            userId,
          },
        });
        return !!membership;
      }

      return false;
    } catch (error) {
      this.logger.error(`检查节点访问权限失败: ${error.message}`, error.stack);
      return false;
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
