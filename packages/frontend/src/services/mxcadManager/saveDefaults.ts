import {
  nodeControllerGetNode,
  libraryControllerGetDrawingNode,
  libraryControllerGetBlockNode,
  memberControllerGetUserProjectPermissions,
  saveControllerSaveMxwebToNode,
} from '@/api-sdk';
import type {
  SaveFileDeps,
  SavePermissionQuerier,
  SaveSdkHandles,
} from './saveTypes';

const projectPermsCache = new Map<string, string[]>();

/** 默认 SDK 句柄：直接桥接 @api-sdk 生成函数 */
export function createDefaultSaveSdk(): SaveSdkHandles {
  return {
    async getNode(nodeId) {
      return nodeControllerGetNode({ path: { nodeId }, throwOnError: true });
    },
    async getLibraryNode(nodeId, libraryKey) {
      return libraryKey === 'drawing'
        ? libraryControllerGetDrawingNode({ path: { nodeId } })
        : libraryControllerGetBlockNode({ path: { nodeId } });
    },
    async getUserProjectPermissions(projectId) {
      return memberControllerGetUserProjectPermissions({ path: { projectId } });
    },
    async saveMxwebToNode(nodeId, body) {
      return saveControllerSaveMxwebToNode({ path: { nodeId }, body });
    },
  };
}

/**
 * 默认权限查询器（行为与 saveCommand.ts 活代码一致）：
 * - hasProjectPermission：memberControllerGetUserProjectPermissions + 模块级缓存
 * - hasLibraryPermission：localStorage 'user' 角色权限解析（LIBRARY_DRAWING_MANAGE / LIBRARY_BLOCK_MANAGE）
 */
export function createDefaultPermissionQuerier(): SavePermissionQuerier {
  return {
    async hasProjectPermission(projectId, permission) {
      let perms = projectPermsCache.get(projectId);
      if (!perms) {
        const result = await memberControllerGetUserProjectPermissions({
          path: { projectId },
        });
        // SDK 默认不抛错：失败时错误在 result.error。静默降级为"无权限"
        // 会让用户被误导"您没有保存图纸的权限"（历史 bug），必须抛出让上层显示真实原因
        if (result.error) throw result.error;
        perms = result.data?.permissions || [];
        projectPermsCache.set(projectId, perms);
      }
      return perms.includes(permission);
    },
    async hasLibraryPermission() {
      const userStr = localStorage.getItem('user');
      if (!userStr) return false;
      const userData = JSON.parse(userStr);
      const userPermissions = userData?.role?.permissions || [];
      const permissionStrings = userPermissions.map(
        (p: string | { permission: string }) =>
          typeof p === 'string' ? p : p.permission
      );
      return (
        permissionStrings.includes('LIBRARY_DRAWING_MANAGE') ||
        permissionStrings.includes('LIBRARY_BLOCK_MANAGE')
      );
    },
  };
}

/** 默认依赖组装（无状态，可在 buildContext / 测试中按需重建） */
export function createDefaultSaveDeps(): SaveFileDeps {
  return {
    sdk: createDefaultSaveSdk(),
    permissions: createDefaultPermissionQuerier(),
  };
}
