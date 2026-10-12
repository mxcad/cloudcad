import { Injectable, Inject, ForbiddenException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../../permission/interfaces/permission-service.interface';
import { getLibrarySystemPermission } from '../../common/utils/permission-mapping';
import type { MutationAction, OwnershipNode, OwnershipPermissionStrategy } from '../interfaces/ownership-permission-strategy.interface';

/**
 * 资源库归属策略：图纸库/图块库需对应系统管理权限
 * （原 NodeMutationGuard LIBRARY_DRAWING/LIBRARY_BLOCK 分支语义）。
 */
@Injectable()
export class LibraryPermissionStrategy implements OwnershipPermissionStrategy {
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
    const requiredPermission = getLibrarySystemPermission(libraryType);
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
