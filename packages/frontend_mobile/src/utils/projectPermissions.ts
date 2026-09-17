/**
 * 项目角色权限配置（移动端）—— 项目权限枚举、分组与依赖图（纯函数）。
 *
 * 与 PC 端 packages/frontend/src/constants/permissions.ts 的项目部分对齐
 * （该文件由 Prisma schema 自动生成）；权限码为后端 ProjectPermission 枚举值
 * （大写下划线），与数据库、后端、OpenAPI 生成的 SDK 类型一致。
 *
 * 移动端只有「项目角色管理」一处消费，故只收敛 project 分组，系统权限不入此文件。
 * 依赖图用于避免配置出「能创建文件却打不开文件」这类无效权限组合：
 *   - 勾选时 completePermissionDependencies 自动补全前置权限
 *   - 取消时 getDependentPermissions 算出需一并取消的下游权限，由调用方弹确认
 */
import { t } from '@/languages'

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
} as const

export type ProjectPermissionValue =
  (typeof ProjectPermission)[keyof typeof ProjectPermission]

export interface PermissionGroupItem {
  key: ProjectPermissionValue
  label: string
}

export interface PermissionGroup {
  label: string
  items: PermissionGroupItem[]
}

/** 权限前置依赖（仅列出有前置要求的权限；缺省 = 无前置） */
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
}

/** 权限分组（勾选 UI 的数据源；label 用 t() 包裹以支持 i18n） */
export function getProjectPermissionGroups(): PermissionGroup[] {
  return [
    {
      label: t('项目权限'),
      items: [
        { key: 'PROJECT_UPDATE', label: t('编辑项目') },
        { key: 'PROJECT_DELETE', label: t('删除项目') },
        { key: 'PROJECT_MEMBER_MANAGE', label: t('成员管理') },
        { key: 'PROJECT_MEMBER_ASSIGN', label: t('成员分配') },
        { key: 'PROJECT_TRANSFER', label: t('转让所有权') },
        { key: 'PROJECT_TRANSFER_MANAGE', label: t('跨项目转移管理') },
        { key: 'PROJECT_ROLE_MANAGE', label: t('角色管理') },
        { key: 'PROJECT_ROLE_PERMISSION_MANAGE', label: t('角色权限配置') },
      ],
    },
    {
      label: t('文件权限'),
      items: [
        { key: 'FILE_CREATE', label: t('创建文件') },
        { key: 'FILE_UPLOAD', label: t('上传文件') },
        { key: 'FILE_OPEN', label: t('打开文件') },
        { key: 'FILE_EDIT', label: t('编辑文件') },
        { key: 'FILE_DELETE', label: t('删除文件') },
        { key: 'FILE_TRASH_MANAGE', label: t('回收站管理') },
        { key: 'FILE_DOWNLOAD', label: t('下载文件') },
        { key: 'FILE_SHARE', label: t('分享文件') },
        { key: 'FILE_MOVE', label: t('移动文件') },
        { key: 'FILE_COPY', label: t('复制文件') },
      ],
    },
    {
      label: t('CAD 图纸权限'),
      items: [
        { key: 'CAD_SAVE', label: t('保存图纸') },
        { key: 'CAD_EXTERNAL_REFERENCE', label: t('管理外部参照') },
      ],
    },
    {
      label: t('版本管理'),
      items: [{ key: 'VERSION_READ', label: t('查看版本') }],
    },
  ]
}

/** 全部项目权限项（扁平化，用于按 key 反查 label） */
export function getProjectPermissionItems(): PermissionGroupItem[] {
  return getProjectPermissionGroups().flatMap((group) => group.items)
}

/**
 * 读取单个权限的前置依赖。
 * 依赖表按枚举字面量收窄，此处为 string 边界做一次定向放宽（DTO 回来的权限码是 string）。
 */
function depsOf(perm: string): ProjectPermissionValue[] | undefined {
  return (PROJECT_PERMISSION_DEPENDENCIES as Record<string, ProjectPermissionValue[]>)[
    perm
  ]
}

