import {
  fileSystemControllerCheckProjectPermission,
  adminControllerGetUserPermissions,
} from '../api-sdk';
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

export function clearPermissionCache() {
  permissionCache.clear();
}

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

export async function checkProjectPermission(projectId: string, permission: PermissionKey): Promise<boolean> {
  try {
    const result = await fileSystemControllerCheckProjectPermission({
      path: { projectId },
      query: { permission },
    });
    if (result.error) return false;
    return result.data?.hasPermission ?? false;
  } catch {
    return false;
  }
}

export async function checkSystemPermission(permission: PermissionKey): Promise<boolean> {
  try {
    const { user } = useUser();
    if (!user.value?.id) return false;
    const result = await adminControllerGetUserPermissions({
      path: { userId: user.value.id },
    });
    if (result.error) return false;
    return result.data?.data?.permissions?.includes(permission) ?? false;
  } catch {
    return false;
  }
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

  const [canSave, canExport, canManageExternalRef] = await Promise.all([
    checkProjectPermission(projectId, PERMISSIONS.CAD_SAVE),
    checkProjectPermission(projectId, PERMISSIONS.FILE_DOWNLOAD),
    checkProjectPermission(projectId, PERMISSIONS.CAD_EXTERNAL_REFERENCE),
  ]);

  const perms = { canSave, canExport, canManageExternalRef };
  permissionCache.set(projectId, { permissions: perms, timestamp: Date.now() });
  editorState.setPermissions(perms);
}

export async function checkLibraryPermissions(): Promise<{ canManageDrawing: boolean; canManageBlock: boolean }> {
  const [canManageDrawing, canManageBlock] = await Promise.all([
    checkSystemPermission(PERMISSIONS.LIBRARY_DRAWING_MANAGE),
    checkSystemPermission(PERMISSIONS.LIBRARY_BLOCK_MANAGE),
  ]);
  return { canManageDrawing, canManageBlock };
}
