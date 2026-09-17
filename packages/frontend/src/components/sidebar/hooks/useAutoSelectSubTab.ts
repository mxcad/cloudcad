///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026，成都梦想凯德科技有限公司。
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useEffect, useRef } from 'react';
import type { DrawingsSubTab } from '../../../types/sidebar';
import type { CurrentFileInfo } from '../../../services/mxcadManager/mxcadTypes';

interface UseAutoSelectSubTabOptions {
  /** 当前打开的文件信息 */
  fileInfo: CurrentFileInfo | null;
  /** 当前激活的子tab */
  activeDrawingsSubTab: DrawingsSubTab;
  /** 设置子tab */
  setActiveDrawingsSubTab: (tab: DrawingsSubTab) => void;
  /** 保存上次激活的子tab */
  setLastDrawingsSubTab: (tab: DrawingsSubTab | null) => void;
  /** 是否记住状态 */
  rememberState: boolean;
}

/**
 * 自动选择子tab hook
 *
 * 首次打开CAD编辑器时，根据图纸来源自动选择正确的子tab。
 * 只在首次打开时执行，CAD编辑器内部切换文件时不干扰用户选择。
 */
export function useAutoSelectSubTab({
  fileInfo,
  activeDrawingsSubTab,
  setActiveDrawingsSubTab,
  setLastDrawingsSubTab,
  rememberState,
}: UseAutoSelectSubTabOptions) {
  // 跟踪是否已完成首次子tab自动选择
  const hasAutoSelectedSubTabRef = useRef(false);

  useEffect(() => {
    if (hasAutoSelectedSubTabRef.current) return;
    if (!fileInfo) return;

    let targetSubTab: DrawingsSubTab | null = null;

    // 1. 库文件优先
    if (fileInfo.libraryKey === 'drawing') {
      targetSubTab = 'drawings-gallery';
    } else if (fileInfo.libraryKey === 'block') {
      targetSubTab = 'blocks-gallery';
    }
    // 2. 个人空间文件（personalSpaceId存在且projectId等于personalSpaceId）
    else if (
      fileInfo.personalSpaceId &&
      fileInfo.projectId === fileInfo.personalSpaceId
    ) {
      targetSubTab = 'my-drawings';
    }
    // 3. 项目文件（projectId存在且不等于personalSpaceId）
    else if (fileInfo.projectId) {
      targetSubTab = 'my-project';
    }

    // 如果有匹配的目标子tab，执行自动选择
    if (targetSubTab) {
      hasAutoSelectedSubTabRef.current = true;
      if (targetSubTab !== activeDrawingsSubTab) {
        setActiveDrawingsSubTab(targetSubTab);
        if (rememberState) {
          setLastDrawingsSubTab(targetSubTab);
        }
      }
    }
  }, [
    fileInfo,
    activeDrawingsSubTab,
    setActiveDrawingsSubTab,
    setLastDrawingsSubTab,
    rememberState,
  ]);
}
