import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import type { MutationAction, OwnershipNode, OwnershipPermissionStrategy } from '../interfaces/ownership-permission-strategy.interface';

/**
 * 个人空间归属策略：仅 owner 可变更（原 NodeMutationGuard PERSONAL_SPACE 分支语义）。
 */
@Injectable()
export class PersonalPermissionStrategy implements OwnershipPermissionStrategy {
  private readonly logger = new Logger(PersonalPermissionStrategy.name);

  async assertCan(
    userId: string,
    _action: MutationAction,
    node: OwnershipNode
  ): Promise<void> {
    if (node.ownerId && node.ownerId !== userId) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.file.no_personal_space_access') ??
          '您没有权限访问该个人空间'
      );
    }
  }
}
