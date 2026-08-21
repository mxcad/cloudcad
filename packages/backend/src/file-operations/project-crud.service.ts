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
  Inject,
  ForbiddenException,
} from '@nestjs/common';
import {
  ProjectStatus,
  FileSystemNode as PrismaFileSystemNode,
  Prisma,
  NodeType,
} from '@cloudcad/db';
import { FileStatus } from '../common/enums/file-status.enum';
import { DatabaseService } from '../database/database.service';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { PersonalSpaceService } from '../personal-space/personal-space.service';
import { CreateProjectDto } from '../file-system/dto/create-project.dto';
import { CreateFolderDto } from '../file-system/dto/create-folder.dto';
import { UpdateNodeDto } from '../file-system/dto/update-node.dto';
import { UpdateTransferSettingsDto } from '../file-system/dto/update-transfer-settings.dto';
import { QueryProjectsDto } from '../file-system/dto/query-projects.dto';
import { NodeNameService } from './node-name.service';
import { TreeWalker } from '../file-system/file-tree/tree-walker.service';
import { FtsQueryBuilder } from '../file-system/search/fts-query-builder';
import { NodeMutationGuard } from './node-mutation.guard';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../permission/interfaces/permission-service.interface';
import { SystemPermission, ProjectRole } from '../common/enums/permissions.enum';
import { ProjectRolesService } from '../roles/project-roles.service';
import {
  isRootNode,
  getLibraryKeyFromNodeType,
} from '../file-system/utils/node-type';
import { I18nContext } from 'nestjs-i18n';
import {
  NodeListResponseDto,
  FileSystemNodeDto,
} from '../file-system/dto/file-system-response.dto';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';

@Injectable()
export class ProjectCrudService {
  private readonly logger = new Logger(ProjectCrudService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storageManager: StorageManager,
    private readonly personalSpaceService: PersonalSpaceService,
    private readonly nodeNameService: NodeNameService,
    private readonly treeWalker: TreeWalker,
    private readonly ftsQueryBuilder: FtsQueryBuilder,
    private readonly nodeMutationGuard: NodeMutationGuard,
    @Inject(IPERMISSION_SERVICE)
    private readonly systemPermissionService: IPermissionService,
    private readonly auditLogService: AuditLogService,
    private readonly projectRolesService: ProjectRolesService
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
        await this.nodeNameService.checkNameUniqueness(name, userId, null);

        // 创建项目走系统权限 PROJECT_CREATE（与 POST /projects 路由装饰器语义一致；
        // 装饰器已迁移到 service 层，防止无 parentId 分支绕过权限）
        const hasPermission =
          await this.systemPermissionService.checkSystemPermission(
            userId,
            SystemPermission.PROJECT_CREATE
          );
        if (!hasPermission) {
          throw new ForbiddenException(
            I18nContext.current()?.t('error.auth.permission_denied') ??
              '您没有权限执行此操作'
          );
        }

        await this.nodeMutationGuard.assertProjectQuota(userId);

        // ADR-00XX 模板化：事务内「建项目 → 复制模板角色为项目副本 → owner 成员挂副本」。
        // 项目创建后角色完全自治（可增删改），模板变更只影响新建项目。
        const node = await this.prisma.$transaction(async (tx) => {
          const created = await tx.fileSystemNode.create({
            data: {
              name,
              description,
              nodeType: NodeType.PROJECT,
              projectStatus: ProjectStatus.ACTIVE,
              ownerId: userId,
            },
          });

          const roleMap =
            await this.projectRolesService.copyTemplatesToProject(
              created.id,
              tx
            );

          const ownerRoleId = roleMap.get(ProjectRole.OWNER);
          if (!ownerRoleId) {
            throw new InternalServerErrorException(
              'PROJECT_OWNER 角色不存在，请检查系统初始化'
            );
          }

          await tx.projectMember.create({
            data: {
              projectId: created.id,
              userId,
              projectRoleId: ownerRoleId,
            },
          });

          return created;
        });

        this.logger.log(`项目创建成功: ${node.name} by user ${userId}`);

        // #207 阶段 2：项目创建埋点（PROJECT_CREATE，带项目维度 + 名称快照）
        await this.auditLogService.log(
          AuditAction.PROJECT_CREATE,
          ResourceType.PROJECT,
          node.id,
          userId,
          true,
          undefined,
          undefined,
          node.id,
          node.name,
          { projectName: node.name }
        );

        return node;
      }

