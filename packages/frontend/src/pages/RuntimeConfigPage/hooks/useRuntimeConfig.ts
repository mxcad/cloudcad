///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  runtimeConfigControllerGetAllConfigs,
  runtimeConfigControllerUpdateConfig,
  runtimeConfigControllerResetConfig,
} from '@/api-sdk';
import type { RuntimeConfigResponseDto } from '@/api-sdk';
import { useNotification } from '@/contexts/NotificationContext';
import { usePermission } from '@/hooks/usePermission';
import { SystemPermission } from '@/constants/permissions';
import { handleError } from '@/utils/errorHandler';
import { queryKeys } from '@/lib/queryKeys';
import {
  Mail,
  Globe,
  Users,
  FileText,
  Cpu,
  Settings,
  Smartphone,
  MessageCircle,
  HardDrive,
  CreditCard,
  Monitor,
  Share2,
  Gauge,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { t } from '@/languages';

// ── Types ──

export interface ConfigGroup {
  category: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  items: RuntimeConfigResponseDto[];
}

export interface ConfigStats {
  total: number;
  public: number;
  modified: number;
}

// ── Constants ──

export const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: ComponentType<{ size?: number; className?: string }> }
> = {
  mail: { label: t('邮件配置'), icon: Mail },
  sms: { label: t('短信配置'), icon: Smartphone },
  support: { label: t('客服信息'), icon: Globe },
  file: { label: t('文件配置'), icon: FileText },
  user: { label: t('用户管理'), icon: Users },
  system: { label: t('系统配置'), icon: Cpu },
  wechat: { label: t('微信配置'), icon: MessageCircle },
  storage: { label: t('存储配置'), icon: HardDrive },
  billing: { label: t('支付配置'), icon: CreditCard },
  device: { label: t('设备授权'), icon: Monitor },
  collaboration: { label: t('协同配置'), icon: Share2 },
  quota: { label: t('配额配置'), icon: Gauge },
};

// ── Utility functions ──

export function isSensitiveKey(key: string): boolean {
  const sensitivePatterns = ['password', 'secret', 'token', 'key', 'api'];
  return sensitivePatterns.some((pattern) =>
    key.toLowerCase().includes(pattern)
  );
}

export function getConfigUnit(key: string): string | null {
  const unitMap: Record<string, string> = {
    maxFileSize: 'MB',
    fontMaxFileSize: 'MB',
    extRefMaxFileSize: 'MB',
  };
  return unitMap[key] || null;
}

export function parseValue(
  item: RuntimeConfigResponseDto,
  editedValues: Record<string, string | number | boolean>
): string | number | boolean {
  const edited = editedValues[item.key];
  if (edited !== undefined) {
    return edited;
  }
  return item.value as unknown as string | number | boolean;
}

// ── Hook ──

export interface UseRuntimeConfigReturn {
  configs: RuntimeConfigResponseDto[];
  groupedConfigs: ConfigGroup[];
  loading: boolean;
  saving: Set<string>;
  editedValues: Record<string, string | number | boolean>;
  hiddenValues: Set<string>;
  canManageConfig: boolean;
  modifiedCount: number;
  configStats: ConfigStats;
  handleValueChange: (key: string, value: string | number | boolean) => void;
  handleSave: (key: string) => Promise<void>;
  handleReset: (key: string) => Promise<void>;
  toggleValueVisibility: (key: string) => void;
  isValueHidden: (key: string) => boolean;
}

