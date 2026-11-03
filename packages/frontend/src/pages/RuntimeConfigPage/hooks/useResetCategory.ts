///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 分类级批量恢复默认对话框数据层（useRuntimeConfig 的子 hook，按职责切片）。
 *
 * 只关心「预览将恢复的分类项 / 确认批量恢复」：重置目标分类、预览清单、
 * 确认流程。确认成功后经 `onReset` 回调让主 hook 清草稿 + 刷新列表 + 刷公开缓存 + 刷通道。
 */

import { useCallback, useMemo, useState } from 'react';
import { runtimeConfigControllerResetCategory } from '@/api-sdk';
import { getErrorMessage, handleError } from '@/utils/errorHandler';
import { t } from '@/languages';
import type { ConfigItem } from '../types';

export interface UseResetCategoryReturn {
  resetPreviewCategory: string | null;
  resetPreviewItems: ConfigItem[];
  savingCategory: boolean;
  requestResetCategory: (category: string) => void;
  confirmResetCategory: () => Promise<void>;
  cancelResetCategory: () => void;
}

export function useResetCategory(
  configs: ConfigItem[],
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void,
  onReset: (category: string) => Promise<void>
): UseResetCategoryReturn {
  const [resetPreviewCategory, setResetPreviewCategory] = useState<
    string | null
  >(null);
  const [savingCategory, setSavingCategory] = useState(false);

  const requestResetCategory = useCallback((category: string) => {
    setResetPreviewCategory(category);
  }, []);

  const cancelResetCategory = useCallback(() => {
    setResetPreviewCategory(null);
  }, []);

  /** 分类级批量恢复默认：先预览将恢复的项，确认后走 reset-category 端点 */
  const confirmResetCategory = useCallback(async () => {
    if (!resetPreviewCategory) return;
    const category = resetPreviewCategory;
    setResetPreviewCategory(null);
    setSavingCategory(true);
    try {
      const result = await runtimeConfigControllerResetCategory({
        throwOnError: true,
        body: { category },
      });
      void result;
      showToast(t('已恢复默认'), 'success');
      await onReset(category);
    } catch (error: unknown) {
      handleError(error, t('恢复默认失败'));
      showToast(getErrorMessage(error) || t('恢复默认失败'), 'error');
    } finally {
      setSavingCategory(false);
    }
  }, [resetPreviewCategory, showToast, onReset]);

  const resetPreviewItems = useMemo(
    () =>
      resetPreviewCategory
        ? configs.filter((c) => c.category === resetPreviewCategory)
        : [],
    [configs, resetPreviewCategory]
  );

  return {
    resetPreviewCategory,
    resetPreviewItems,
    savingCategory,
    requestResetCategory,
    confirmResetCategory,
    cancelResetCategory,
  };
}