      const parent = await this.prisma.fileSystemNode.findUnique({
        where: { id: parentId },
        select: { id: true, nodeType: true, projectId: true },
      });

      if (!parent) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.file.parent_not_found') ??
            '父节点不存在'
        );
      }

      // 除文件(FILE)外，其他节点类型（文件夹、项目、个人空间、资源库等）
      // 本质上都是特殊的文件夹/根目录，均可作为父容器。
      if (parent.nodeType === NodeType.FILE) {
        throw new BadRequestException(
          I18nContext.current()?.t(
            'error.file_extra.cannot_create_subfolder_in_file'
          ) ?? '不能在文件下创建子文件夹'
        );
      }

      // 权限断言（替代装饰器 FILE_CREATE：项目→成员权限、个人空间→owner、资源库→系统权限）
      await this.nodeMutationGuard.assertMutationAllowed(userId, 'create', {
        node: { id: parentId },
      });

      // 检查文件夹名称唯一性
      await this.nodeNameService.checkNameUniqueness(name, userId, parentId);

      // 获取正确的projectId
      const projectId = await this.treeWalker.resolveProjectId(parentId);

      const node = await this.prisma.fileSystemNode.create({
        data: {
          name,
          description,
          nodeType: NodeType.FOLDER,
          parentId,
          ownerId: userId,
          projectId,
        },
      });

      this.logger.log(`文件夹创建成功: ${node.name} by user ${userId}`);
      // 文件夹创建审计（FOLDER_CREATE）：仅项目内节点记录（个人空间/公共资源库不记）
      await this.auditLogService.logProjectNodeAction(
        AuditAction.FOLDER_CREATE,
        node.id,
        userId,
        undefined,
        ResourceType.FOLDER
      );
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
          nodeType: NodeType.FOLDER,
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
    await this.nodeNameService.checkNameUniqueness(dto.name, userId, parentId);

    return this.createNode(userId, dto.name, { parentId });
  }

  async getUserProjects(
    userId: string,
    query?: QueryProjectsDto
  ): Promise<NodeListResponseDto> {
    const {
      search,
      projectStatus,
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      filter,
    } = query || {};
    // HTTP 查询参数是字符串，确保转为数字
    const ALLOWED_SORT = ['name', 'createdAt', 'updatedAt', 'size'];
    if (sortBy && !ALLOWED_SORT.includes(sortBy)) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file_extra.sort_unsupported', {
          args: { field: sortBy },
        }) ?? `不支持的排序字段: ${sortBy}`
      );
    }
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const permissionAnd: Prisma.FileSystemNodeWhereInput[] = (() => {
      switch (filter) {
        case 'owned':
          return [{ ownerId: userId }];
        case 'joined':
          return [
            { projectMembers: { some: { userId } } },
            { ownerId: { not: userId } },
          ];
        case 'all':
        default:
          return [
            {
              OR: [
                { ownerId: userId },
                { projectMembers: { some: { userId } } },
              ],
            },
          ];
      }
    })();

    const where: Prisma.FileSystemNodeWhereInput = {
      nodeType: NodeType.PROJECT,
      deletedAt: null,
      AND: permissionAnd,
    };

    if (search) {
      const ftsMatch = await this.ftsQueryBuilder.matchIds(search);
      where.OR = this.ftsQueryBuilder.buildSearchOrConditions(search, ftsMatch);
    }

    if (projectStatus) {
      where.projectStatus = projectStatus;
    }

    try {
      const [nodes, total] = await Promise.all([
        this.prisma.fileSystemNode.findMany({
          where,
          skip,
          take: limitNum,
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

      const nodeList: FileSystemNodeDto[] = nodes.map((node) => ({
        id: node.id,
        name: node.name,
        description: node.description,
        nodeType: node.nodeType,
        isFolder: node.nodeType !== NodeType.FILE,
        isRoot: isRootNode(node),
        parentId: node.parentId,
        path: node.path,
        size: node.size,
        mimeType: node.mimeType,
        fileHash: node.fileHash,
        fileStatus: node.fileStatus as FileStatus,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        deletedAt: node.deletedAt,
        ownerId: node.ownerId,
        personalSpaceKey:
          node.nodeType === NodeType.PERSONAL_SPACE ? node.ownerId : null,
        libraryKey: getLibraryKeyFromNodeType(node.nodeType),
        childrenCount: node._count?.children,
        memberCount: node._count?.projectMembers,
        projectId: node.projectId,
        transferOutToProject: node.transferOutToProject,
        transferOutToPersonalSpace: node.transferOutToPersonalSpace,
        transferOutToLibrary: node.transferOutToLibrary,
        transferInFromProject: node.transferInFromProject,
        transferInFromPersonalSpace: node.transferInFromPersonalSpace,
        transferInFromLibrary: node.transferInFromLibrary,
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

  async getUserDeletedProjects(
    userId: string,
    query?: QueryProjectsDto
  ): Promise<NodeListResponseDto> {
    const { search, page = 1, limit = 20, sortBy, sortOrder } = query || {};
    const ALLOWED_SORT = ['name', 'createdAt', 'updatedAt', 'size'];
    if (sortBy && !ALLOWED_SORT.includes(sortBy)) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file_extra.sort_unsupported', {
          args: { field: sortBy },
        }) ?? `不支持的排序字段: ${sortBy}`
      );
    }
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.FileSystemNodeWhereInput = {
      nodeType: NodeType.PROJECT,
      deletedAt: { not: null },
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
      const ftsMatch = await this.ftsQueryBuilder.matchIds(
        search,
        200,
        Prisma.sql`"deletedAt" IS NOT NULL`
      );
      where.OR = this.ftsQueryBuilder.buildSearchOrConditions(search, ftsMatch);
    }

    try {
      const [nodes, total] = await Promise.all([
        this.prisma.fileSystemNode.findMany({
          where,
          skip,
          take: limitNum,
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

      const nodeList: FileSystemNodeDto[] = nodes.map((node) => ({
        id: node.id,
        name: node.name,
        description: node.description,
        nodeType: node.nodeType,
        isFolder: node.nodeType !== NodeType.FILE,
        isRoot: isRootNode(node),
        parentId: node.parentId,
        path: node.path,
        size: node.size,
        mimeType: node.mimeType,
        fileHash: node.fileHash,
        fileStatus: node.fileStatus as FileStatus,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        deletedAt: node.deletedAt,
        ownerId: node.ownerId,
        personalSpaceKey:
          node.nodeType === NodeType.PERSONAL_SPACE ? node.ownerId : null,
        libraryKey: getLibraryKeyFromNodeType(node.nodeType),
        childrenCount: node._count?.children,
        memberCount: node._count?.projectMembers,
        projectId: node.projectId,
        transferOutToProject: node.transferOutToProject,
        transferOutToPersonalSpace: node.transferOutToPersonalSpace,
        transferOutToLibrary: node.transferOutToLibrary,
        transferInFromProject: node.transferInFromProject,
        transferInFromPersonalSpace: node.transferInFromPersonalSpace,
        transferInFromLibrary: node.transferInFromLibrary,
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

  async getProject(projectId: string, includeDeleted: boolean = false) {
    try {
      const project = await this.prisma.fileSystemNode.findFirst({
        where: {
          id: projectId,
          nodeType: NodeType.PROJECT,
          ...(includeDeleted ? {} : { deletedAt: null }),
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
              nodeType: true,
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
        throw new NotFoundException(
          I18nContext.current()?.t(
            'error.file_extra.project_not_exist_or_deleted',
            { args: { id: projectId } }
          ) ?? `项目不存在或已被删除: ${projectId}`
        );
      }

      return project;
    } catch (error) {
      this.logger.error(`查询项目失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateProject(projectId: string, dto: UpdateNodeDto, userId?: string) {
    try {
      const currentProject = await this.prisma.fileSystemNode.findFirst({
        where: { id: projectId, nodeType: NodeType.PROJECT, deletedAt: null },
        select: {
          id: true,
          name: true,
          ownerId: true,
          nodeType: true,
        },
      });

      if (!currentProject) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.project.not_found') ?? '项目不存在'
        );
      }

      if (userId) {
        await this.nodeMutationGuard.assertMutationAllowed(
          userId,
          'project-update',
          {
            node: { id: projectId },
          }
        );
      }

      if (dto.name && dto.name !== currentProject.name) {
        await this.nodeNameService.checkNameUniqueness(
          dto.name,
          currentProject.ownerId,
          null,
          projectId
        );
      }

      const project = await this.prisma.fileSystemNode.update({
        where: { id: projectId, nodeType: NodeType.PROJECT },
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

      // #207 阶段 2：项目更新埋点（PROJECT_UPDATE，仅敏感字段变更时记录）
      if (userId) {
        const changed: string[] = [];
        const params: Record<string, unknown> = { projectName: project.name };
        if (dto.name !== undefined && dto.name !== currentProject.name) {
          changed.push('name');
          params.oldName = currentProject.name;
          params.newName = dto.name;
        }
        if (dto.description !== undefined) {
          changed.push('description');
        }
        if (dto.status !== undefined) {
          changed.push('status');
          params.newStatus = dto.status;
        }
        if (changed.length > 0) {
          await this.auditLogService.log(
            AuditAction.PROJECT_UPDATE,
            ResourceType.PROJECT,
            projectId,
            userId,
            true,
            undefined,
            undefined,
            projectId,
            project.name,
            params
          );
        }
      }

      return project;
    } catch (error) {
      this.logger.error(`项目更新失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 更新跨项目转移设置（6 域模式矩阵，部分更新）。
   * 权限由 Controller 的 @RequireProjectPermission(PROJECT_TRANSFER_MANAGE) 把关；
   * 这里仅校验项目存在并落库。
   */
  /**
   * 更新跨项目转移设置（6 域模式矩阵，部分更新）。
   * 权限由 Controller 的 @RequireProjectPermission(PROJECT_TRANSFER_MANAGE) 把关；
   * 这里仅校验项目存在、落库并记审计（转移策略属敏感操作，与项目更新同动作）。
   */
  async updateTransferSettings(
    projectId: string,
    dto: UpdateTransferSettingsDto,
    userId?: string
  ) {
    const currentProject = await this.prisma.fileSystemNode.findFirst({
      where: { id: projectId, nodeType: NodeType.PROJECT, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!currentProject) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.project.not_found') ?? '项目不存在'
      );
    }

    const data = {
      transferOutToProject: dto.transferOutToProject,
      transferOutToPersonalSpace: dto.transferOutToPersonalSpace,
      transferOutToLibrary: dto.transferOutToLibrary,
      transferInFromProject: dto.transferInFromProject,
      transferInFromPersonalSpace: dto.transferInFromPersonalSpace,
      transferInFromLibrary: dto.transferInFromLibrary,
    };
    // 仅写入传入字段（undefined 字段 Prisma 忽略）
    const project = await this.prisma.fileSystemNode.update({
      where: { id: projectId, nodeType: NodeType.PROJECT },
      data,
    });

    // 转移策略变更审计（PROJECT_UPDATE，参数记录变更方向；无操作者不记）
    if (userId) {
      const changedFields = Object.keys(data).filter(
        (k) => data[k as keyof typeof data] !== undefined
      );
      if (changedFields.length > 0) {
        await this.auditLogService.log(
          AuditAction.PROJECT_UPDATE,
          ResourceType.PROJECT,
          projectId,
          userId,
          true,
          undefined,
          undefined,
          projectId,
          project.name,
          { transferSettings: changedFields.join(',') }
        );
      }
    }
    return project;
  }

  getStoragePath(node: PrismaFileSystemNode): string {
    if (!node.path) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.file_extra.path_not_exist') ??
          '文件路径不存在'
      );
    }
    return this.storageManager.getFullPath(node.path);
  }

  getFullPath(nodePath: string): string {
    if (!nodePath) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.file_extra.path_not_exist') ??
          '文件路径不存在'
      );
    }
    return this.storageManager.getFullPath(nodePath);
  }

  getStorageManager(): StorageManager {
    return this.storageManager;
  }
}
