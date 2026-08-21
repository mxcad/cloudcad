import { Injectable, Inject, Logger, ForbiddenException } from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import { I18nContext } from 'nestjs-i18n';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../../permission/interfaces/permission-service.interface';
import { SystemPermission } from '../../common/enums/permissions.enum';
import type { MutationAction, OwnershipNode, OwnershipPermissionStrategy } from '../interfaces/ownership-permission-strategy.interface';

/**
 * 资源库归属策略：图纸库/图块库需对应系统管理权限
 * （原 NodeMutationGuard LIBRARY_DRAWING/LIBRARY_BLOCK 分支语义）。
 */
@Injectable()
export class LibraryPermissionStrategy implements OwnershipPermissionStrategy {
  private readonly logger = new Logger(LibraryPermissionStrategy.name);

  constructor(
    @Inject(IPERMISSION_SERVICE)
    private readonly systemPermissionService: IPermissionService,
  ) {}

  async assertCan(
    userId: string,
    _action: MutationAction,
    node: OwnershipNode
  ): Promise<void> {
    // 库根节点用自身 nodeType；库内 FILE/FOLDER 按归属根类型（rootNodeType）判定，
    // 保证「仅有图纸库/图块库管理权限」的管理员在库内目录操作时仍按对应库校验
    const libraryType = node.rootNodeType ?? node.nodeType;
    const requiredPermission =
      libraryType === NodeType.LIBRARY_DRAWING
        ? SystemPermission.LIBRARY_DRAWING_MANAGE
        : SystemPermission.LIBRARY_BLOCK_MANAGE;
    const has = await this.systemPermissionService.checkSystemPermission(
      userId,
      requiredPermission
    );
    if (!has) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.file.no_repo_access') ??
          '没有访问该资源库的权限'
      );
    }
  }
}
