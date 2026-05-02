///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ProjectStatus,
  FileSystemNode as PrismaFileSystemNode,
} from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { StorageManager } from '../common/services/storage-manager.service';
import { FileSystemPermissionService } from '../file-system/file-permission/file-system-permission.service';
import { PersonalSpaceService } from '../personal-space/personal-space.service';
import { CreateProjectDto } from '../file-system/dto/create-project.dto';
import { CreateFolderDto } from '../file-system/dto/create-folder.dto';
import { UpdateNodeDto } from '../file-system/dto/update-node.dto';
import { QueryProjectsDto } from '../file-system/dto/query-projects.dto';
import { FileOperationsService } from './file-operations.service';
import { FileTreeService } from '../file-system/file-tree/file-tree.service';
import { NodeListResponseDto, FileSystemNodeDto } from '../file-system/dto/file-system-response.dto';
import * as path from 'path';

@Injectable()
export class ProjectCrudService {
  private readonly logger = new Logger(ProjectCrudService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storageManager: StorageManager,
    private readonly permissionService: FileSystemPermissionService,
    private readonly personalSpaceService: PersonalSpaceService,
    private readonly fileOperationsService: FileOperationsService,
    private readonly fileTreeService: FileTreeService
  ) {}

  async createNode(
    userId: string,
    name: string,
    options?: {
      parentId?: string;
      description?: string;
    }
  ) {
    const { parentId, description } = options || {};
    const isProject = !parentId;

    try {
      if (isProject) {
        await this.fileOperationsService.checkNameUniqueness(
          name,
          userId,
          null
        );

        const ownerRole = await this.prisma.projectRole.findFirst({
          where: { name: 'PROJECT_OWNER', isSystem: true },
        });

        if (!ownerRole) {
          throw new InternalServerErrorException(
            'PROJECT_OWNER 角色不存在，请检查系统初始化'
          );
        }

        const node = await this.prisma.fileSystemNode.create({
          data: {
            name,
            description,
            isFolder: true,
            isRoot: true,
            projectStatus: ProjectStatus.ACTIVE,
            ownerId: userId,
            projectMembers: {
              create: {
                userId,
                projectRoleId: ownerRole.id,
              },
            },
          },
        });

        this.logger.log(`项目创建成功: ${node.name} by user ${userId}`);
        return node;
      }

      const parent = await this.prisma.fileSystemNode.findUnique({
        where: { id: parentId },
        select: { id: true, isFolder: true, isRoot: true, projectId: true },
      });

      if (!parent) {
        throw new NotFoundException('父节点不存在');
      }

      if (!parent.isFolder) {
        throw new BadRequestException('只能在文件夹下创建子文件夹');
      }

      // 检查文件夹名称唯一性
      await this.fileOperationsService.checkNameUniqueness(
        name,
        userId,
        parentId
      );

      // 获取正确的projectId
      const projectId = await this.fileTreeService.getProjectId(parentId);
      
      const node = await this.prisma.fileSystemNode.create({
        data: {
          name,
          description,
          isFolder: true,
          isRoot: false,
          parentId,
          ownerId: userId,
          projectId,
        },
      });

      this.logger.log(`文件夹创建成功: ${node.name} by user ${userId}`);
      return node;
    } catch (error) {
      this.logger.error(`节点创建失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async createProject(userId: string, dto: CreateProjectDto) {
    return this.createNode(userId, dto.name, { description: dto.description });
  }

  async createFolder(userId: string, parentId: string, dto: CreateFolderDto) {
    // 如果 skipIfExists 为 true，先检查同名文件夹是否存在
    const shouldSkip = dto.skipIfExists === true;
    if (shouldSkip) {
      const existingFolder = await this.prisma.fileSystemNode.findFirst({
        where: {
          name: {
            equals: dto.name,
            mode: 'insensitive',
          },
          parentId: parentId || null,
          isFolder: true,
          deletedAt: null,
        },
        select: { id: true },
      });

      // 如果存在，直接返回现有文件夹ID
      if (existingFolder) {
        this.logger.log(
          `文件夹已存在，跳过创建: ${dto.name} (ID: ${existingFolder.id})`
        );
        return await this.prisma.fileSystemNode.findUnique({
          where: { id: existingFolder.id },
        });
      }
    }

    // 非 skipIfExists 模式或文件夹不存在时，检查名称唯一性后再创建
    await this.fileOperationsService.checkNameUniqueness(
      dto.name,
      userId,
      parentId
    );

    return this.createNode(userId, dto.name, { parentId });
  }

  async getUserProjects(userId: string, query?: QueryProjectsDto): Promise<NodeListResponseDto> {
    const {
      search,
      projectStatus,
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      filter,
    } = query || {};
    const skip = (page - 1) * limit;

    let ownerCondition: any;

    switch (filter) {
      case 'owned':
        ownerCondition = { ownerId: userId };
        break;
      case 'joined':
        ownerCondition = {
          projectMembers: {
            some: { userId },
          },
          ownerId: { not: userId },
        };
        break;
      case 'all':
      default:
        ownerCondition = {
          OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
        };
        break;
    }

    const where: any = {
      isRoot: true,
      deletedAt: null,
      personalSpaceKey: null,
      libraryKey: null,
      ...ownerCondition,
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
      const [nodes, total] = await Promise.all([
        this.prisma.fileSystemNode.findMany({
          where,
          skip,
          take: limit,
          orderBy: sortBy ? { [sortBy]: sortOrder } : { updatedAt: 'desc' },
          include: {
            _count: {
              select: {
                children: {
                  where: { deletedAt: null },
                },
                projectMembers: true,
              },
            },
          },
        }),
        this.prisma.fileSystemNode.count({ where }),
      ]);

      const nodeList: FileSystemNodeDto[] = nodes.map(node => ({
        id: node.id,
        name: node.name,
        description: node.description,
        isFolder: node.isFolder,
        isRoot: node.isRoot,
        parentId: node.parentId,
        path: node.path,
        size: node.size,
        mimeType: node.mimeType,
        fileHash: node.fileHash,
        fileStatus: node.fileStatus,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        deletedAt: node.deletedAt,
        ownerId: node.ownerId,
        personalSpaceKey: node.personalSpaceKey,
        libraryKey: node.libraryKey,
        childrenCount: node._count?.children,
        projectId: node.projectId,
      }));

      return {
        nodes: nodeList,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(`查询项目列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserDeletedProjects(userId: string, query?: QueryProjectsDto): Promise<NodeListResponseDto> {
    const { search, page = 1, limit = 20, sortBy, sortOrder } = query || {};
    const skip = (page - 1) * limit;

    const where: any = {
      isRoot: true,
      deletedAt: { not: null },
      personalSpaceKey: null,
      libraryKey: null,
      OR: [
        { ownerId: userId },
        {
          projectMembers: {
            some: { userId },
          },
        },
      ],
    };

    this.logger.log(
      `查询已删除项目 - 用户ID: ${userId}, 查询条件: ${JSON.stringify(where)}`
    );

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    try {
      const [nodes, total] = await Promise.all([
        this.prisma.fileSystemNode.findMany({
          where,
          skip,
          take: limit,
          orderBy: sortBy ? { [sortBy]: sortOrder } : { deletedAt: 'desc' },
          include: {
            _count: {
              select: {
                children: {
                  where: { deletedAt: null },
                },
                projectMembers: true,
              },
            },
          },
        }),
        this.prisma.fileSystemNode.count({ where }),
      ]);

      this.logger.log(
        `查询已删除项目结果 - 找到 ${nodes.length} 个项目，总计 ${total} 个`
      );

      const nodeList: FileSystemNodeDto[] = nodes.map(node => ({
        id: node.id,
        name: node.name,
        description: node.description,
        isFolder: node.isFolder,
        isRoot: node.isRoot,
        parentId: node.parentId,
        path: node.path,
        size: node.size,
        mimeType: node.mimeType,
        fileHash: node.fileHash,
        fileStatus: node.fileStatus,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        deletedAt: node.deletedAt,
        ownerId: node.ownerId,
        personalSpaceKey: node.personalSpaceKey,
        libraryKey: node.libraryKey,
        childrenCount: node._count?.children,
        projectId: node.projectId,
      }));

      return {
        nodes: nodeList,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(
        `查询已删除项目列表失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  async getPersonalSpace(userId: string) {
    return this.personalSpaceService.getPersonalSpace(userId);
  }

  async getProject(projectId: string) {
    try {
      const project = await this.prisma.fileSystemNode.findFirst({
        where: {
          id: projectId,
          isRoot: true,
          deletedAt: null,
          libraryKey: null,
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
      const currentProject = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
        select: {
          id: true,
          name: true,
          ownerId: true,
          isRoot: true,
        },
      });

      if (!currentProject) {
        throw new NotFoundException('项目不存在');
      }

      if (dto.name && dto.name !== currentProject.name) {
        await this.fileOperationsService.checkNameUniqueness(
          dto.name,
          currentProject.ownerId,
          null,
          projectId
        );
      }

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

  getStoragePath(node: PrismaFileSystemNode): string {
    if (!node.path) {
      throw new NotFoundException('文件路径不存在');
    }
    return this.storageManager.getFullPath(node.path);
  }

  getFullPath(nodePath: string): string {
    if (!nodePath) {
      throw new NotFoundException('文件路径不存在');
    }
    return this.storageManager.getFullPath(nodePath);
  }

  getStorageManager(): StorageManager {
    return this.storageManager;
  }
}
