import { Injectable, Inject, Logger, ForbiddenException } from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import { I18nContext } from 'nestjs-i18n';
import {
  IPROJECT_PERMISSION_SERVICE,
  IProjectPermissionService,
} from '../../roles/interfaces/project-permission-service.interface';
import {
  PROJECT_ACTION_PERMISSION,
} from '../interfaces/ownership-permission-strategy.interface';
import type {
  MutationAction,
  OwnershipNode,
  OwnershipPermissionStrategy,
} from '../interfaces/ownership-permission-strategy.interface';

/**
 * 项目归属策略（原 NodeMutationGuard PROJECT 分支语义）：
 * - 根类型（项目等）直接 owner 放行；
 * - 项目内 FILE/FOLDER 必须走项目权限（动作映射 PROJECT_ACTION_PERMISSION），
 *   防止文件 owner 绕过项目权限管理；
 * - 项目所有者放行。
 */
@Injectable()
export class ProjectPermissionStrategy implements OwnershipPermissionStrategy {
  private readonly logger = new Logger(ProjectPermissionStrategy.name);

  constructor(
    @Inject(IPROJECT_PERMISSION_SERVICE)
    private readonly projectPermissionService: IProjectPermissionService,
  ) {}

  async assertCan(
    userId: string,
    action: MutationAction,
    node: OwnershipNode
  ): Promise<void> {
    const projectId = node.projectId;
    if (!projectId) {
      if (node.ownerId && node.ownerId !== userId) {
        throw new ForbiddenException(
          I18nContext.current()?.t('error.auth.permission_denied') ??
            '您没有权限执行此操作'
        );
      }
      return;
    }

    // 根类型（项目/个人空间等）直接 owner 放行（原 validateTrashPermission 语义）；
    // 项目内 FILE/FOLDER 必须走项目权限，防止文件 owner 绕过项目权限管理
    const isRootType =
      node.nodeType !== NodeType.FILE && node.nodeType !== NodeType.FOLDER;
    if (isRootType && node.ownerId && node.ownerId === userId) return;

    if (await this.projectPermissionService.isProjectOwner(userId, projectId)) {
      return;
    }

    const has = await this.projectPermissionService.checkPermission(
      userId,
      projectId,
      PROJECT_ACTION_PERMISSION[action]
    );
    if (!has) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.auth.permission_denied') ??
          '您没有权限执行此操作'
      );
    }
  }
}
