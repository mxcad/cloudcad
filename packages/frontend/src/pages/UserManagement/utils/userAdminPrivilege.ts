import { SystemPermission } from '@/constants/permissions';

/** 角色条目中判定「是否用户管理员」所需的最小字段 */
export interface RoleGrant {
  id: string;
  permissions?: string[];
}

/**
 * 角色是否授予用户管理权限。
 *
 * 判据是权限 SYSTEM_USER_UPDATE，与后端 admin-privilege-guard 的判据一致——
 * 不能按角色名判（角色名可被改，按名字判会被绕过）。
 */
export const roleGrantsUserAdmin = (role: RoleGrant | undefined): boolean =>
  !!role?.permissions?.includes(SystemPermission.SYSTEM_USER_UPDATE);

export interface AdminDemotionInput {
  currentRoleId: string;
  nextRoleId: string;
  roles: RoleGrant[];
  currentStatus: string;
  nextStatus: string;
}

/**
 * 是否构成「降管理员」：目标当前具备用户管理能力，而本次修改会使其失去。
 *
 * 失去的两条路径与后端不变量对应：
 * - 角色改成不再授予 SYSTEM_USER_UPDATE 的角色（含清空角色）
 * - 账户状态从 ACTIVE 改为非 ACTIVE（无法登录即无法使用用户管理）
 */
export const isAdminDemotion = ({
  currentRoleId,
  nextRoleId,
  roles,
  currentStatus,
  nextStatus,
}: AdminDemotionInput): boolean => {
  const cur = currentStatus || 'ACTIVE';
  const nxt = nextStatus || 'ACTIVE';
  if (!roleGrantsUserAdmin(roles.find((r) => r.id === currentRoleId))) return false;
  const losesRoleGrant = !roleGrantsUserAdmin(roles.find((r) => r.id === nextRoleId));
  const losesStatus = cur === 'ACTIVE' && nxt !== 'ACTIVE';
  return losesRoleGrant || losesStatus;
};
