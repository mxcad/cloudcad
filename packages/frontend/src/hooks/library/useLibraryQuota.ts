///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback } from 'react';

import {
  fileSystemControllerGetStorageQuota,
  fileSystemControllerUpdateStorageQuota,
  runtimeConfigControllerGetPublicConfigs,
  StorageInfoDto
} from '@/api-sdk';
import { getErrorMessage } from '@/utils/errorHandler';
import { t } from '@/languages';

interface UseLibraryQuotaOptions {
  /** 资源库 ID */
  libraryId: string | null;
  /** 库类型，用于提示信息区分 */
  libraryType: 'drawing' | 'block';
  /** 显示提示消息 */
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface UseLibraryQuotaReturn {
  /** 配额弹窗是否打开 */
  quotaModalOpen: boolean;
  /** 配额加载中 */
  quotaLoading: boolean;
  /** 当前库配额度（GB） */
  libraryQuota: number;
  /** 默认配额度（GB） */
  defaultLibraryQuota: number;
  /** 配额是否为系统默认 */
  quotaIsDefault: boolean;
  /** 库存储信息 */
  libraryStorageInfo: StorageInfoDto | null;
  /** 打开配额弹窗并加载数据 */
  openQuotaModal: () => Promise<void>;
  /** 关闭配额弹窗 */
  closeQuotaModal: () => void;
  /** 修改配额度 */
  setLibraryQuota: (gb: number) => void;
  /** 保存库配额 */
  saveLibraryQuota: () => Promise<void>;
}

/**
 * 资源库存储配额管理 Hook
 *
 * 管理配额弹窗的打开/关闭、配额数据的加载与保存。
 */
export function useLibraryQuota({
  libraryId,
  libraryType: _libraryType,
  showToast,
}: UseLibraryQuotaOptions): UseLibraryQuotaReturn {
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [libraryQuota, setLibraryQuota] = useState<number>(100);
  const [defaultLibraryQuota, setDefaultLibraryQuota] = useState<number>(100);
  const [quotaIsDefault, setQuotaIsDefault] = useState(true);
  const [libraryStorageInfo, setLibraryStorageInfo] = useState<StorageInfoDto | null>(null);

  const openQuotaModal = useCallback(async () => {
    setQuotaModalOpen(true);
    setQuotaLoading(true);

    try {
      // 获取默认配额（GB）
      const response = await runtimeConfigControllerGetPublicConfigs();
      const configs = response.data as unknown as Record<string, number> | undefined;
      const defaultVal = configs?.libraryStorageQuota || 100;
      setDefaultLibraryQuota(defaultVal);

      // 获取公共资源库的存储信息
      if (libraryId) {
        const { data: storageInfo } = await fileSystemControllerGetStorageQuota({
          query: { nodeId: libraryId, userId: '' },
        });

        if (storageInfo) {
          setLibraryStorageInfo(storageInfo);
          setQuotaIsDefault(storageInfo.isDefault ?? true);
          // total 是字节，转换为 GB
          const totalGB = parseFloat(
            ((storageInfo.total || defaultVal * 1024 * 1024 * 1024) /
              (1024 * 1024 * 1024)).toFixed(2)
          );
          setLibraryQuota(totalGB);
        }
      } else {
        // 没有库 ID 时使用默认值
        setLibraryQuota(defaultVal);
      }
    } catch (error) {
      console.error('获取库配额失败:', error);
      showToast(getErrorMessage(error), 'error');
    } finally {
      setQuotaLoading(false);
    }
  }, [libraryId, showToast]);

  const closeQuotaModal = useCallback(() => {
    setQuotaModalOpen(false);
  }, []);

  const saveLibraryQuota = useCallback(async () => {
    if (!libraryId) {
      showToast(t('无法获取库节点 ID'), 'error');
      return;
    }

    setQuotaLoading(true);
    try {
      // 调用后端 API 更新库节点配额（GB）
      await fileSystemControllerUpdateStorageQuota({
        body: { nodeId: libraryId, quota: libraryQuota },
      });

      showToast(t(`库配额已更新为 ${libraryQuota} GB`), 'success');
      setQuotaModalOpen(false);

      // 刷新库配额信息
      const { data: storageInfo } = await fileSystemControllerGetStorageQuota({
        query: { nodeId: libraryId, userId: '' },
      });
      if (storageInfo) {
        setLibraryStorageInfo(storageInfo);
        setQuotaIsDefault(storageInfo.isDefault ?? true);
      }
    } catch (error: unknown) {
      console.error('保存库配额失败:', error);
      showToast(getErrorMessage(error), 'error');
    } finally {
      setQuotaLoading(false);
    }
  }, [libraryId, libraryQuota, showToast]);

  return {
    quotaModalOpen,
    quotaLoading,
    libraryQuota,
    defaultLibraryQuota,
    quotaIsDefault,
    libraryStorageInfo,
    openQuotaModal,
    closeQuotaModal,
    setLibraryQuota,
    saveLibraryQuota,
  };
}