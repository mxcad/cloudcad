///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The software code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications containing this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from './usePermission';
import type { TourGuide } from '../types/tour';
import type { Permission } from '../constants/permissions';
import { SystemPermission } from '../constants/permissions';

/**
 * 引导可见性检查 Hook
 * 
 * 根据用户权限和自定义条件过滤可见的引导流程
 * 
 * 使用方式：
 * const { getVisibleGuides, isGuideVisible } = useTourVisibility();
 * const visibleGuides = getVisibleGuides(allGuides);
 */
export const useTourVisibility = () => {
  const { isAuthenticated } = useAuth();
  const { hasAllPermissions } = usePermission();

  /**
   * 检查用户是否具有指定的系统权限
   * 权限列表中混合系统权限和项目权限时：
   * - 系统权限：直接检查用户角色权限
   * - 项目权限：需要用户在某个项目中具有该权限（这里放宽检查，仅检查系统权限）
   */
  const checkPermissions = useCallback(
    (permissions: Permission[]): boolean => {
      if (permissions.length === 0) return true;

      // 分离系统权限和项目权限
      const systemPermissions = permissions.filter((p) =>
        p.startsWith('SYSTEM_')
      );

      // 系统权限必须全部满足
      if (systemPermissions.length > 0) {
        return hasAllPermissions(systemPermissions as SystemPermission[]);
      }

      // 如果只有项目权限，暂时返回 true
      // 项目权限的精确检查需要在具体项目上下文中进行
      return true;
    },
    [hasAllPermissions]
  );

  /**
   * 检查单个引导是否对当前用户可见
   */
  const isGuideVisible = useCallback(
    async (guide: TourGuide): Promise<boolean> => {
      // 未登录用户不显示任何引导
      if (!isAuthenticated) return false;

      const visibility = guide.visibility;

      // 无配置 = 所有人可见
      if (!visibility) return true;

      // 权限检查
      if (visibility.permissions) {
        const hasPerms = checkPermissions(visibility.permissions);
        if (!hasPerms) return false;
      }

      // 自定义检查
      if (visibility.check) {
        try {
          const visible = await visibility.check();
          if (!visible) return false;
        } catch (error) {
          console.warn(`[TourVisibility] 自定义检查失败: ${guide.id}`, error);
          return false;
        }
      }

      return true;
    },
    [isAuthenticated, checkPermissions]
  );

  /**
   * 过滤出当前用户可见的引导列表
   * 注意：这是一个异步操作，需要在调用处处理
   */
  const getVisibleGuides = useCallback(
    async (guides: TourGuide[]): Promise<TourGuide[]> => {
      const results: TourGuide[] = [];

      for (const guide of guides) {
        const visible = await isGuideVisible(guide);
        if (visible) {
          results.push(guide);
        }
      }

      return results;
    },
    [isGuideVisible]
  );

  /**
   * 同步版本：仅基于权限过滤（不调用异步的自定义检查）
   * 用于组件渲染时的快速过滤
   */
  const getVisibleGuidesSync = useCallback(
    (guides: TourGuide[]): TourGuide[] => {
      if (!isAuthenticated) return [];

      return guides.filter((guide) => {
        const visibility = guide.visibility;

        // 无配置 = 所有人可见
        if (!visibility) return true;

        // 权限检查
        if (visibility.permissions) {
          const hasPerms = checkPermissions(visibility.permissions);
          if (!hasPerms) return false;
        }

        // 自定义同步检查（如果有）
        if (visibility.check) {
          try {
            // 尝试同步调用
            const result = visibility.check();
            // 如果返回 Promise，跳过（无法同步处理）
            if (result instanceof Promise) return true;
            if (!result) return false;
          } catch {
            // 检查失败时保留
            return true;
          }
        }

        return true;
      });
    },
    [isAuthenticated, checkPermissions]
  );

  return useMemo(
    () => ({
      isGuideVisible,
      getVisibleGuides,
      getVisibleGuidesSync,
      checkPermissions,
    }),
    [isGuideVisible, getVisibleGuides, getVisibleGuidesSync, checkPermissions]
  );
};

export default useTourVisibility;
