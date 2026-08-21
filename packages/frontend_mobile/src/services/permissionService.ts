import { memberControllerGetUserProjectPermissions } from '../api-sdk';
import { useEditorState } from '../composables/useEditorState';
import { useUser } from '../composables/useUser';

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

/** 项目权限列表缓存，用于本地权限判断，避免 N+1 API 调用 */
const projectPermissionsCache = new Map<string, string[]>();

function isCacheValid(entry: CacheEntry | undefined): entry is CacheEntry {
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
 * 加载项目权限列表（合并端点，一次请求返回全部权限，本地判断）
 */
export async function loadProjectPermissions(projectId: string): Promise<string[]> {
  const cached = projectPermissionsCache.get(projectId);
  if (cached) return cached;

  try {
    const result = await memberControllerGetUserProjectPermissions({
      path: { projectId },
    });
    const data = result.data as { permissions?: string[] } | undefined;
    const perms = data?.permissions || [];
    projectPermissionsCache.set(projectId, perms);
    return perms;
  } catch {
    return [];
  }
}

export async function checkSystemPermission(permission: PermissionKey): Promise<boolean> {
  const { hasPermission } = useUser();
  return hasPermission(permission);
}

export async function loadCADPermissions(projectId: string | null): Promise<void> {
  const editorState = useEditorState();

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
