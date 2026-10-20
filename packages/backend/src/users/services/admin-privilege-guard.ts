import { ConflictException, ForbiddenException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { SystemPermission } from '../../common/enums/permissions.enum';
import type { DatabaseService } from '../../database/database.service';

/**
 * 「管理员」的判定依据：持有 SYSTEM_USER_UPDATE（用户写操作的门禁权限）。
 *
 * 刻意不用角色名——角色名可被持 SYSTEM_ROLE_UPDATE 的人修改，按名字判会被绕过
 * （project-member 模块踩过：原按角色名判断，改名后可绕过）。
 * 按权限判是单源的，自定义角色也自动生效。
 *
 * 两道自我降权守卫的 operatorId 一律必填、不接受 undefined：「谁在操作」不是可省略的
 * 上下文，是判定本身。历史上它曾是可选项、缺省即跳过检查，于是漏传操作者等于静默关闭
 * 自我降权保护。现在漏传在编译期就失败；系统发起的写操作必须显式给出操作者身份。
 */
export const USER_ADMIN_PERMISSION = SystemPermission.SYSTEM_USER_UPDATE;

/** 排除指定用户后，仍持有用户管理权限的未注销账号数 */
export async function countOtherUserAdmins(
  db: DatabaseService,
  excludeUserId: string
): Promise<number> {
  return db.user.count({
    where: {
      id: { not: excludeUserId },
      deletedAt: null,
      role: {
        permissions: { some: { permission: USER_ADMIN_PERMISSION } },
      },
    },
  });
}

/** 指定角色是否持有用户管理权限 */
export async function roleGrantsUserAdmin(
  db: DatabaseService,
  roleId: string
): Promise<boolean> {
  return (
    (await db.rolePermission.count({
      where: { roleId, permission: USER_ADMIN_PERMISSION },
    })) > 0
  );
}

/**
 * 操作者不得修改自己的角色——自我降权后无法再进入用户管理页，账户事实上锁死。
 * 与 project-member 模块「成员不得修改自己的角色」同一范式。
 * 只在值实际变更时拦截；值未变的幂等保存照常放行。
 */
export function assertNotSelfRoleChange(
  operatorId: string,
  targetId: string,
  nextRoleId: string | undefined,
  currentRoleId: string
): void {
  if (operatorId !== targetId || !nextRoleId) return;
  if (nextRoleId === currentRoleId) return;
  throw new ForbiddenException(
    I18nContext.current()?.t('error.user.cannot_modify_own_role') ??
      '不能修改自己的角色'
  );
}

/**
 * 操作者不得修改自己的账户状态——把自己 SUSPENDED 是比改角色更快的锁死方式。
 */
export function assertNotSelfStatusChange(
  operatorId: string,
  targetId: string,
  nextStatus: string | undefined,
  currentStatus: string
): void {
  if (operatorId !== targetId || !nextStatus) return;
  if (nextStatus === currentStatus) return;
  throw new ForbiddenException(
    I18nContext.current()?.t('error.user.cannot_modify_own_status') ??
      '不能修改自己的账户状态'
  );
}

/**
 * 最后一个管理员不变量：不得让「持有用户管理权限的账号」归零。
 *
 * 仅在「当前持有 → 目标不再持有」且排除目标后已无其他管理员时拒绝。
 * 提权、平级换角色、以及尚有其他管理员时的降级都放行。
 */
export async function assertKeepsUserAdminSurvivor(
  db: DatabaseService,
  targetId: string,
  currentGrants: boolean,
  nextGrants: boolean
): Promise<void> {
  if (!currentGrants || nextGrants) return;
  if ((await countOtherUserAdmins(db, targetId)) > 0) return;
  throw new ConflictException(
    I18nContext.current()?.t('error.user.cannot_demote_last_admin') ??
      '不能移除最后一个管理员的用户管理权限'
  );
}
