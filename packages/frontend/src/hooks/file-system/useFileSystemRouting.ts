///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * useFileSystemRouting - URL/参数解析与模式派生
 *
 * 从 URL 路径解析 projectId/nodeId（外部传入优先），派生视图模式标志：
 * - isProjectRootMode：项目根目录模式
 * - isFolderMode：文件夹模式
 * - isPersonalSpaceMode：个人空间模式
 */

import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

interface UseFileSystemRoutingOptions {
  mode?: 'project' | 'personal-space';
  personalSpaceId?: string | null;
  /** 外部传入的项目 ID（优先于 URL 解析，用于侧边栏等独立导航场景） */
  externalProjectId?: string | null;
  /** 外部传入的节点 ID（优先于 URL 解析，用于侧边栏等独立导航场景） */
  externalNodeId?: string | null;
}

export const useFileSystemRouting = ({
  mode = 'project',
  personalSpaceId,
  externalProjectId,
  externalNodeId,
}: UseFileSystemRoutingOptions) => {
  const location = useLocation();

  // 从 URL 路径直接解析 projectId 和 nodeId（支持外部覆盖）
  const urlProjectId = useMemo(() => {
    // 外部传入优先
    if (externalProjectId !== undefined && externalProjectId !== null) {
      return externalProjectId;
    }
    // 私人空间模式：使用私人空间 ID
    if (mode === 'personal-space') {
      return personalSpaceId || '';
    }
    const match = location.pathname.match(/\/projects\/([^/]+)/);
    return match ? match[1] : '';
  }, [location.pathname, mode, personalSpaceId, externalProjectId]);

  const urlNodeId = useMemo(() => {
    // 外部传入优先
    if (externalNodeId !== undefined && externalNodeId !== null) {
      return externalNodeId || undefined;
    }
    // 私人空间模式的 URL nodeId 解析
    if (mode === 'personal-space') {
      const match = location.pathname.match(/\/personal-space\/([^/]+)/);
      return match ? match[1] : undefined;
    }
    const match = location.pathname.match(/\/projects\/[^/]+\/files\/([^/]+)/);
    return match ? match[1] : undefined;
  }, [location.pathname, mode, externalNodeId]);

  // 模式判断：私人空间模式或项目根目录模式
  const isProjectRootMode = mode === 'project' && !urlProjectId;
  const isFolderMode = !!urlProjectId;
  const isPersonalSpaceMode = mode === 'personal-space';

  return {
    urlProjectId,
    urlNodeId,
    isProjectRootMode,
    isFolderMode,
    isPersonalSpaceMode,
  };
};

export type { UseFileSystemRoutingOptions };