/**
 * 自动补全前置依赖（迭代直至稳定，幂等）：勾选「删除项目」会连带
 * 「编辑项目」「打开文件」，保证界面上不会出现「能删除却看不到」的无效组合。
 */
export function completePermissionDependencies(selected: string[]): string[] {
  const result = new Set(selected)
  let changed = true

  while (changed) {
    changed = false
    for (const perm of [...result]) {
      const deps = depsOf(perm)
      if (!deps) continue
      for (const dep of deps) {
        if (!result.has(dep)) {
          result.add(dep)
          changed = true
        }
      }
    }
  }

  return [...result]
}

/**
 * 取消 perm 时需要一并取消的下游权限（selected 中直接或传递依赖 perm 的权限），
 * 供调用方弹确认做级联取消，从机制上杜绝「能创建但看不到角色」这类无效组合。
 */
export function getDependentPermissions(perm: string, selected: string[]): string[] {
  const dependents = new Set<string>()
  let changed = true

  while (changed) {
    changed = false
    for (const p of selected) {
      if (p === perm || dependents.has(p)) continue
      const deps = depsOf(p)
      if (deps && deps.some((dep) => dep === perm || dependents.has(dep))) {
        dependents.add(p)
        changed = true
      }
    }
  }

  return [...dependents]
}

/** 一次权限勾选变更的决策结果：调用方据此决定直接生效还是先弹级联确认 */
export type PermissionChangeDecision =
  | { action: 'accept'; selected: string[] }
  | { action: 'noop'; selected: string[] }
  | {
      action: 'confirm-cascade'
      /** 本次被取消的权限 */
      removed: string[]
      /** 需一并取消的下游权限 */
      dependents: string[]
      /** 用户确认后生效的集合：本次变更去掉下游权限，再补全前置依赖 */
      confirmedSelected: string[]
    }

function samePermissionSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((perm) => b.includes(perm))
}

/**
 * 计算一次权限勾选变更该如何处理（纯决策，无副作用，便于单测）。
 *
 * vant 的 checkbox-group 没有「变更前」回调（@change 在 v-model 写回之后触发），
 * 因此 UI 必须用 `:model-value` + `@update:model-value` 受控用法，diff 在调用方完成。
 *
 * 语义与 PC 端 PermissionAssignment.handleToggle 一致：
 * - 新增：completePermissionDependencies 自动补全前置权限
 * - 取消：仍有下游权限依赖它（且未被本次一并取消）→ 返回 confirm-cascade 由调用方弹确认
 * - 集合未变（受控组件回推同值）→ noop，不做任何变更
 */
export function decidePermissionChange(
  prev: string[],
  next: string[],
): PermissionChangeDecision {
  if (samePermissionSet(prev, next)) {
    return { action: 'noop', selected: next }
  }

  const removed = prev.filter((perm) => !next.includes(perm))
  const dependents = [
    ...new Set(
      removed
        .flatMap((perm) => getDependentPermissions(perm, prev))
        .filter((dep) => !removed.includes(dep)),
    ),
  ]

  if (dependents.length > 0) {
    return {
      action: 'confirm-cascade',
      removed,
      dependents,
      confirmedSelected: completePermissionDependencies(
        next.filter((perm) => !dependents.includes(perm)),
      ),
    }
  }

  return { action: 'accept', selected: completePermissionDependencies(next) }
}

/** 项目默认角色名映射（项目内角色可改名，此处仅作未知/改名前角色名的兜底显示） */
export const PROJECT_ROLE_NAMES: Record<string, string> = {
  PROJECT_OWNER: t('项目所有者'),
  PROJECT_ADMIN: t('项目管理员'),
  PROJECT_EDITOR: t('项目编辑者'),
  PROJECT_MEMBER: t('项目成员'),
  PROJECT_VIEWER: t('项目查看者'),
}

export function getProjectRoleDisplayName(roleName: string): string {
  return PROJECT_ROLE_NAMES[roleName] || roleName
}
