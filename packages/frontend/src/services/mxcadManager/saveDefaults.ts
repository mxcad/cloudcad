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

/**
 * 保存流项目权限缓存（带 TTL，对齐 globalPermissionCache 的 5 分钟）
 *
 * 无 TTL 时"无权限"判定整个 SPA 会话期间不复验：切换图纸/权限变更后
 * 保存流仍复用旧结果（历史 bug：旧图纸无权限状态泄漏到新图纸）。
 * 登录/登出时经 clearSavePermissionCache 整体清空（跨用户防串）。
 */
const projectPermsCache = new Map<
  string,
  { perms: string[]; timestamp: number }
>();
const PROJECT_PERMS_TTL_MS = 5 * 60 * 1000;

/** 清空保存流权限缓存（AuthContext 登录/登出/跨标签页登出时调用） */
export function clearSavePermissionCache(): void {
  projectPermsCache.clear();
}

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
      const cached = projectPermsCache.get(projectId);
      let perms: string[];
      if (cached && Date.now() - cached.timestamp < PROJECT_PERMS_TTL_MS) {
        perms = cached.perms;
      } else {
        const result = await memberControllerGetUserProjectPermissions({
          path: { projectId },
        });
        // SDK 默认不抛错：失败时错误在 result.error。静默降级为"无权限"
        // 会让用户被误导"您没有保存图纸的权限"（历史 bug），必须抛出让上层显示真实原因
        if (result.error) throw result.error;
        perms = result.data?.permissions || [];
        projectPermsCache.set(projectId, { perms, timestamp: Date.now() });
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
