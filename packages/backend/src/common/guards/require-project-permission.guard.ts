///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IPROJECT_PERMISSION_SERVICE,
  IProjectPermissionService,
} from '../../roles/interfaces/project-permission-service.interface';
import {
  REQUIRE_PROJECT_PERMISSION_KEY,
  REQUIRE_PROJECT_PERMISSION_MODE_KEY,
  ProjectPermissionCheckMode,
} from '../decorators/require-project-permission.decorator';
import { IS_OPTIONAL_AUTH_KEY } from '../../auth/decorators/optional-auth.decorator';
import { IS_LIBRARY_PUBLIC_KEY } from '../decorators/library-public.decorator';
import { ProjectPermission, SystemPermission } from '../enums/permissions.enum';
import { NodeType } from '@cloudcad/db';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../../permission/interfaces/permission-service.interface';
import { NodeContextResolver } from '../node-context/node-context-resolver';
import { NodeContext } from '../node-context/node-context.types';
import { DatabaseService } from '../../database/database.service';

import { I18nContext } from 'nestjs-i18n';
/**
 * 项目权限检查 Guard
 *
 * 功能：
 * 1. 检查用户是否具有所需的项目权限
 * 2. 支持 AND 和 OR 逻辑
 * 3. 自动从请求中提取用户信息和项目 ID
 * 4. 项目所有者自动通过所有权限检查
 * 5. **智能节点类型判断**：自动检测公开资源库节点并检查系统权限
 */
@Injectable()
export class RequireProjectPermissionGuard implements CanActivate {
  private readonly logger = new Logger(RequireProjectPermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(IPROJECT_PERMISSION_SERVICE)
    private readonly projectPermissionService: IProjectPermissionService,
    @Inject(IPERMISSION_SERVICE)
    private readonly systemPermissionService: IPermissionService,
    private readonly nodeContextResolver: NodeContextResolver,
    private readonly prisma: DatabaseService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targetClass = context.getClass();
    const targetHandler = context.getHandler();

    const requiredPermissions =
      this.reflector.get<ProjectPermission[]>(
        REQUIRE_PROJECT_PERMISSION_KEY,
        targetHandler
      ) ||
      this.reflector.get<ProjectPermission[]>(
        REQUIRE_PROJECT_PERMISSION_KEY,
        targetClass
      );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const mode =
      this.reflector.get<ProjectPermissionCheckMode>(
        REQUIRE_PROJECT_PERMISSION_MODE_KEY,
        targetHandler
      ) ||
      this.reflector.get<ProjectPermissionCheckMode>(
        REQUIRE_PROJECT_PERMISSION_MODE_KEY,
        targetClass
      ) ||
      ProjectPermissionCheckMode.ALL;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    const ctx = await this.nodeContextResolver.resolve(request);

    // 公共资源库公开访问：标记了 @LibraryPublicAccess() 的端点（缩略图读/上传等读辅助操作），
    // 目标节点属于公共资源库（含库内文件/文件夹）时直接放行，不要求 LIBRARY_*_MANAGE。
    // 库内写操作（保存/删除/上传 CAD 等）不走此分支，仍由 NodeMutationGuard / LibraryController 权限控制。
    const isLibraryPublic = this.reflector.getAllAndOverride<boolean>(
      IS_LIBRARY_PUBLIC_KEY,
      [targetHandler, targetClass]
    );
    if (isLibraryPublic && (await this.isLibraryContext(ctx))) {
      return true;
    }

    if (!userId) {
      const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
        IS_OPTIONAL_AUTH_KEY,
        [targetHandler, targetClass]
      );
      if (isOptionalAuth) {
        return true;
      }
      throw new ForbiddenException(
        I18nContext.current()?.t('error.auth.unauthorized') ?? '用户未认证'
      );
    }

    if (ctx.isLibraryNode) {
      return this.handleLibraryAccess(
        userId,
        ctx.libraryRootType ?? ctx.nodeType
      );
    }