export function useRuntimeConfig(): UseRuntimeConfigReturn {
  const { showToast, showConfirm } = useNotification();
  const { hasPermission } = usePermission();

  const [configs, setConfigs] = useState<RuntimeConfigResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [editedValues, setEditedValues] = useState<
    Record<string, string | number | boolean>
  >({});
  const [hiddenValues, setHiddenValues] = useState<Set<string>>(new Set());

  const canManageConfig = hasPermission(SystemPermission.SYSTEM_CONFIG_WRITE);
  const queryClient = useQueryClient();

  /**
   * 保存/重置 maxFileSize 后，刷新公开配置缓存，
   * 保证同一会话内图纸上传限制即时生效（无需刷新页面）。
   * 仅 maxFileSize 为公开配置（fontMaxFileSize/extRefMaxFileSize 非公开，后端读库即时生效，无需刷新）。
   */
  const applyMaxFileSizeSideEffects = useCallback(
    async (key: string) => {
      if (key !== 'maxFileSize') return;
      await queryClient.invalidateQueries({
        queryKey: queryKeys.runtimeConfig.public,
      });
    },
    [queryClient]
  );

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const result = await runtimeConfigControllerGetAllConfigs();
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
      // 否则 setConfigs(undefined) 导致渲染期 reduce 崩溃（历史 bug）
      if (result.error) throw result.error;
      setConfigs(result.data as RuntimeConfigResponseDto[]);
    } catch (error: unknown) {
      handleError(error, t('获取配置失败'));
      showToast(
        error instanceof Error ? error.message : t('获取配置失败'),
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const groupedConfigs: ConfigGroup[] = useMemo(
    () =>
      Object.entries(
        configs.reduce<Record<string, RuntimeConfigResponseDto[]>>(
          (acc, config) => {
            const category = config.category;
            if (!acc[category]) {
              acc[category] = [];
            }
            acc[category]!.push(config);
            return acc;
          },
          {}
        )
      )
        .map(([category, items]) => ({
          category,
          label: CATEGORY_CONFIG[category]?.label || category,
          icon: CATEGORY_CONFIG[category]?.icon || Settings,
          items,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [configs]
  );

  const handleValueChange = useCallback(
    (key: string, value: string | number | boolean) => {
      setEditedValues((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSave = useCallback(
    async (key: string) => {
      const value = editedValues[key];
      if (value === undefined) return;

      try {
        setSaving((prev) => new Set(prev).add(key));
        const result = await runtimeConfigControllerUpdateConfig({
          path: { key },
          body: { val: value as never },
        });
        // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
        // 否则保存失败仍弹"配置已保存"（历史 bug）
        if (result.error) throw result.error;
        showToast(t('配置已保存'), 'success');
        setEditedValues((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        await fetchConfigs();
        await applyMaxFileSizeSideEffects(key);
      } catch (error: unknown) {
        handleError(error, t('保存配置失败'));
        showToast(
          error instanceof Error ? error.message : t('保存失败'),
          'error'
        );
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [editedValues, fetchConfigs, showToast, applyMaxFileSizeSideEffects]
  );

  const handleReset = useCallback(
    async (key: string) => {
      const confirmed = await showConfirm({
        title: t('确认重置'),
        message: t('确定要将此配置重置为默认值吗？此操作不可撤销。'),
        confirmText: t('确认重置'),
        cancelText: t('取消'),
        type: 'warning',
      });

      if (!confirmed) return;

      try {
        setSaving((prev) => new Set(prev).add(key));
        const result = await runtimeConfigControllerResetConfig({
          path: { key },
        });
        // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
        // 否则重置失败仍弹"已重置为默认值"（历史 bug）
        if (result.error) throw result.error;
        showToast(t('已重置为默认值'), 'success');
        setEditedValues((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        await fetchConfigs();
        await applyMaxFileSizeSideEffects(key);
      } catch (error: unknown) {
        handleError(error, t('重置配置失败'));
        showToast(
          error instanceof Error ? error.message : t('重置失败'),
          'error'
        );
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [fetchConfigs, showConfirm, showToast, applyMaxFileSizeSideEffects]
  );

  const toggleValueVisibility = useCallback((key: string) => {
    setHiddenValues((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const isValueHidden = useCallback(
    (key: string): boolean => {
      return hiddenValues.has(key);
    },
    [hiddenValues]
  );

  const modifiedCount = Object.keys(editedValues).length;

  const configStats: ConfigStats = useMemo(
    () => ({
      total: configs.length,
      public: configs.filter((c) => c.isPublic).length,
      modified: modifiedCount,
    }),
    [configs, modifiedCount]
  );

  return {
    configs,
    groupedConfigs,
    loading,
    saving,
    editedValues,
    hiddenValues,
    canManageConfig,
    modifiedCount,
    configStats,
    handleValueChange,
    handleSave,
    handleReset,
    toggleValueVisibility,
    isValueHidden,
  };
}
