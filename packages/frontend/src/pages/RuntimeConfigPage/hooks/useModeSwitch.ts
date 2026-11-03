///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 安全模式切换对话框数据层（useRuntimeConfig 的子 hook，按职责切片）。
 *
 * 只关心「预览目标模式 / 应用模式」：模式目标、预览清单（含受管项计数）、
 * 应用流程。写库成功后经 `onApplied` 回调让主 hook 清草稿 + 刷新列表 + 刷通道。
 */

import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  runtimeConfigControllerPreviewProfile,
  runtimeConfigControllerApplyProfile,
} from '@/api-sdk';
import type { RuntimeProfilePreviewResponseDto } from '@/api-sdk';
import { getErrorMessage, handleError } from '@/utils/errorHandler';
import { queryKeys } from '@/lib/queryKeys';
import { t } from '@/languages';

export interface UseModeSwitchReturn {
  /** 当前选定的目标安全模式；null 表示未打开切换对话框 */
  modeSwitchTarget: 'secure' | 'normal' | null;
  /** 打开对话框后拉预览的加载态 */
  modePreviewing: boolean;
  /** 已取预览对应的目标模式（计数来源，可能早于对话框打开） */
  modePreviewTarget: 'secure' | 'normal' | null;
  /** 预览清单（willChange 决定将改动、envValue 标出 env 遮蔽项） */
  modePreview: RuntimeProfilePreviewResponseDto[];
  modeSaving: boolean;
  requestModeSwitch: (target: 'secure' | 'normal') => Promise<void>;
  confirmModeSwitch: () => Promise<void>;
  cancelModeSwitch: () => void;
  /** 仅拉取预览不打开对话框（首次进页取「模式受管项」计数用） */
  loadModePreview: (target: 'secure' | 'normal') => Promise<void>;
  /** 受安全模式管理的键（预览响应只返回这类键），主 hook 据此统计受管项数 */
  modeProfileKeys: Set<string>;
}

export function useModeSwitch(
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void,
  onApplied: (applied: string[], unchanged: string[]) => Promise<void>
): UseModeSwitchReturn {
  const queryClient = useQueryClient();
  const [modeSwitchTarget, setModeSwitchTarget] = useState<
    'secure' | 'normal' | null
  >(null);
  const [modePreviewing, setModePreviewing] = useState(false);
  const [modePreviewTarget, setModePreviewTarget] = useState<
    'secure' | 'normal' | null
  >(null);
  const [modePreview, setModePreview] = useState<
    RuntimeProfilePreviewResponseDto[]
  >([]);
  const [modeSaving, setModeSaving] = useState(false);

  /**
   * 拉取模式预览。预览只读不写库，故点击切换时直接发；首次进页也取一次，
   * 因为「模式受管项」计数没有别的来源（配置列表 DTO 不含 profiles 字段）。
   */
  const loadModePreview = useCallback(
    async (target: 'secure' | 'normal') => {
      setModePreviewTarget(target);
      setModePreviewing(true);
      try {
        const result = await runtimeConfigControllerPreviewProfile({
          throwOnError: true,
          body: { profile: target },
        });
        setModePreview(result.data ?? []);
      } catch (error: unknown) {
        // 首次静默失败只影响计数（显示 0）；打开对话框时同样失败则停在空清单、确认禁用
        handleError(error, t('获取切换预览失败'));
        showToast(getErrorMessage(error) || t('获取切换预览失败'), 'error');
      } finally {
        setModePreviewing(false);
      }
    },
    [showToast]
  );

  /** 打开切换对话框：目标模式与已取预览不同时才重新拉取 */
  const requestModeSwitch = useCallback(
    async (target: 'secure' | 'normal') => {
      setModeSwitchTarget(target);
      if (modePreviewTarget !== target) {
        await loadModePreview(target);
      }
    },
    [modePreviewTarget, loadModePreview]
  );

  /** 应用模式：写库成功后清空被覆盖项的草稿并刷新列表 */
  const confirmModeSwitch = useCallback(async () => {
    if (!modeSwitchTarget) return;
    const target = modeSwitchTarget;
    setModeSwitchTarget(null);
    setModeSaving(true);
    try {
      const result = await runtimeConfigControllerApplyProfile({
        throwOnError: true,
        body: { profile: target },
      });
      const applied = result.data?.applied ?? [];
      const unchanged = result.data?.unchanged ?? [];
      showToast(
        t('已切换到{mode}（{n} 项生效）', {
          mode: target === 'secure' ? t('安全模式') : t('普通模式'),
          n: String(applied.length),
        }),
        'success'
      );
      // securityMode 本身是公开项，Layout 横幅读的就是这个缓存
      await queryClient.invalidateQueries({
        queryKey: queryKeys.runtimeConfig.public,
      });
      await onApplied(applied, unchanged);
    } catch (error: unknown) {
      handleError(error, t('切换模式失败'));
      showToast(getErrorMessage(error) || t('切换模式失败'), 'error');
    } finally {
      setModeSaving(false);
    }
  }, [modeSwitchTarget, showToast, queryClient, onApplied]);

  const cancelModeSwitch = useCallback(() => {
    setModeSwitchTarget(null);
    setModePreview([]);
  }, []);

  const modeProfileKeys = useMemo(
    () => new Set(modePreview.map((e) => e.key)),
    [modePreview]
  );

  return {
    modeSwitchTarget,
    modePreviewing,
    modePreviewTarget,
    modePreview,
    modeSaving,
    requestModeSwitch,
    confirmModeSwitch,
    cancelModeSwitch,
    loadModePreview,
    modeProfileKeys,
  };
}
