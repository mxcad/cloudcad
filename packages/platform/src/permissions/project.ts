/**
 * 项目权限（跨端单一事实源）
 *
 * 项目权限枚举、前置依赖图与补全/级联算法是 PC 与移动端共同遵守的契约：
 * 权限码为后端 ProjectPermission 枚举值（大写下划线），与数据库、后端、
 * OpenAPI 生成的 SDK 类型一致。
 *
 * 此前 PC 由 Prisma schema 生成（scripts/generate-frontend-permissions.js）、
 * 移动端是手写副本，两端无同步机制——schema 变更只更新 PC，移动端漂移。
 * 现收敛到本包：生成器从 schema 派生本文件的枚举与依赖图，PC 与移动端都从
 * 这里取项目权限数据与算法，改 schema 只跑一次生成器两端同步。
 *
 * 准入四条：纯数据 + 纯函数、不绑框架、不绑端、无 i18n（label 分组与角色
 * 显示名留端包，经 t() 渲染）。
 */

/** 项目权限枚举（与后端 ProjectPermission 枚举一致，由生成器从 schema 派生） */
export const ProjectPermission = {
  PROJECT_UPDATE: 'PROJECT_UPDATE',
  PROJECT_DELETE: 'PROJECT_DELETE',
  PROJECT_MEMBER_MANAGE: 'PROJECT_MEMBER_MANAGE',
  PROJECT_MEMBER_ASSIGN: 'PROJECT_MEMBER_ASSIGN',
  PROJECT_TRANSFER: 'PROJECT_TRANSFER',
  PROJECT_TRANSFER_MANAGE: 'PROJECT_TRANSFER_MANAGE',
  PROJECT_ROLE_MANAGE: 'PROJECT_ROLE_MANAGE',
  PROJECT_ROLE_PERMISSION_MANAGE: 'PROJECT_ROLE_PERMISSION_MANAGE',
  FILE_CREATE: 'FILE_CREATE',
  FILE_UPLOAD: 'FILE_UPLOAD',
  FILE_OPEN: 'FILE_OPEN',
  FILE_EDIT: 'FILE_EDIT',
  FILE_DELETE: 'FILE_DELETE',
  FILE_TRASH_MANAGE: 'FILE_TRASH_MANAGE',
  FILE_DOWNLOAD: 'FILE_DOWNLOAD',
  FILE_SHARE: 'FILE_SHARE',
  FILE_MOVE: 'FILE_MOVE',
  FILE_COPY: 'FILE_COPY',
  CAD_SAVE: 'CAD_SAVE',
  CAD_EXTERNAL_REFERENCE: 'CAD_EXTERNAL_REFERENCE',
  VERSION_READ: 'VERSION_READ',
} as const;

export type ProjectPermissionValue =
  (typeof ProjectPermission)[keyof typeof ProjectPermission];

/**
 * 项目权限前置依赖图（仅列有前置要求的权限；缺省 = 无前置）。
 * 用于避免配置出「能创建文件却打不开文件」这类无效权限组合。
 */
export const PROJECT_PERMISSION_DEPENDENCIES: Partial<
  Record<ProjectPermissionValue, ProjectPermissionValue[]>
> = {
  PROJECT_UPDATE: ['FILE_OPEN'],
  PROJECT_DELETE: ['PROJECT_UPDATE'],
  PROJECT_MEMBER_MANAGE: ['PROJECT_UPDATE'],
  PROJECT_MEMBER_ASSIGN: ['PROJECT_UPDATE'],
  PROJECT_TRANSFER: ['PROJECT_UPDATE'],
  PROJECT_TRANSFER_MANAGE: ['PROJECT_UPDATE'],
  PROJECT_ROLE_MANAGE: ['PROJECT_UPDATE'],
  PROJECT_ROLE_PERMISSION_MANAGE: ['PROJECT_UPDATE'],
  FILE_CREATE: ['FILE_OPEN'],
  FILE_UPLOAD: ['FILE_OPEN'],
  FILE_EDIT: ['FILE_OPEN'],
  FILE_DELETE: ['FILE_OPEN'],
  FILE_TRASH_MANAGE: ['FILE_OPEN'],
  FILE_DOWNLOAD: ['FILE_OPEN'],
  FILE_SHARE: ['FILE_OPEN'],
  FILE_MOVE: ['FILE_OPEN'],
  FILE_COPY: ['FILE_OPEN'],
  CAD_SAVE: ['FILE_OPEN'],
  CAD_EXTERNAL_REFERENCE: ['FILE_OPEN'],
  VERSION_READ: ['FILE_OPEN'],
};

/**
 * 项目角色键（稳定标识；项目内角色可改名，显示名留端包经 t() 渲染）。
 */
export const PROJECT_ROLE_KEYS = [
  'PROJECT_OWNER',
  'PROJECT_ADMIN',
  'PROJECT_EDITOR',
  'PROJECT_MEMBER',
  'PROJECT_VIEWER',
] as const;

export type ProjectRoleKey = (typeof PROJECT_ROLE_KEYS)[number];

/**
 * 依赖图入参：权限码 → 前置权限码列表（无前置的权限可缺省）。
 * PC 传全量（系统 + 项目）图，移动端传项目子集图。
 */
export type PermissionDependencyGraph = Record<
  string,
  readonly string[] | undefined
>;

/**
 * 自动补全前置依赖（迭代直至稳定，幂等）。
 * 勾选「删除项目」会连带「编辑项目」「打开文件」，杜绝「能删除却看不到」的无效组合。
 *
 * @param deps 权限前置依赖图（调用方按域传入：PC 全量 / 移动端项目子集）
 * @param selected 当前已勾选的权限码
 * @returns 补全前置依赖后的权限码集合
 */
export function completePermissionDependencies(
  deps: PermissionDependencyGraph,
  selected: string[]
): string[] {
  const result = new Set(selected);
  let changed = true;

  while (changed) {
    changed = false;
    for (const perm of [...result]) {
      const d = deps[perm];
      if (!d) continue;
      for (const dep of d) {
        if (!result.has(dep)) {
          result.add(dep);
          changed = true;
        }
      }
    }
  }

  return [...result];
}

/**
 * 取消 perm 时需一并取消的下游权限（selected 中直接或传递依赖 perm 的权限）。
 * 供调用方弹确认做级联取消，从机制上杜绝「能创建但看不到角色」这类无效组合。
 *
 * @param deps 权限前置依赖图
 * @param perm 被取消的权限码
 * @param selected 当前已勾选的权限码
 * @returns 需一并取消的下游权限码集合
 */
export function getDependentPermissions(
  deps: PermissionDependencyGraph,
  perm: string,
  selected: string[]
): string[] {
  const dependents = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const p of selected) {
      if (p === perm || dependents.has(p)) continue;
      const d = deps[p];
      if (d && d.some((dep) => dep === perm || dependents.has(dep))) {
        dependents.add(p);
        changed = true;
      }
    }
  }

  return [...dependents];
}
