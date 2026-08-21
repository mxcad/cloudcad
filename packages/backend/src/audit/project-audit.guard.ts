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
} from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';

import { I18nContext } from 'nestjs-i18n';

/**
 * 项目审计记录访问 Guard（#207 阶段 4 后端部分）
 *
 * 判定请求者是目标项目的成员（owner 或 projectMember 记录），非成员一律 403。
 * 与 file-system 的 RequireProjectPermissionGuard 判定语义一致
 * （getUserProjects 的成员口径：ownerId = userId OR projectMembers some userId），
 * 但不引入其依赖链（IProjectPermissionService/NodeContextResolver 在 RolesModule，
 * 而 RolesModule 已依赖 AuditLogModule，直接复用会构成模块循环依赖）。
 */
@Injectable()
export class ProjectAuditGuard implements CanActivate {
  constructor(private readonly prisma: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id as string | undefined;
    const projectId = request.params?.projectId as string | undefined;

    if (!userId) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.auth.unauthorized') ?? '用户未认证'
      );
    }
    if (!projectId) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.resource.missing_project_id') ??
          '缺少项目ID参数'
      );
    }

    const project = await this.prisma.fileSystemNode.findFirst({
      where: {
        id: projectId,
        nodeType: NodeType.PROJECT,
        deletedAt: null,
        OR: [
          { ownerId: userId },
          { projectMembers: { some: { userId } } },
        ],
      },
      select: { id: true },
    });

    if (!project) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.auth.permission_denied') ??
          '您没有权限访问该项目的审计记录'
      );
    }

    return true;
  }
}
