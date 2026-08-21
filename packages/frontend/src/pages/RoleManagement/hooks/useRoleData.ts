import { useState, useEffect, useCallback } from 'react';
import {
  rolesControllerFindAll,
  rolesControllerGetSystemProjectRoles,
} from '@/api-sdk';
import type { SystemRole, ProjectRoleTemplate } from '../types';
import type { LoadingControl } from './types';

export function useRoleData({ setLoading }: LoadingControl) {
  const [systemRoles, setSystemRoles] = useState<SystemRole[]>([]);
  const [projectRoleTemplates, setProjectRoleTemplates] = useState<
    ProjectRoleTemplate[]
  >([]);

  const loadSystemRoles = useCallback(async () => {
    try {
      const response = await rolesControllerFindAll();
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因
      if (response.error) throw response.error;
      setSystemRoles(response.data ?? []);
    } catch (error) {
      console.error('加载系统角色失败:', error);
    }
  }, []);

  // ADR-00XX：项目角色模板（isSystem=true, projectId=null），创建项目时的默认角色
  const loadProjectRoleTemplates = useCallback(async () => {
    try {
      const response = await rolesControllerGetSystemProjectRoles();
      if (response.error) throw response.error;
      setProjectRoleTemplates(
        (response.data ?? []).map((dto) => ({
          id: dto.id,
          name: dto.name,
          description: dto.description ?? undefined,
          isSystem: dto.isSystem,
          permissions: (dto.permissions ?? []).map((p) => p.permission),
          createdAt: dto.createdAt,
          updatedAt: dto.updatedAt,
          _count: { members: Number(dto._count?.members ?? 0) },
        }))
      );
    } catch (error) {
      console.error('加载项目角色模板失败:', error);
    }
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadSystemRoles(), loadProjectRoleTemplates()]);
    } finally {
      setLoading(false);
    }
  }, [loadSystemRoles, loadProjectRoleTemplates]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return {
    systemRoles,
    projectRoleTemplates,
    initialize,
    loadSystemRoles,
    loadProjectRoleTemplates,
  };
}
