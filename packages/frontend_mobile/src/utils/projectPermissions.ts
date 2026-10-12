/**
 * 项目角色权限配置（移动端）—— 项目权限分组与勾选决策（纯函数）。
 *
 * 项目权限枚举、前置依赖图与补全/级联算法来自 @cloudcad/platform（跨端单一
 * 事实源，由 Prisma schema 经 scripts/generate-frontend-permissions.js 派生），
 * 与 PC 端共用，杜绝两端漂移。权限码为后端 ProjectPermission 枚举值（大写下
 * 划线），与数据库、后端、OpenAPI 生成的 SDK 类型一致。
 *
 * 本文件只保留移动端特有的：勾选分组（label 经 t() 渲染）、一次勾选变更的
 * 决策（decidePermissionChange）、角色显示名、文件/文件夹操作菜单派生。
 * 依赖图用于避免配置出「能创建文件却打不开文件」这类无效权限组合：
 *   - 勾选时 completePermissionDependencies 自动补全前置权限
 *   - 取消时 getDependentPermissions 算出需一并取消的下游权限，由调用方弹确认
 */
import { t } from '@/languages'
import {
  ProjectPermission,
  PROJECT_PERMISSION_DEPENDENCIES,
  completePermissionDependencies as completeDeps,
  getDependentPermissions as getDependents,
} from '@cloudcad/platform'
import type { ProjectPermissionValue } from '@cloudcad/platform'

export { ProjectPermission, PROJECT_PERMISSION_DEPENDENCIES }
export type { ProjectPermissionValue }

export interface PermissionGroupItem {
  key: ProjectPermissionValue
  label: string
}

export interface PermissionGroup {
  label: string
  items: PermissionGroupItem[]
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
 * 自动补全前置依赖（迭代直至稳定，幂等）：勾选「删除项目」会连带
 * 「编辑项目」「打开文件」，保证界面上不会出现「能删除却看不到」的无效组合。
 * 算法与依赖图来自 @cloudcad/platform，此处以项目依赖图调用。
 */
export function completePermissionDependencies(selected: string[]): string[] {
  return completeDeps(PROJECT_PERMISSION_DEPENDENCIES, selected)
}

/**
 * 取消 perm 时需要一并取消的下游权限（selected 中直接或传递依赖 perm 的权限），
 * 供调用方弹确认做级联取消，从机制上杜绝「能创建但看不到角色」这类无效组合。
 */
export function getDependentPermissions(
  perm: string,
  selected: string[],
): string[] {
  return getDependents(PROJECT_PERMISSION_DEPENDENCIES, perm, selected)
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

/** 文件/文件夹单条目操作菜单项（name 走 i18n，key 供 onMenuAction 分派，color 仅删除项用） */
export interface FileNodeMenuAction {
  name: string
  key: string
  color?: string
}

/**
 * 菜单项可见性上下文：isFolder/isCad 描述目标条目，can 描述各操作是否可见。
 * 个人空间（所有者恒可）传全 true 的 can；项目页按 projectPermissions 逐项派生。
 */
export interface FileNodeMenuContext {
  isFolder: boolean
  isCad: boolean
  can: {
    download: boolean
    share: boolean
    externalRef: boolean
    versionHistory: boolean
    rename: boolean
    move: boolean
    copy: boolean
    delete: boolean
  }
}

/**
 * 文件/文件夹单条目操作菜单项派生（纯函数，个人空间与项目页壳页共用同一装配逻辑）。
 * 「打开」恒可见；下载/分享/外部参照/版本历史/重命名/移动/复制/剪切/删除按
 * isFolder/isCad + can 门控。此前两壳页各写一份且门控口径分叉（个人空间无门控、
 * 项目页逐项权限），收敛到此处后两页只负责算 isCad 与 can，菜单装配只有一份。
 */
export function getFileNodeMenuActions(ctx: FileNodeMenuContext): FileNodeMenuAction[] {
  const { isFolder, isCad, can } = ctx
  const actions: Array<FileNodeMenuAction | null> = [
    { name: t('打开'), key: 'open' },
    // 文件 → 下载（CAD 弹格式选择、非 CAD 原格式直下）；文件夹 → 打包下载
    isFolder
      ? (can.download ? { name: t('打包下载'), key: 'folderDownload' } : null)
      : (can.download ? { name: t('下载'), key: 'download' } : null),
    // 文件 → 分享链接
    !isFolder && can.share ? { name: t('分享'), key: 'share' } : null,
    // CAD 图纸 → 外部参照管理
    isCad && can.externalRef ? { name: t('外部参照管理'), key: 'externalRef' } : null,
    // 文件 → 版本历史
    !isFolder && can.versionHistory ? { name: t('版本历史'), key: 'versionHistory' } : null,
    can.rename ? { name: t('重命名'), key: 'rename' } : null,
    // 文件夹操作（移动到…/复制到…）与剪贴板操作（复制到剪贴板/剪切）语义区分
    can.move ? { name: t('移动到...'), key: 'move' } : null,
    can.copy ? { name: t('复制到...'), key: 'copy' } : null,
    can.copy ? { name: t('复制到剪贴板'), key: 'copyClipboard' } : null,
    can.move ? { name: t('剪切'), key: 'cut' } : null,
    can.delete ? { name: t('删除'), key: 'delete', color: '#ee0a24' } : null,
  ]
  return actions.filter((a): a is FileNodeMenuAction => a !== null)
}
