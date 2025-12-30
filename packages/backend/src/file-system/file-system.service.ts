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
import * as fsPromises from 'fs/promises';
import * as path from 'path';

@Injectable()
export class FileSystemService {
  private readonly logger = new Logger(FileSystemService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storage: MinioStorageProvider,
    private readonly fileHashService: FileHashService
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
          nodeAccesses: {
            create: {
              userId,
              role: 'OWNER',
            },
          },
        },
        include: {
          nodeAccesses: {
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
          deletedAt: null,
          nodeAccesses: {
            some: {
              userId,
            },
          },
        },
        include: {
          nodeAccesses: {
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
              nodeAccesses: true,
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
          nodeAccesses: {
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
          nodeAccesses: {
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

  async deleteProject(projectId: string, permanently: boolean = false) {
    try {
      if (permanently) {
        // 彻底删除
        await this.prisma.$transaction(async (tx) => {
          await this.deleteDescendantsWithFiles(tx, projectId);
          await tx.fileSystemNode.delete({
            where: { id: projectId, isRoot: true },
          });
        });
        this.logger.log(`项目彻底删除成功: ${projectId}`);
      } else {
        // 软删除到回收站
        await this.prisma.$transaction(async (tx) => {
          // 递归软删除所有后代节点
          await this.softDeleteDescendants(tx, projectId);
          // 软删除根节点
          await tx.fileSystemNode.update({
            where: { id: projectId, isRoot: true },
            data: {
              deletedAt: new Date(),
              projectStatus: ProjectStatus.DELETED,
            },
          });
        });
        this.logger.log(`项目已移至回收站: ${projectId}`);
      }
      return { message: permanently ? '项目已彻底删除' : '项目已移至回收站' };
    } catch (error) {
      this.logger.error(`项目删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 递归软删除节点的所有后代
   */
  private async softDeleteDescendants(tx: any, nodeId: string): Promise<void> {
    const children = await tx.fileSystemNode.findMany({
      where: { parentId: nodeId },
      select: { id: true, isFolder: true },
    });

    for (const child of children) {
      await this.softDeleteDescendants(tx, child.id);
    }

    if (children.length > 0) {
      const childIds = children.map((c: { id: string }) => c.id);
      await tx.fileSystemNode.updateMany({
        where: { id: { in: childIds } },
        data: {
          deletedAt: new Date(),
          fileStatus: FileStatus.DELETED,
        },
      });
    }
  }

  /**
   * 递归删除节点的所有后代（包含文件删除逻辑）
   */
  private async deleteDescendantsWithFiles(
    tx: any,
    nodeId: string
  ): Promise<void> {
    // 获取当前节点的所有直接子节点
    const children = await tx.fileSystemNode.findMany({
      where: { parentId: nodeId },
      select: { id: true, isFolder: true, path: true, fileHash: true },
    });

    // 递归删除每个子节点的后代
    for (const child of children) {
      await this.deleteDescendantsWithFiles(tx, child.id);
    }

    // 删除当前层的子节点及其文件
    if (children.length > 0) {
      for (const child of children) {
        // 如果是文件节点，检查是否需要删除 MinIO 文件
        if (!child.isFolder && child.path) {
          await this.deleteFileIfNotReferenced(tx, child.path, child.fileHash);
        }
      }

      // 删除数据库记录
      const childIds = children.map((c: { id: string }) => c.id);
      await tx.fileSystemNode.deleteMany({
        where: { id: { in: childIds } },
      });
    }
  }

  /**
   * 检查文件是否被其他节点引用，如果没有则从 MinIO 删除
   */
  private async deleteFileIfNotReferenced(
    tx: any,
    path: string,
    fileHash: string | null
  ): Promise<void> {
    if (!path) return;

    // 如果有 fileHash，检查是否有其他节点使用相同的文件哈希
    if (fileHash) {
      const referenceCount = await tx.fileSystemNode.count({
        where: {
          fileHash,
          isFolder: false,
          fileStatus: 'COMPLETED',
          NOT: { path }, // 排除当前节点
        },
      });

      if (referenceCount > 0) {
        this.logger.log(`文件被其他项目引用，保留MinIO文件: ${path}`);
        return;
      }
    }

    // 无引用或无 fileHash，删除 MinIO 文件
    try {
      await this.storage.deleteFile(path);
      this.logger.log(`MinIO文件删除成功: ${path}`);
    } catch (error) {
      this.logger.error(`MinIO文件删除失败: ${path}`, error);
      // 不抛出错误，继续处理
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

  async getNode(nodeId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId, deletedAt: null },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      return node;
    } catch (error) {
      this.logger.error(`获取节点失败: ${error.message}`, error.stack);
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
        where: { parentId: nodeId, deletedAt: null },
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

  async deleteNode(nodeId: string, permanently: boolean = false) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { isRoot: true, isFolder: true, path: true, fileHash: true },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      if (node.isRoot) {
        throw new BadRequestException('请使用删除项目接口删除根节点');
      }

      if (permanently) {
        // 彻底删除
        await this.prisma.$transaction(async (tx) => {
          await this.deleteDescendantsWithFiles(tx, nodeId);
          await tx.fileSystemNode.delete({ where: { id: nodeId } });
        });
        this.logger.log(`节点彻底删除成功: ${nodeId}`);
      } else {
        // 软删除到回收站
        await this.prisma.$transaction(async (tx) => {
          await this.softDeleteDescendants(tx, nodeId);
          await tx.fileSystemNode.update({
            where: { id: nodeId },
            data: {
              deletedAt: new Date(),
              fileStatus: FileStatus.DELETED,
            },
          });
        });
        this.logger.log(`节点已移至回收站: ${nodeId}`);
      }
      return { message: permanently ? '节点已彻底删除' : '节点已移至回收站' };
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

  async uploadFile(
    userId: string,
    parentId: string,
    file: Express.Multer.File
  ) {
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
        this.logger.log(
          `文件已存在，创建引用: ${file.originalname} -> ${existingFile.id}`
        );
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

  async checkProjectPermission(
    projectId: string,
    userId: string,
    roles: string[]
  ): Promise<boolean> {
    try {
      const access = await this.prisma.fileAccess.findUnique({
        where: {
          userId_nodeId: { userId, nodeId: projectId },
        },
      });

      if (!access) {
        return false;
      }

      return roles.includes(access.role);
    } catch (error) {
      this.logger.error(`检查项目权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  // ============ 回收站相关方法 ============

  /**
   * 获取用户的回收站列表（已删除的项目和文件）
   * 统一返回所有被删除的节点，不区分项目和目录
   * 只显示被删除的项目和顶级文件夹/文件，不显示已删除项目的子项
   */
  async getTrashItems(userId: string) {
    try {
      // 获取用户有权限访问的已删除项目
      const projects = await this.prisma.fileSystemNode.findMany({
        where: {
          isRoot: true,
          deletedAt: { not: null },
          OR: [
            { ownerId: userId },
            {
              nodeAccesses: {
                some: { userId },
              },
            },
          ],
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
            },
          },
          nodeAccesses: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  nickname: true,
                },
              },
            },
          },
        },
        orderBy: {
          deletedAt: 'desc',
        },
      });

      // 获取所有已删除项目的 ID
      const deletedProjectIds = projects.map((p) => p.id);

      // 获取用户删除的文件和文件夹（不属于项目的）
      // 过滤掉已删除项目的子项
      const nodes = await this.prisma.fileSystemNode.findMany({
        where: {
          deletedAt: { not: null },
          ownerId: userId,
          isRoot: false,
          // 排除已删除项目的子项
          parentId: {
            notIn: deletedProjectIds,
          },
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          _count: {
            select: { children: true },
          },
        },
        orderBy: {
          deletedAt: 'desc',
        },
      });

      // 合并项目和节点，统一返回
      const allItems = [
        ...projects.map((p) => ({ ...p, itemType: 'project' })),
        ...nodes.map((n) => ({ ...n, itemType: 'node' })),
      ];

      return allItems;
    } catch (error) {
      this.logger.error(`获取回收站列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 从回收站恢复项目
   * 递归恢复项目的所有后代节点
   */
  async restoreProject(projectId: string) {
    try {
      const project = await this.prisma.fileSystemNode.findFirst({
        where: { id: projectId, isRoot: true, deletedAt: { not: null } },
      });

      if (!project) {
        throw new NotFoundException('回收站中不存在该项目');
      }

      // 递归恢复所有后代节点
      const restoreDescendants = async (
        tx: any,
        nodeId: string
      ): Promise<void> => {
        const children = await tx.fileSystemNode.findMany({
          where: { parentId: nodeId, deletedAt: { not: null } },
          select: { id: true, isFolder: true },
        });

        for (const child of children) {
          // 恢复子节点
          await tx.fileSystemNode.update({
            where: { id: child.id },
            data: {
              deletedAt: null,
              fileStatus: FileStatus.COMPLETED,
            },
          });

          // 如果是文件夹，递归恢复其子项
          if (child.isFolder) {
            await restoreDescendants(tx, child.id);
          }
        }
      };

      await this.prisma.$transaction(async (tx) => {
        // 恢复根节点
        await tx.fileSystemNode.update({
          where: { id: projectId },
          data: {
            deletedAt: null,
            projectStatus: ProjectStatus.ACTIVE,
          },
        });

        // 递归恢复所有后代节点
        await restoreDescendants(tx, projectId);
      });

      this.logger.log(`项目恢复成功: ${projectId}`);
      return { message: '项目已从回收站恢复' };
    } catch (error) {
      this.logger.error(`项目恢复失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 从回收站恢复节点
   * 递归恢复节点的所有子项
   */
  async restoreNode(nodeId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findFirst({
        where: { id: nodeId, deletedAt: { not: null } },
      });

      if (!node) {
        throw new NotFoundException('回收站中不存在该节点');
      }

      // 递归恢复所有子节点
      const restoreDescendants = async (
        tx: any,
        parentId: string
      ): Promise<void> => {
        const children = await tx.fileSystemNode.findMany({
          where: { parentId, deletedAt: { not: null } },
          select: { id: true, isFolder: true },
        });

        for (const child of children) {
          // 恢复子节点
          await tx.fileSystemNode.update({
            where: { id: child.id },
            data: {
              deletedAt: null,
              fileStatus: FileStatus.COMPLETED,
            },
          });

          // 如果是文件夹，递归恢复其子项
          if (child.isFolder) {
            await restoreDescendants(tx, child.id);
          }
        }
      };

      await this.prisma.$transaction(async (tx) => {
        // 恢复当前节点
        await tx.fileSystemNode.update({
          where: { id: nodeId },
          data: {
            deletedAt: null,
            fileStatus: FileStatus.COMPLETED,
          },
        });

        // 如果是文件夹，递归恢复所有子项
        if (node.isFolder) {
          await restoreDescendants(tx, nodeId);
        }

        // 如果有父节点且父节点也被删除，需要恢复父节点
        if (node.parentId) {
          const parent = await tx.fileSystemNode.findFirst({
            where: { id: node.parentId, deletedAt: { not: null } },
          });

          if (parent) {
            await tx.fileSystemNode.update({
              where: { id: node.parentId },
              data: {
                deletedAt: null,
                fileStatus: FileStatus.COMPLETED,
              },
            });

            // 如果父节点是文件夹，递归恢复其子项
            if (parent.isFolder) {
              await restoreDescendants(tx, node.parentId);
            }
          }
        }
      });

      this.logger.log(`节点恢复成功: ${nodeId}`);
      return { message: '已从回收站恢复' };
    } catch (error) {
      this.logger.error(`节点恢复失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 彻底删除回收站中的项目
   */
  async permanentlyDeleteProject(projectId: string) {
    try {
      // 先收集项目下所有文件的哈希值，用于清理 uploads 目录
      const files = await this.prisma.fileSystemNode.findMany({
        where: {
          parentId: projectId,
          isFolder: false,
          fileHash: { not: null },
        },
        select: { fileHash: true },
      });

      // 递归收集所有子目录中的文件哈希值
      const collectFileHashes = async (nodeId: string): Promise<string[]> => {
        const children = await this.prisma.fileSystemNode.findMany({
          where: { parentId: nodeId },
          select: { id: true, isFolder: true, fileHash: true },
        });

        const hashes: string[] = [];
        for (const child of children) {
          if (child.isFolder) {
            const childHashes = await collectFileHashes(child.id);
            hashes.push(...childHashes);
          } else if (child.fileHash) {
            hashes.push(child.fileHash);
          }
        }
        return hashes;
      };

      const allFileHashes = [
        ...files.map((f) => f.fileHash!),
        ...(await collectFileHashes(projectId)),
      ];

      // 删除 uploads 目录中的物理文件
      if (allFileHashes.length > 0) {
        const deletedCount =
          await this.deleteMxCadFilesFromUploadsBatch(allFileHashes);
        this.logger.log(`删除项目时删除 uploads 文件: ${deletedCount} 个`);
      }

      await this.prisma.$transaction(async (tx) => {
        await this.deleteDescendantsWithFiles(tx, projectId);
        await tx.fileSystemNode.delete({
          where: { id: projectId, isRoot: true, deletedAt: { not: null } },
        });
      });

      this.logger.log(`项目已从回收站彻底删除: ${projectId}`);
      return { message: '项目已彻底删除' };
    } catch (error) {
      this.logger.error(`项目彻底删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 彻底删除回收站中的节点
   */
  async permanentlyDeleteNode(nodeId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { isFolder: true, path: true, fileHash: true },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      // 如果是文件且有文件哈希，删除 uploads 目录中的物理文件
      if (!node.isFolder && node.fileHash) {
        await this.deleteMxCadFilesFromUploads(node.fileHash);
      }

      await this.prisma.$transaction(async (tx) => {
        if (!node.isFolder && node.path) {
          await this.deleteFileIfNotReferenced(tx, node.path, node.fileHash);
        }
        await this.deleteDescendantsWithFiles(tx, nodeId);
        await tx.fileSystemNode.delete({ where: { id: nodeId } });
      });

      this.logger.log(`节点已从回收站彻底删除: ${nodeId}`);
      return { message: '已彻底删除' };
    } catch (error) {
      this.logger.error(`节点彻底删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 批量恢复回收站中的节点
   */
  async restoreTrashItems(itemIds: string[]) {
    try {
      if (!itemIds || itemIds.length === 0) {
        return { message: '请选择要恢复的项目' };
      }

      // 获取所有要恢复的节点
      const items = await this.prisma.fileSystemNode.findMany({
        where: {
          id: { in: itemIds },
          deletedAt: { not: null },
        },
        select: { id: true, isRoot: true, isFolder: true, parentId: true },
      });

      if (items.length === 0) {
        throw new NotFoundException('未找到要恢复的项目');
      }

      // 分别恢复项目和节点
      for (const item of items) {
        if (item.isRoot) {
          await this.restoreProject(item.id);
        } else {
          await this.restoreNode(item.id);
        }
      }

      this.logger.log(`批量恢复成功: ${items.length} 个项目`);
      return { message: `已恢复 ${items.length} 个项目` };
    } catch (error) {
      this.logger.error(`批量恢复失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 批量彻底删除回收站中的节点
   */
  async permanentlyDeleteTrashItems(itemIds: string[]) {
    try {
      if (!itemIds || itemIds.length === 0) {
        return { message: '请选择要删除的项目' };
      }

      // 获取所有要删除的节点
      const items = await this.prisma.fileSystemNode.findMany({
        where: {
          id: { in: itemIds },
          deletedAt: { not: null },
        },
        select: { id: true, isRoot: true },
      });

      if (items.length === 0) {
        throw new NotFoundException('未找到要删除的项目');
      }

      // 分别删除项目和节点
      for (const item of items) {
        if (item.isRoot) {
          await this.permanentlyDeleteProject(item.id);
        } else {
          await this.permanentlyDeleteNode(item.id);
        }
      }

      this.logger.log(`批量彻底删除成功: ${items.length} 个项目`);
      return { message: `已彻底删除 ${items.length} 个项目` };
    } catch (error) {
      this.logger.error(`批量彻底删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 清空用户回收站
   */
  async clearTrash(userId: string) {
    try {
      // 获取用户回收站中的所有项目
      const projects = await this.prisma.fileSystemNode.findMany({
        where: {
          isRoot: true,
          deletedAt: { not: null },
          nodeAccesses: { some: { userId } },
        },
        select: { id: true },
      });

      // 获取用户回收站中的所有节点
      const nodes = await this.prisma.fileSystemNode.findMany({
        where: {
          deletedAt: { not: null },
          ownerId: userId,
        },
        select: { id: true, isFolder: true, path: true, fileHash: true },
      });

      // 收集所有文件的哈希值，用于清理 uploads 目录
      const fileHashes = nodes
        .filter((node) => !node.isFolder && node.fileHash)
        .map((node) => node.fileHash!);

      // 删除 uploads 目录中的物理文件
      if (fileHashes.length > 0) {
        const deletedCount =
          await this.deleteMxCadFilesFromUploadsBatch(fileHashes);
        this.logger.log(`清空回收站时删除 uploads 文件: ${deletedCount} 个`);
      }

      // 彻底删除所有
      for (const project of projects) {
        await this.permanentlyDeleteProject(project.id);
      }

      for (const node of nodes) {
        if (!node.isFolder && node.path) {
          await this.deleteFileIfNotReferenced(
            this.prisma,
            node.path,
            node.fileHash
          );
        }
      }

      await this.prisma.fileSystemNode.deleteMany({
        where: {
          id: { in: nodes.map((n) => n.id) },
        },
      });

      this.logger.log(`用户回收站已清空: ${userId}`);
      return { message: '回收站已清空' };
    } catch (error) {
      this.logger.error(`清空回收站失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============ 权限检查方法 ============

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

      // 如果是根节点，检查节点访问权限
      if (node.isRoot) {
        const rootAccess = await this.prisma.fileAccess.findUnique({
          where: {
            userId_nodeId: { userId, nodeId },
          },
        });
        return !!rootAccess;
      }

      // 如果不是根节点，向上查找根节点并检查权限
      const rootNode = await this.getRootNode(nodeId);
      if (rootNode) {
        const rootAccess = await this.prisma.fileAccess.findUnique({
          where: {
            userId_nodeId: { userId, nodeId: rootNode.id },
          },
        });
        return !!rootAccess;
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

  /**
   * 删除 uploads 目录和 MinIO 中与指定文件哈希相关的所有 MxCAD 文件
   * 包括 .dwg, .mxweb, _preloading.json 等文件，以及外部参照子目录
   *
   * @param fileHash 文件哈希值
   * @returns 删除的文件数量
   */
  private async deleteMxCadFilesFromUploads(fileHash: string): Promise<number> {
    if (!fileHash) {
      return 0;
    }

    let totalDeleted = 0;

    try {
      // 1. 删除 uploads 目录中的文件
      const uploadPath =
        process.env.MXCAD_UPLOAD_PATH || path.join(process.cwd(), 'uploads');

      try {
        await fsPromises.access(uploadPath);
        const files = await fsPromises.readdir(uploadPath);

        // 筛选出与 fileHash 相关的文件
        const relatedFiles = files.filter((file) => file.startsWith(fileHash));

        for (const fileName of relatedFiles) {
          const filePath = path.join(uploadPath, fileName);
          try {
            await fsPromises.unlink(filePath);
            this.logger.log(`删除 uploads 文件成功: ${filePath}`);
            totalDeleted++;
          } catch (error) {
            this.logger.error(
              `删除 uploads 文件失败: ${filePath}: ${error.message}`
            );
          }
        }

        // 删除外部参照子目录（如果存在）
        const hashDir = path.join(uploadPath, fileHash);
        try {
          await fsPromises.access(hashDir);
          const extRefFiles = await fsPromises.readdir(hashDir);

          for (const extRefFile of extRefFiles) {
            const extRefFilePath = path.join(hashDir, extRefFile);
            try {
              await fsPromises.unlink(extRefFilePath);
              this.logger.log(
                `删除 uploads 外部参照文件成功: ${extRefFilePath}`
              );
              totalDeleted++;
            } catch (error) {
              this.logger.error(
                `删除 uploads 外部参照文件失败: ${extRefFilePath}: ${error.message}`
              );
            }
          }

          // 删除空目录
          await fsPromises.rmdir(hashDir);
          this.logger.log(`删除 uploads 外部参照目录成功: ${hashDir}`);
        } catch (error) {
          // 子目录不存在或无权限，忽略
          this.logger.debug(`外部参照子目录不存在: ${hashDir}`);
        }
      } catch (error) {
        this.logger.warn(
          `uploads 目录不存在或读取失败: ${uploadPath}: ${error.message}`
        );
      }

      // 2. 删除 MinIO 中的相关文件
      try {
        // 获取 mxcad/file/ 路径下所有以 fileHash 开头的文件
        const minioFiles = await this.storage.listFiles(
          `mxcad/file/`,
          `${fileHash}`
        );

        for (const minioFile of minioFiles) {
          try {
            await this.storage.deleteFile(minioFile);
            this.logger.log(`删除 MinIO 文件成功: ${minioFile}`);
            totalDeleted++;
          } catch (error) {
            this.logger.error(
              `删除 MinIO 文件失败: ${minioFile}: ${error.message}`
            );
          }
        }

        // 删除外部参照子目录（如果存在）
        try {
          const extRefFiles = await this.storage.listFiles(
            `mxcad/file/${fileHash}/`
          );
          for (const extRefFile of extRefFiles) {
            try {
              await this.storage.deleteFile(extRefFile);
              this.logger.log(`删除 MinIO 外部参照文件成功: ${extRefFile}`);
              totalDeleted++;
            } catch (error) {
              this.logger.error(
                `删除 MinIO 外部参照文件失败: ${extRefFile}: ${error.message}`
              );
            }
          }
        } catch (error) {
          // 子目录不存在或无权限，忽略
          this.logger.debug(`外部参照子目录不存在: mxcad/file/${fileHash}/`);
        }
      } catch (error) {
        this.logger.warn(`删除 MinIO 文件失败: ${error.message}`);
      }

      this.logger.log(
        `共删除 ${totalDeleted} 个文件（uploads + MinIO），哈希值: ${fileHash}`
      );
      return totalDeleted;
    } catch (error) {
      this.logger.error(`删除 MxCAD 文件失败: ${error.message}`, error.stack);
      return 0;
    }
  }

  /**
   * 批量删除 uploads 目录中与指定文件哈希列表相关的所有 MxCAD 文件
   *
   * @param fileHashes 文件哈希值列表
   * @returns 删除的文件总数
   */
  private async deleteMxCadFilesFromUploadsBatch(
    fileHashes: string[]
  ): Promise<number> {
    if (!fileHashes || fileHashes.length === 0) {
      return 0;
    }

    let totalDeleted = 0;
    for (const fileHash of fileHashes) {
      const deleted = await this.deleteMxCadFilesFromUploads(fileHash);
      totalDeleted += deleted;
    }

    this.logger.log(
      `批量删除 uploads 文件完成，共删除 ${totalDeleted} 个文件，哈希值数量: ${fileHashes.length}`
    );
    return totalDeleted;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