    if (ctx.isPersonalSpace) {
      return this.handlePersonalSpaceAccess(userId, ctx.ownerId);
    }

    if (ctx.nodeId && ctx.nodeType && !ctx.projectId) {
      if (ctx.ownerId === userId) {
        return true;
      }
      throw new ForbiddenException(
        I18nContext.current()?.t('error.auth.permission_denied') ??
          '您没有权限执行此操作'
      );
    }

    if (!ctx.projectId) {
      const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
        IS_OPTIONAL_AUTH_KEY,
        [targetHandler, targetClass]
      );
      if (isOptionalAuth) {
        this.logger.debug(
          `[OptionalAuth] 缺少projectId但端点标记为OptionalAuth，放行给Controller处理`
        );
        return true;
      }
      throw new BadRequestException(
        I18nContext.current()?.t('error.resource.missing_project_id') ??
          '缺少项目ID参数'
      );
    }

    return this.handleProjectAccess(
      userId,
      ctx.projectId,
      requiredPermissions,
      mode
    );
  }

  private async handleLibraryAccess(
    userId: string,
    nodeType: string | null
  ): Promise<boolean> {
    const libraryType =
      nodeType === NodeType.LIBRARY_DRAWING ? 'drawing' : 'block';
    const requiredPermission =
      libraryType === 'drawing'
        ? SystemPermission.LIBRARY_DRAWING_MANAGE
        : SystemPermission.LIBRARY_BLOCK_MANAGE;

    const hasPermission =
      await this.systemPermissionService.checkSystemPermission(
        userId,
        requiredPermission
      );
    if (!hasPermission) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.file.no_repo_access') ??
          '没有访问该资源库的权限'
      );
    }

    return true;
  }

  /**
   * 判断请求目标节点是否属于公共资源库（图纸库/图块库）
   * - 库根节点（LIBRARY_DRAWING/LIBRARY_BLOCK）直接判定
   * - 库内文件/文件夹（nodeType 为 FILE/FOLDER，projectId 指向库根）通过 projectId 上溯判定
   */
  private async isLibraryContext(ctx: NodeContext): Promise<boolean> {
    if (ctx.isLibraryNode) return true;
    if (!ctx.projectId) return false;
    const root = await this.prisma.fileSystemNode.findUnique({
      where: { id: ctx.projectId },
      select: { nodeType: true },
    });
    return (
      root?.nodeType === NodeType.LIBRARY_DRAWING ||
      root?.nodeType === NodeType.LIBRARY_BLOCK
    );
  }

  private async handlePersonalSpaceAccess(
    userId: string,
    ownerId: string | null
  ): Promise<boolean> {
    if (ownerId !== userId) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.file.no_personal_space_access') ??
          '您没有权限访问该个人空间'
      );
    }
    return true;
  }

  private async handleProjectAccess(
    userId: string,
    projectId: string,
    requiredPermissions: ProjectPermission[],
    mode: ProjectPermissionCheckMode
  ): Promise<boolean> {
    const isOwner = await this.projectPermissionService.isProjectOwner(
      userId,
      projectId
    );
    if (isOwner) return true;

    const hasPermission = await this.checkPermissions(
      userId,
      projectId,
      requiredPermissions,
      mode
    );
    if (!hasPermission) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.auth.permission_denied') ??
          '您没有权限执行此操作'
      );
    }

    return true;
  }

  private async checkPermissions(
    userId: string,
    projectId: string,
    requiredPermissions: ProjectPermission[],
    mode: ProjectPermissionCheckMode
  ): Promise<boolean> {
    if (mode === ProjectPermissionCheckMode.ALL) {
      for (const permission of requiredPermissions) {
        const hasPermission =
          await this.projectPermissionService.checkPermission(
            userId,
            projectId,
            permission
          );
        if (!hasPermission) return false;
      }
      return true;
    } else {
      for (const permission of requiredPermissions) {
        const hasPermission =
          await this.projectPermissionService.checkPermission(
            userId,
            projectId,
            permission
          );
        if (hasPermission) return true;
      }
      return false;
    }
  }
}
