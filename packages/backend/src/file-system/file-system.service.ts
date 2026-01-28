import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  FileStatus,
  ProjectStatus,
  FileSystemNode as PrismaFileSystemNode,
} from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { MinioStorageProvider } from '../storage/minio-storage.provider';
import { FileHashService } from './file-hash.service';
import { FileSystemPermissionService } from './file-system-permission.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '@prisma/client';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { QueryChildrenDto } from './dto/query-children.dto';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as archiver from 'archiver';
import { PassThrough } from 'stream';

@Injectable()
export class FileSystemService {
  private readonly logger = new Logger(FileSystemService.name);

  // ZIP 压缩配置
  private readonly ZIP_CONFIG = {
    MAX_TOTAL_SIZE: 2 * 1024 * 1024 * 1024, // 2GB
    MAX_FILE_COUNT: 10000,
    MAX_DEPTH: 50,
    MAX_SINGLE_FILE_SIZE: 500 * 1024 * 1024, // 500MB
    COMPRESSION_LEVEL: 1, // 快速压缩
  } as const;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storage: MinioStorageProvider,
    private readonly fileHashService: FileHashService,
    private readonly permissionService: FileSystemPermissionService,
    private readonly auditLogService: AuditLogService
  ) {}

  /**
   * 验证并清理文件名，防止路径遍历攻击
   * @param fileName 原始文件名
   * @returns 清理后的文件名
   */
  private sanitizeFileName(fileName: string): string {
    // 移除路径遍历字符
    // eslint-disable-next-line no-useless-escape
    let sanitized = fileName.replace(/[\/\\]/g, '_');

    // 移除控制字符
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '_');

    // 限制文件名长度
    const MAX_FILENAME_LENGTH = 255;
    if (sanitized.length > MAX_FILENAME_LENGTH) {
      const ext = path.extname(sanitized);
      const nameWithoutExt = path.basename(sanitized, ext);
      const maxNameLength = MAX_FILENAME_LENGTH - ext.length;
      sanitized = nameWithoutExt.substring(0, maxNameLength) + ext;
    }

    // 确保文件名不为空
    if (sanitized.trim() === '' || sanitized === '.') {
      sanitized = 'unnamed';
    }

    return sanitized;
  }

  /**
   * 获取存储路径
   * @param node 文件系统节点
   * @returns MinIO 存储路径
   */
  private getStoragePath(node: PrismaFileSystemNode): string {
    if (!node.path) {
      throw new NotFoundException('文件路径不存在');
    }

    return node.path.startsWith('files/') && node.fileHash
      ? `mxcad/file/${node.fileHash}/${node.name}`
      : node.path;
  }

  async createProject(userId: string, dto: CreateProjectDto) {
    try {
      // 获取 PROJECT_OWNER 角色
      const projectOwnerRole = await this.prisma.role.findUnique({
        where: { name: 'PROJECT_OWNER' },
      });

      if (!projectOwnerRole) {
        throw new BadRequestException(
          'PROJECT_OWNER 角色不存在，请先初始化系统角色'
        );
      }

      const rootNode = await this.prisma.fileSystemNode.create({
        data: {
          name: dto.name,
          description: dto.description,
          isFolder: true,
          isRoot: true,
          projectStatus: ProjectStatus.ACTIVE,
          ownerId: userId,
          // 使用 ProjectMember 表添加项目创建者
          projectMembers: {
            create: {
              userId,
              projectRoleId: projectOwnerRole.id,
            },
          },
        },
        include: {
          projectMembers: {
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
              projectRole: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  isSystem: true,
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

  async getUserProjects(userId: string, query?: QueryProjectsDto) {
    const {
      search,
      projectStatus,
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
    } = query || {};
    const skip = (page - 1) * limit;

    const where: any = {
      isRoot: true,
      deletedAt: null,
      projectMembers: {
        some: { userId },
      },
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (projectStatus) {
      where.projectStatus = projectStatus;
    }

    try {
      const [projects, total] = await Promise.all([
        this.prisma.fileSystemNode.findMany({
          where,
          skip,
          take: limit,
          orderBy: sortBy ? { [sortBy]: sortOrder } : { updatedAt: 'desc' },
          include: {
            projectMembers: {
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
                projectRole: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    isSystem: true,
                  },
                },
              },
            },
            _count: {
              select: {
                children: true,
                projectMembers: true,
              },
            },
          },
        }),
        this.prisma.fileSystemNode.count({ where }),
      ]);

      return {
        data: projects,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(`查询项目列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getProject(projectId: string) {
    try {
      const project = await this.prisma.fileSystemNode.findFirst({
        where: {
          id: projectId,
          isRoot: true,
          deletedAt: null,
        },
        include: {
          projectMembers: {
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
              projectRole: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  isSystem: true,
                },
              },
            },
          },
          children: {
            where: {
              deletedAt: null,
            },
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
        throw new NotFoundException(`项目不存在或已被删除: ${projectId}`);
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
          projectMembers: {
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
              projectRole: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  isSystem: true,
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
        // 彻底删除：递归删除所有子节点和文件
        await this.prisma.$transaction(async (tx) => {
          await this.deleteDescendantsWithFiles(tx, projectId);
          await tx.fileSystemNode.delete({
            where: { id: projectId, isRoot: true },
          });
        });
        this.logger.log(`项目彻底删除成功: ${projectId}`);
      } else {
        // 软删除到回收站：只删除项目根节点，不递归删除子节点
        await this.prisma.fileSystemNode.update({
          where: { id: projectId, isRoot: true },
          data: {
            deletedAt: new Date(),
            projectStatus: ProjectStatus.DELETED,
            deletedByCascade: false, // 主动删除标记
          },
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
          deletedByCascade: true, // 标记为因父节点删除而被自动删除
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
        this.logger.log(`文件被其他项目引用，保留MinIO和uploads文件: ${path}`);
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

    // 删除 uploads 文件
    if (fileHash) {
      try {
        const deletedCount = await this.deleteMxCadFilesFromUploads(fileHash);
        this.logger.log(`删除 uploads 文件成功，共删除 ${deletedCount} 个文件`);
      } catch (error) {
        this.logger.error(`删除 uploads 文件失败: ${error.message}`, error);
        // 不抛出错误，继续处理
      }
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

  async getChildren(nodeId: string, userId?: string, query?: QueryChildrenDto) {
    const {
      search,
      nodeType,
      extension,
      fileStatus,
      page = 1,
      limit = 50,
      sortBy,
      sortOrder,
    } = query || {};
    const skip = (page - 1) * limit;

    const where: any = {
      parentId: nodeId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (nodeType) {
      where.isFolder = nodeType === 'folder';
    }

    if (extension) {
      where.extension = extension;
    }

    if (fileStatus) {
      where.fileStatus = fileStatus;
    }

    try {
      // 检查父节点是否存在以及是否已被删除
      const parentNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { id: true, deletedAt: true },
      });

      // 如果父节点不存在或已被删除，返回空列表
      if (!parentNode || parentNode.deletedAt) {
        return {
          data: [],
          meta: {
            total: 0,
            page,
            limit,
            totalPages: 0,
          },
        };
      }

      // 如果提供了userId，检查权限
      if (userId) {
        const hasPermission = await this.checkNodeAccess(nodeId, userId);
        if (!hasPermission) {
          throw new ForbiddenException('没有权限访问此节点');
        }
      }

      const [nodes, total] = await Promise.all([
        this.prisma.fileSystemNode.findMany({
          where,
          skip,
          take: limit,
          orderBy: sortBy
            ? { [sortBy]: sortOrder }
            : [{ isFolder: 'desc' }, { name: 'asc' }],
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
        }),
        this.prisma.fileSystemNode.count({ where }),
      ]);

      return {
        data: nodes,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(`查询子节点失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateNode(nodeId: string, dto: UpdateNodeDto) {
    try {
      // 获取当前节点信息
      const currentNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { name: true, isFolder: true, extension: true },
      });

      if (!currentNode) {
        throw new NotFoundException('节点不存在');
      }

      // 对于文件节点，验证扩展名是否被修改
      if (!currentNode.isFolder && dto.name && currentNode.extension) {
        const newExtension = path.extname(dto.name).toLowerCase();
        const currentExtension = currentNode.extension.toLowerCase();

        // 如果新名称的扩展名与原扩展名不同，抛出异常
        if (newExtension && newExtension !== currentExtension) {
          throw new BadRequestException(
            `不允许修改文件扩展名。文件扩展名必须保持为 ${currentExtension}`
          );
        }

        // 如果用户没有输入扩展名，自动添加原扩展名
        if (!newExtension && currentExtension) {
          dto.name = `${dto.name}${currentExtension}`;
        }
      }

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
        // 彻底删除：递归删除所有子节点和文件
        await this.prisma.$transaction(async (tx) => {
          await this.deleteDescendantsWithFiles(tx, nodeId);
          await tx.fileSystemNode.delete({ where: { id: nodeId } });
        });
        this.logger.log(`节点彻底删除成功: ${nodeId}`);
      } else {
        // 软删除到回收站：只删除当前节点，不递归删除子节点
        await this.prisma.fileSystemNode.update({
          where: { id: nodeId },
          data: {
            deletedAt: new Date(),
            fileStatus: FileStatus.DELETED,
            deletedByCascade: false, // 主动删除标记
          },
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

  /**
   * 生成唯一的节点名称（处理同名文件）
   */
  private async generateUniqueName(
    parentId: string,
    baseName: string,
    isFolder: boolean
  ): Promise<string> {
    const existingNodes = await this.prisma.fileSystemNode.findMany({
      where: {
        parentId,
        deletedAt: null,
      },
      select: { name: true },
    });

    const existingNames = new Set(existingNodes.map((n) => n.name));

    if (!existingNames.has(baseName)) {
      return baseName;
    }

    // 文件名处理：提取名称和扩展名
    if (!isFolder) {
      const lastDotIndex = baseName.lastIndexOf('.');
      if (lastDotIndex === -1) {
        // 没有扩展名
        return this.generateNumberedName(baseName, existingNames);
      }
      const nameWithoutExt = baseName.substring(0, lastDotIndex);
      const extension = baseName.substring(lastDotIndex);
      const numberedName = this.generateNumberedName(
        nameWithoutExt,
        existingNames
      );
      return `${numberedName}${extension}`;
    }

    // 文件夹处理
    return this.generateNumberedName(baseName, existingNames);
  }

  /**
   * 生成带序号的名称
   */
  private generateNumberedName(
    baseName: string,
    existingNames: Set<string>
  ): string {
    let counter = 1;
    let newName: string;
    do {
      newName = `${baseName} (${counter})`;
      counter++;
    } while (existingNames.has(newName));
    return newName;
  }

  /**
   * 递归拷贝节点及其所有子项
   */
  async copyNode(nodeId: string, targetParentId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: {
          id: true,
          name: true,
          isRoot: true,
          isFolder: true,
          originalName: true,
          path: true,
          size: true,
          mimeType: true,
          extension: true,
          fileStatus: true,
          fileHash: true,
          description: true,
          ownerId: true,
        },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      if (node.isRoot) {
        throw new BadRequestException('不能拷贝根节点');
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
        throw new BadRequestException('不能将节点拷贝到自身');
      }

      // 生成唯一名称
      const uniqueName = await this.generateUniqueName(
        targetParentId,
        node.name,
        node.isFolder
      );

      // 递归拷贝节点
      const copiedNode = await this.copyNodeRecursive(
        nodeId,
        targetParentId,
        uniqueName,
        node.ownerId
      );

      this.logger.log(`节点拷贝成功: ${nodeId} -> ${copiedNode.id}`);
      return copiedNode;
    } catch (error) {
      this.logger.error(`节点拷贝失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 递归拷贝节点及其所有子项
   */
  private async copyNodeRecursive(
    sourceNodeId: string,
    targetParentId: string,
    newName: string,
    ownerId: string
  ): Promise<any> {
    const sourceNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: sourceNodeId },
      include: {
        children: {
          select: {
            id: true,
            name: true,
            isFolder: true,
          },
        },
      },
    });

    if (!sourceNode) {
      throw new NotFoundException('源节点不存在');
    }

    // 创建新节点
    const newNode = await this.prisma.fileSystemNode.create({
      data: {
        name: newName,
        originalName: sourceNode.originalName || newName,
        isFolder: sourceNode.isFolder,
        isRoot: false,
        parentId: targetParentId,
        path: sourceNode.path,
        size: sourceNode.size,
        mimeType: sourceNode.mimeType,
        extension: sourceNode.extension,
        fileStatus: sourceNode.fileStatus,
        fileHash: sourceNode.fileHash,
        description: sourceNode.description,
        ownerId,
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

    // 如果是文件夹，递归拷贝所有子项
    if (sourceNode.isFolder && sourceNode.children.length > 0) {
      for (const child of sourceNode.children) {
        await this.copyNodeRecursive(child.id, newNode.id, child.name, ownerId);
      }
    }

    return newNode;
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
      return await this.permissionService.hasNodeAccessRole(
        userId,
        projectId,
        roles as any
      );
    } catch (error) {
      this.logger.error(`检查项目权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 检查用户是否有权限访问指定文件
   * @param nodeId 文件节点 ID
   * @param userId 用户 ID
   * @returns 是否有访问权限
   */
  async checkFileAccess(nodeId: string, userId: string): Promise<boolean> {
    try {
      const role = await this.permissionService.getNodeAccessRole(
        userId,
        nodeId
      );
      return role !== null;
    } catch (error) {
      this.logger.error(`检查文件访问权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 获取文件流（用于图片代理）
   * @param path MinIO 存储路径
   * @returns 文件流
   */
  async getFileStream(path: string): Promise<NodeJS.ReadableStream> {
    try {
      return await this.storage.getFileStream(path);
    } catch (error) {
      this.logger.error(`获取文件流失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取用户的回收站列表（已删除的项目和文件）
   * 统一返回所有被删除的节点，不区分项目和目录
   * 显示所有被删除的节点，包括项目的子节点
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
              projectMembers: {
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
          projectMembers: {
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

      // 获取用户主动删除的所有节点（包括项目的子节点）
      const nodes = await this.prisma.fileSystemNode.findMany({
        where: {
          deletedAt: { not: null },
          ownerId: userId,
          isRoot: false,
          deletedByCascade: false, // 只显示主动删除的节点
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

      // 只恢复项目根节点，不递归恢复子节点
      await this.prisma.fileSystemNode.update({
        where: { id: projectId },
        data: {
          deletedAt: null,
          projectStatus: ProjectStatus.ACTIVE,
          deletedByCascade: false, // 重置级联删除标记
        },
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

      // 如果节点不在回收站中（可能已被恢复），直接返回
      if (!node) {
        this.logger.warn(`节点 ${nodeId} 不在回收站中，可能已被恢复`);
        return { message: '节点已恢复或不存在' };
      }

      // 只恢复当前节点，不递归恢复子节点，也不恢复父节点
      await this.prisma.fileSystemNode.update({
        where: { id: nodeId },
        data: {
          deletedAt: null,
          fileStatus: FileStatus.COMPLETED,
          deletedByCascade: false, // 重置级联删除标记
        },
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
      await this.prisma.$transaction(async (tx) => {
        // 递归删除所有子节点和文件（检查文件引用）
        await this.deleteDescendantsWithFiles(tx, projectId);
        // 删除项目根节点
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

      await this.prisma.$transaction(async (tx) => {
        // 如果是文件节点，检查是否需要删除 MinIO 文件和 uploads 文件
        if (!node.isFolder && node.path) {
          await this.deleteFileIfNotReferenced(tx, node.path, node.fileHash);
        }
        // 递归删除所有子节点和文件（检查文件引用）
        await this.deleteDescendantsWithFiles(tx, nodeId);
        // 删除当前节点
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
      const projects = await this.prisma.fileSystemNode.findMany({
        where: {
          isRoot: true,
          deletedAt: { not: null },
          projectMembers: { some: { userId } },
        },
        select: { id: true },
      });

      const nodes = await this.prisma.fileSystemNode.findMany({
        where: {
          deletedAt: { not: null },
          ownerId: userId,
        },
        select: { id: true, isFolder: true, path: true, fileHash: true },
      });

      const fileHashes = nodes
        .filter((node) => !node.isFolder && node.fileHash)
        .map((node) => node.fileHash!);

      if (fileHashes.length > 0) {
        const deletedCount =
          await this.deleteMxCadFilesFromUploadsBatch(fileHashes);
        this.logger.log(`清空回收站时删除 uploads 文件: ${deletedCount} 个`);
      }

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

  async checkNodeAccess(nodeId: string, userId: string): Promise<boolean> {
    try {
      const role = await this.permissionService.getNodeAccessRole(
        userId,
        nodeId
      );
      return role !== null;
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
      const uploadPath =
        process.env.MXCAD_UPLOAD_PATH || path.join(process.cwd(), 'uploads');

      try {
        await fsPromises.access(uploadPath);
        const files = await fsPromises.readdir(uploadPath);

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

          await fsPromises.rmdir(hashDir);
          this.logger.log(`删除 uploads 外部参照目录成功: ${hashDir}`);
        } catch (error) {
          this.logger.debug(`外部参照子目录不存在: ${hashDir}`);
        }
      } catch (error) {
        this.logger.warn(
          `uploads 目录不存在或读取失败: ${uploadPath}: ${error.message}`
        );
      }

      try {
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

  /**
   * 获取项目成员列表
   * @param projectId 项目 ID
   * @returns 项目成员列表
   */
  async getProjectMembers(projectId: string) {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      // 从 ProjectMember 表获取（新系统）
      const projectMembers = await this.prisma.projectMember.findMany({
        where: { projectId },
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
          projectRole: {
            include: {
              permissions: {
                select: {
                  permission: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      // 如果 ProjectMember 表不为空，返回新系统的数据
      return projectMembers;
    } catch (error) {
      this.logger.error(`获取项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**

     * 添加项目成员

     * @param projectId 项目 ID

     * @param userId 用户 ID

     * @param roleId 系统角色 ID

     * @param operatorId 操作者 ID

     * @returns 新添加的成员信息

     */

  async addProjectMember(
    projectId: string,

    userId: string,

    projectRoleId: string,

    operatorId: string
  ) {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      const hasPermission = await this.checkProjectPermission(
        projectId,

        operatorId,

        ['OWNER', 'ADMIN']
      );

      if (!hasPermission) {
        throw new ForbiddenException('没有权限添加项目成员');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      // 检查角色是否存在（项目角色）

      const role = await this.prisma.projectRole.findUnique({
        where: { id: projectRoleId },
      });

      if (!role) {
        throw new NotFoundException('角色不存在');
      }

      // 检查用户是否已经是成员（在 ProjectMember 表中）

      const existingProjectMember = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,

            userId,
          },
        },
      });

      if (existingProjectMember) {
        throw new ForbiddenException('用户已经是项目成员');
      }

      const member = await this.prisma.projectMember.create({
        data: {
          projectId,

          userId,

          projectRoleId,
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

          projectRole: {
            include: {
              permissions: {
                select: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      // 清除权限缓存

      this.permissionService.clearNodeCache(projectId);

      // 记录审计日志

      await this.auditLogService.log(
        AuditAction.ADD_MEMBER,

        ResourceType.PROJECT,

        projectId,

        operatorId,

        true,

        undefined,

        JSON.stringify({
          userId,

          projectRoleId,

          role: role.name,
        })
      );

      this.logger.log(
        `项目成员添加成功: ${projectId} - ${userId} (${role.name}) by ${operatorId}`
      );

      return member;
    } catch (error) {
      // 记录失败的审计日志

      await this.auditLogService.log(
        AuditAction.ADD_MEMBER,

        ResourceType.PROJECT,

        projectId,

        operatorId,

        false,

        error instanceof Error ? error.message : String(error),

        JSON.stringify({
          userId,

          projectRoleId,
        })
      );

      this.logger.error(`添加项目成员失败: ${error.message}`, error.stack);

      throw error;
    }
  }

  /**

       * 更新项目成员角色
   * @param projectId 项目 ID
   * @param userId 用户 ID
   * @param roleId 新角色 ID（系统角色）
   * @param operatorId 操作者 ID
   * @returns 更新后的成员信息
   */
  async updateProjectMember(
    projectId: string,
    userId: string,
    projectRoleId: string,
    operatorId: string
  ) {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      if (project.ownerId === userId) {
        throw new ForbiddenException('不能修改项目所有者的角色');
      }

      const hasPermission = await this.checkProjectPermission(
        projectId,
        operatorId,
        ['OWNER', 'ADMIN']
      );

      if (!hasPermission) {
        throw new ForbiddenException('没有权限更新项目成员角色');
      }

      // 检查角色是否存在（项目角色）
      const role = await this.prisma.projectRole.findUnique({
        where: { id: projectRoleId },
      });

      if (!role) {
        throw new NotFoundException('角色不存在');
      }

      // 不能将成员设置为项目所有者，必须通过转让
      if (role.name === 'OWNER') {
        throw new ForbiddenException(
          '不能直接设置为项目所有者，请使用转让功能'
        );
      }

      // 检查成员是否在 ProjectMember 表中
      const existingProjectMember = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
      });

      if (existingProjectMember) {
        // 更新新系统的成员
        const member = await this.prisma.projectMember.update({
          where: {
            projectId_userId: {
              projectId,
              userId,
            },
          },
          data: { projectRoleId },
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
            projectRole: {
              include: {
                permissions: {
                  select: {
                    permission: true,
                  },
                },
              },
            },
          },
        });

        // 清除权限缓存
        this.permissionService.clearNodeCache(projectId);

        // 记录审计日志
        await this.auditLogService.log(
          AuditAction.UPDATE_MEMBER,
          ResourceType.PROJECT,
          projectId,
          operatorId,
          true,
          undefined,
          JSON.stringify({
            userId,
            projectRoleId,
            role: role.name,
          })
        );

        this.logger.log(
          `项目成员角色更新成功: ${projectId} - ${userId} -> ${role.name} by ${operatorId}`
        );

        return member;
      } else {
        throw new NotFoundException('成员不存在');
      }
    } catch (error) {
      // 记录失败的审计日志
      await this.auditLogService.log(
        AuditAction.UPDATE_MEMBER,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        false,
        error instanceof Error ? error.message : String(error),
        JSON.stringify({
          userId,
          projectRoleId,
        })
      );

      this.logger.error(`更新项目成员角色失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 移除项目成员
   * @param projectId 项目 ID
   * @param userId 用户 ID
   * @param operatorId 操作者 ID
   * @returns 操作结果
   */
  async removeProjectMember(
    projectId: string,
    userId: string,
    operatorId: string
  ) {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      const hasPermission = await this.checkProjectPermission(
        projectId,
        operatorId,
        ['OWNER', 'ADMIN']
      );

      if (!hasPermission) {
        throw new ForbiddenException('没有权限移除项目成员');
      }

      if (project.ownerId === userId) {
        throw new ForbiddenException('不能移除项目所有者');
      }

      // 尝试从 ProjectMember 表删除
      try {
        await this.prisma.projectMember.delete({
          where: {
            projectId_userId: {
              projectId,
              userId,
            },
          },
        });
      } catch {
        throw new NotFoundException('成员不存在');
      }

      // 清除权限缓存
      this.permissionService.clearNodeCache(projectId);

      // 记录审计日志
      await this.auditLogService.log(
        AuditAction.REMOVE_MEMBER,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        true,
        undefined,
        JSON.stringify({
          userId,
        })
      );

      this.logger.log(
        `项目成员移除成功: ${projectId} - ${userId} by ${operatorId}`
      );

      return { message: '成员移除成功' };
    } catch (error) {
      // 记录失败的审计日志
      await this.auditLogService.log(
        AuditAction.REMOVE_MEMBER,
        ResourceType.PROJECT,
        projectId,
        operatorId,
        false,
        error instanceof Error ? error.message : String(error),
        JSON.stringify({
          userId,
        })
      );

      this.logger.error(`移除项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }
  /**
   * 转让项目所有权
   * @param projectId 项目 ID
   * @param newOwnerId 新所有者用户 ID
   * @param currentOwnerId 当前所有者用户 ID
   * @returns 操作结果
   */
  async transferProjectOwnership(
    projectId: string,
    newOwnerId: string,
    currentOwnerId: string
  ) {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      // 只有项目所有者可以转让项目
      if (project.ownerId !== currentOwnerId) {
        throw new ForbiddenException('只有项目所有者可以转让项目');
      }

      // 不能转让给自己
      if (newOwnerId === currentOwnerId) {
        throw new BadRequestException('不能转让给自己');
      }

      // 检查新所有者是否是项目成员
      const newOwnerMember = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: newOwnerId,
          },
        },
      });

      if (!newOwnerMember) {
        throw new BadRequestException('转让目标必须是项目成员');
      }

      // 查找项目所有者角色
      const ownerRole = await this.prisma.role.findFirst({
        where: { name: 'PROJECT_OWNER' },
      });

      if (!ownerRole) {
        throw new NotFoundException('项目所有者角色不存在');
      }

      // 使用事务执行转让
      await this.prisma.$transaction(async (tx) => {
        // 1. 将新所有者的角色改为 PROJECT_OWNER
        await tx.projectMember.update({
          where: {
            projectId_userId: {
              projectId,
              userId: newOwnerId,
            },
          },
          data: { projectRoleId: ownerRole.id },
        });

        // 2. 将原所有者的角色改为 PROJECT_ADMIN（或保留为 PROJECT_ADMIN）
        const adminRole = await tx.role.findFirst({
          where: { name: 'PROJECT_ADMIN' },
        });

        if (adminRole) {
          await tx.projectMember.update({
            where: {
              projectId_userId: {
                projectId,
                userId: currentOwnerId,
              },
            },
            data: { projectRoleId: adminRole.id },
          });
        }

        // 3. 更新项目的 ownerId
        await tx.fileSystemNode.update({
          where: { id: projectId },
          data: { ownerId: newOwnerId },
        });
      });

      // 清除权限缓存
      this.permissionService.clearNodeCache(projectId);

      // 记录审计日志
      await this.auditLogService.log(
        AuditAction.TRANSFER_OWNERSHIP,
        ResourceType.PROJECT,
        projectId,
        currentOwnerId,
        true,
        undefined,
        JSON.stringify({
          fromOwnerId: currentOwnerId,
          toOwnerId: newOwnerId,
        })
      );

      this.logger.log(
        `项目所有权转让成功: ${projectId} from ${currentOwnerId} to ${newOwnerId}`
      );

      return { message: '项目所有权转让成功' };
    } catch (error) {
      // 记录失败的审计日志
      await this.auditLogService.log(
        AuditAction.TRANSFER_OWNERSHIP,
        ResourceType.PROJECT,
        projectId,
        currentOwnerId,
        false,
        error instanceof Error ? error.message : String(error),
        JSON.stringify({
          fromOwnerId: currentOwnerId,
          toOwnerId: newOwnerId,
        })
      );

      this.logger.error(`转让项目所有权失败: ${error.message}`, error.stack);
      throw error;
    }
  }
  /**
   * 批量添加项目成员
   * @param projectId 项目 ID
   * @param members 成员列表
   * @returns 操作结果
   */
  async batchAddProjectMembers(
    projectId: string,
    members: Array<{ userId: string; projectRoleId: string }>
  ): Promise<{
    message: string;
    addedCount: number;
    failedCount: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      let addedCount = 0;
      let failedCount = 0;
      const errors: Array<{ userId: string; error: string }> = [];

      for (const member of members) {
        try {
          await this.addProjectMember(
            projectId,
            member.userId,
            member.projectRoleId,
            'system'
          );
          addedCount++;
        } catch (error) {
          failedCount++;
          errors.push({
            userId: member.userId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (failedCount > 0) {
        this.logger.warn(
          `批量添加项目成员部分失败: ${addedCount} 成功, ${failedCount} 失败`
        );
      }

      return {
        message: `批量添加完成: ${addedCount} 成功, ${failedCount} 失败`,
        addedCount,
        failedCount,
        errors,
      };
    } catch (error) {
      this.logger.error(`批量添加项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 批量更新项目成员角色
   * @param projectId 项目 ID
   * @param updates 更新列表
   * @returns 操作结果
   */
  async batchUpdateProjectMembers(
    projectId: string,
    updates: Array<{ userId: string; projectRoleId: string }>
  ): Promise<{
    message: string;
    updatedCount: number;
    failedCount: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    try {
      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
      });

      if (!project) {
        throw new NotFoundException('项目不存在');
      }

      let updatedCount = 0;
      let failedCount = 0;
      const errors: Array<{ userId: string; error: string }> = [];

      for (const update of updates) {
        try {
          await this.updateProjectMember(
            projectId,
            update.userId,
            update.projectRoleId,
            'system'
          );
          updatedCount++;
        } catch (error) {
          failedCount++;
          errors.push({
            userId: update.userId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (failedCount > 0) {
        this.logger.warn(
          `批量更新项目成员部分失败: ${updatedCount} 成功, ${failedCount} 失败`
        );
      }

      return {
        message: `批量更新完成: ${updatedCount} 成功, ${failedCount} 失败`,
        updatedCount,
        failedCount,
        errors,
      };
    } catch (error) {
      this.logger.error(`批量更新项目成员失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 下载节点（文件或目录）
   * @param nodeId 节点 ID
   * @param userId 用户 ID
   * @returns 文件流或 ZIP 压缩流
   */
  async downloadNode(
    nodeId: string,
    userId: string
  ): Promise<{
    stream: NodeJS.ReadableStream;
    filename: string;
    mimeType: string;
  }> {
    try {
      // 检查文件访问权限
      const hasAccess = await this.checkFileAccess(nodeId, userId);
      if (!hasAccess) {
        throw new ForbiddenException('无权访问该文件');
      }

      // 获取节点信息
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      // 如果是文件，直接返回文件流
      if (!node.isFolder) {
        const storagePath = this.getStoragePath(node);
        const stream = await this.getFileStream(storagePath);
        const filename = node.originalName || node.name;
        const mimeType = this.getMimeType(filename);

        this.logger.log(`文件下载: ${filename} (${nodeId}) by user ${userId}`);
        return { stream, filename, mimeType };
      }

      // 如果是文件夹，返回 ZIP 压缩流
      const zipResult = await this.downloadNodeAsZip(nodeId, userId);
      this.logger.log(`目录下载: ${node.name} (${nodeId}) by user ${userId}`);
      return zipResult;
    } catch (error) {
      this.logger.error(`节点下载失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 将目录压缩为 ZIP 下载
   * @param nodeId 节点 ID
   * @param userId 用户 ID
   * @returns ZIP 压缩流
   */
  private async downloadNodeAsZip(
    nodeId: string,
    userId: string
  ): Promise<{
    stream: NodeJS.ReadableStream;
    filename: string;
    mimeType: string;
  }> {
    try {
      // 获取节点信息
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      // 创建 ZIP 压缩流
      const output = new PassThrough();
      const archive = archiver.create('zip', {
        zlib: { level: this.ZIP_CONFIG.COMPRESSION_LEVEL }, // 快速压缩
      });

      // 错误处理
      archive.on('error', (error) => {
        this.logger.error(`ZIP 压缩失败: ${error.message}`, error.stack);
        output.emit('error', error);
      });

      // 将 archive 管道输出到 PassThrough
      archive.pipe(output);

      // 递归收集并添加所有文件到 ZIP
      const result = await this.addFilesToArchive(
        nodeId,
        archive,
        node.name,
        0,
        0,
        0
      );

      // 完成压缩
      await archive.finalize();

      const filename = `${node.name}.zip`;
      const mimeType = 'application/zip';

      this.logger.log(
        `目录压缩下载: ${node.name} (${nodeId}), files: ${result.fileCount}, size: ${result.totalSize} bytes by user ${userId}`
      );

      return { stream: output, filename, mimeType };
    } catch (error) {
      this.logger.error(`目录压缩下载失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 递归添加文件到压缩包
   * @param nodeId 节点 ID
   * @param archive archiver 实例
   * @param basePath 基础路径
   * @param depth 当前深度
   * @param currentTotalSize 当前总大小
   * @param currentFileCount 当前文件数量
   */
  private async addFilesToArchive(
    nodeId: string,
    archive: archiver.Archiver,
    basePath: string,
    depth: number = 0,
    currentTotalSize: number = 0,
    currentFileCount: number = 0
  ): Promise<{ totalSize: number; fileCount: number }> {
    // 检查深度限制
    if (depth > this.ZIP_CONFIG.MAX_DEPTH) {
      this.logger.warn(`目录深度超过限制: ${depth}`);
      throw new BadRequestException('目录深度超过限制');
    }

    // 获取节点信息
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      return { totalSize: currentTotalSize, fileCount: currentFileCount };
    }

    // 如果是文件，添加到压缩包
    if (!node.isFolder && node.path) {
      // 检查单文件大小限制
      if (node.size && node.size > this.ZIP_CONFIG.MAX_SINGLE_FILE_SIZE) {
        this.logger.warn(`文件大小超过限制: ${node.name} (${node.size} bytes)`);
        throw new BadRequestException(`文件大小超过限制: ${node.name}`);
      }

      const storagePath = this.getStoragePath(node);
      let stream: NodeJS.ReadableStream | null = null;

      try {
        stream = await this.getFileStream(storagePath);
        const filename = node.originalName || node.name;
        // 验证文件名，防止路径遍历
        const sanitizedFileName = this.sanitizeFileName(filename);
        archive.append(stream as any, { name: sanitizedFileName });

        // 监听流关闭事件
        stream.on('close', () => {
          this.logger.debug(`文件流已关闭: ${filename}`);
        });

        // 更新统计信息
        const fileSize = node.size || 0;
        currentTotalSize += fileSize;
        currentFileCount++;

        return { totalSize: currentTotalSize, fileCount: currentFileCount };
      } catch (error) {
        this.logger.warn(
          `添加文件到压缩包失败: ${node.name} - ${error.message}`
        );
        // 确保流被关闭
        if (stream && typeof (stream as any).destroy === 'function') {
          (stream as any).destroy();
        }
        throw error;
      }
    }

    // 如果是文件夹，递归处理子节点
    if (node.isFolder) {
      const children = await this.prisma.fileSystemNode.findMany({
        where: {
          parentId: nodeId,
          deletedAt: null,
        },
      });

      for (const child of children) {
        // 验证文件名，防止路径遍历
        const sanitizedChildName = this.sanitizeFileName(child.name);
        const childPath = path.join(basePath, sanitizedChildName);

        const result = await this.addFilesToArchive(
          child.id,
          archive,
          childPath,
          depth + 1,
          currentTotalSize,
          currentFileCount
        );

        currentTotalSize = result.totalSize;
        currentFileCount = result.fileCount;

        // 检查资源限制
        if (currentTotalSize > this.ZIP_CONFIG.MAX_TOTAL_SIZE) {
          this.logger.warn(`压缩包总大小超过限制: ${currentTotalSize} bytes`);
          throw new BadRequestException('压缩包总大小超过限制');
        }
        if (currentFileCount > this.ZIP_CONFIG.MAX_FILE_COUNT) {
          this.logger.warn(`文件数量超过限制: ${currentFileCount}`);
          throw new BadRequestException('文件数量超过限制');
        }
      }
    }

    return { totalSize: currentTotalSize, fileCount: currentFileCount };
  }

  /**
   * 获取文件的 MIME 类型
   * @param filename 文件名
   * @returns MIME 类型
   */
  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      // CAD 文件
      dwg: 'application/acad',
      dxf: 'application/dxf',

      // 文档文件
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain; charset=utf-8',
      rtf: 'application/rtf',
      odt: 'application/vnd.oasis.opendocument.text',
      ods: 'application/vnd.oasis.opendocument.spreadsheet',
      odp: 'application/vnd.oasis.opendocument.presentation',

      // 图片文件
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      tiff: 'image/tiff',
      tif: 'image/tiff',

      // 音频文件
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4',
      flac: 'audio/flac',

      // 视频文件
      mp4: 'video/mp4',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      wmv: 'video/x-ms-wmv',
      mkv: 'video/x-matroska',
      webm: 'video/webm',

      // 压缩文件
      zip: 'application/zip',
      rar: 'application/vnd.rar',
      '7z': 'application/x-7z-compressed',
      tar: 'application/x-tar',
      gz: 'application/gzip',
      bz2: 'application/x-bzip2',

      // 数据文件
      json: 'application/json',
      xml: 'application/xml',
      yaml: 'application/x-yaml',
      yml: 'application/x-yaml',
      csv: 'text/csv',
      sql: 'application/sql',

      // 代码文件
      js: 'application/javascript',
      ts: 'application/typescript',
      html: 'text/html',
      css: 'text/css',
      md: 'text/markdown',
      py: 'text/x-python',
      java: 'text/x-java-source',
      c: 'text/x-c',
      cpp: 'text/x-c++',
      h: 'text/x-c',
      hpp: 'text/x-c++',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
}
