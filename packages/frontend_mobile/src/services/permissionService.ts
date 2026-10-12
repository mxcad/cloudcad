import { membershipState } from '@cloudcad/platform';
import { memberControllerGetUserProjectPermissions } from '../api-sdk';
import { useEditorStore } from '@/stores/editor';
import { useUser } from '../composables/useUser';
import { showToast } from 'vant';
import { t } from '@/languages';
import { unwrap } from '@/utils/apiError';

interface CachedPermissions {
  canSave: boolean;
  canExport: boolean;
  canManageExternalRef: boolean;
}

const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry {
  permissions: CachedPermissions;
  timestamp: number;
}

const permissionCache = new Map<string, CacheEntry>();

/** 项目权限列表缓存（带 TTL），用于本地权限判断，避免 N+1 API 调用 */
interface ProjectPermissionsCacheEntry {
  permissions: string[];
  timestamp: number;
}
const projectPermissionsCache = new Map<string, ProjectPermissionsCacheEntry>();

function isCacheValid(entry: CacheEntry | undefined): entry is CacheEntry {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL;
}

function isProjectPermissionsCacheValid(
  entry: ProjectPermissionsCacheEntry | undefined,
): entry is ProjectPermissionsCacheEntry {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL;
}

export const PERMISSIONS = {
  CAD_SAVE: 'CAD_SAVE',
  FILE_DOWNLOAD: 'FILE_DOWNLOAD',
  CAD_EXTERNAL_REFERENCE: 'CAD_EXTERNAL_REFERENCE',
  LIBRARY_DRAWING_MANAGE: 'LIBRARY_DRAWING_MANAGE',
  LIBRARY_BLOCK_MANAGE: 'LIBRARY_BLOCK_MANAGE',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * 加载项目权限列表（合并端点，一次请求返回全部权限，本地判断）。
 * 带 TTL 缓存；失败时回退既有缓存（保留旧权限，避免门控菜单项闪动），无缓存则空。
 * 角色/权限/归属变更后调用 invalidateProjectPermissions 失效，保证下次重新拉取。
 */
export async function loadProjectPermissions(projectId: string): Promise<string[]> {
  const cached = projectPermissionsCache.get(projectId);
  const stalePerms = cached?.permissions;
  if (isProjectPermissionsCacheValid(cached)) return cached.permissions;

  try {
    const result = await memberControllerGetUserProjectPermissions({
      path: { projectId },
    });
    unwrap(result);
    const data = result.data as { permissions?: string[] } | undefined;
    const perms = data?.permissions || [];
    projectPermissionsCache.set(projectId, { permissions: perms, timestamp: Date.now() });
    return perms;
  } catch {
    // 失败回退既有（可能过期）缓存，保留旧权限避免门控菜单项闪动；无缓存则空
    return stalePerms ?? [];
  }
}

/** 失效项目权限缓存：传 projectId 失效单个项目，不传清空全部（角色/权限/归属变更后调用） */
export function invalidateProjectPermissions(projectId?: string): void {
  if (projectId) projectPermissionsCache.delete(projectId);
  else projectPermissionsCache.clear();
}

export async function checkSystemPermission(permission: PermissionKey): Promise<boolean> {
  const { hasPermission } = useUser();
  return hasPermission(permission);
}

export async function loadCADPermissions(projectId: string | null): Promise<void> {
  const editorState = useEditorStore();

  if (!projectId) {
    editorState.setPermissions({ canSave: false, canExport: false, canManageExternalRef: false });
    return;
  }

  const cached = permissionCache.get(projectId);
  if (isCacheValid(cached)) {
    editorState.setPermissions(cached.permissions);
    return;
  }

  const perms = await loadProjectPermissions(projectId);
  const canSave = perms.includes(PERMISSIONS.CAD_SAVE);
  const canExport = perms.includes(PERMISSIONS.FILE_DOWNLOAD);
  const canManageExternalRef = perms.includes(PERMISSIONS.CAD_EXTERNAL_REFERENCE);

  const result = { canSave, canExport, canManageExternalRef };
  permissionCache.set(projectId, { permissions: result, timestamp: Date.now() });
  editorState.setPermissions(result);
}

export async function checkLibraryPermissions(): Promise<{ canManageDrawing: boolean; canManageBlock: boolean }> {
  const [canManageDrawing, canManageBlock] = await Promise.all([
    checkSystemPermission(PERMISSIONS.LIBRARY_DRAWING_MANAGE),
    checkSystemPermission(PERMISSIONS.LIBRARY_BLOCK_MANAGE),
  ]);
  return { canManageDrawing, canManageBlock };
}

/**
 * 导出下载方向（mxweb → 其他格式）会员预检（纯函数，编辑器菜单与库抽屉共用）：
 * 有效 VIP（membershipTierLevel > 0 且未到期，判定走 @cloudcad/platform 唯一出口）
 * 或运行时开关 freeExportDownloadEnabled 开放时可导出，否则 toast 提示并短路
 * （后端仍有 403 门控兜底）。
 */
export function canExportDownloadGate(
  user: unknown,
  freeExportDownloadEnabled: boolean,
): boolean {
  const u = user as unknown as Record<string, unknown> | null;
  const tierLevel = u?.membershipTierLevel as number | undefined;
  const expiresAt = (u?.membershipExpiresAt as string | null | undefined) ?? null;
  const isVip = membershipState({
    tierLevel: typeof tierLevel === 'number' ? tierLevel : 0,
    expiresAt,
  }).isVip;
  if (isVip || freeExportDownloadEnabled) return true;
  showToast(t('导出下载为会员专属功能，开通 VIP 后即可使用'));
  return false;
}
