import { useCallback } from 'react';
import { projectsApi } from '../services/projectsApi';

/**
 * 项目权限检查 Hook
 *
 * 使用方式：
 * const { checkPermission } = useProjectPermission();
 * const canUpload = await checkPermission(projectId, 'project:file:upload');
 */
export const useProjectPermission = () => {
  /**
   * 检查用户在项目中是否具有指定权限
   * @param projectId 项目 ID
   * @param permission 权限字符串（如 'project:file:upload'）
   */
  const checkPermission = useCallback(
    async (projectId: string, permission: string): Promise<boolean> => {
      try {
        const response = await projectsApi.checkPermission(
          projectId,
          permission
        );
        return response.data.hasPermission || false;
      } catch (error) {
        console.error('检查项目权限失败:', error);
        return false;
      }
    },
    []
  );

  /**
   * 获取用户在项目中的所有权限
   * @param projectId 项目 ID
   */
  const getPermissions = useCallback(
    async (projectId: string): Promise<string[]> => {
      try {
        const response = await projectsApi.getPermissions(projectId);
        return response.data.permissions || [];
      } catch (error) {
        console.error('获取项目权限失败:', error);
        return [];
      }
    },
    []
  );

  /**
   * 获取用户在项目中的角色
   * @param projectId 项目 ID
   */
  const getRole = useCallback(
    async (projectId: string): Promise<string | null> => {
      try {
        const response = await projectsApi.getRole(projectId);
        return response.data.role || null;
      } catch (error) {
        console.error('获取项目角色失败:', error);
        return null;
      }
    },
    []
  );

  /**
   * 检查用户是否具有任意一个指定权限
   * @param projectId 项目 ID
   * @param permissions 权限字符串数组
   *
   * 性能优化：使用 Promise.all 并行检查所有权限，避免串行等待
   */
  const checkAnyPermission = useCallback(
    async (projectId: string, permissions: string[]): Promise<boolean> => {
      // 使用 Promise.all 并行检查所有权限
      const results = await Promise.all(
        permissions.map((permission) => checkPermission(projectId, permission))
      );
      // 只要有任意一个权限为 true，则返回 true
      return results.some((result) => result === true);
    },
    [checkPermission]
  );

  /**
   * 检查用户是否具有所有指定权限
   * @param projectId 项目 ID
   * @param permissions 权限字符串数组
   *
   * 性能优化：使用 Promise.all 并行检查所有权限，避免串行等待
   */
  const checkAllPermissions = useCallback(
    async (projectId: string, permissions: string[]): Promise<boolean> => {
      // 使用 Promise.all 并行检查所有权限
      const results = await Promise.all(
        permissions.map((permission) => checkPermission(projectId, permission))
      );
      // 所有权限都必须为 true，才返回 true
      return results.every((result) => result === true);
    },
    [checkPermission]
  );

  return {
    checkPermission,
    getPermissions,
    getRole,
    checkAnyPermission,
    checkAllPermissions,
  };
};
