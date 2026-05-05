///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useEffect, useCallback, useMemo } from 'react';
import { runtimeConfigControllerGetAllConfigs, runtimeConfigControllerUpdateConfig, runtimeConfigControllerResetConfig } from '@/api-sdk';
import type { RuntimeConfigResponseDto } from '@/api-sdk';
import { useNotification } from '@/contexts/NotificationContext';
import { usePermission } from '@/hooks/usePermission';
import { SystemPermission } from '@/constants/permissions';
import { handleError } from '@/utils/errorHandler';
import { Mail, Globe, Users, FileText, Cpu, Settings, Smartphone, MessageCircle, HardDrive } from 'lucide-react';
import type { ComponentType } from 'react';

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

export const CATEGORY_CONFIG: Record<string, { label: string; icon: ComponentType<{ size?: number; className?: string }> }> = {
  mail: { label: '邮件配置', icon: Mail },
  sms: { label: '短信配置', icon: Smartphone },
  support: { label: '客服信息', icon: Globe },
  file: { label: '文件配置', icon: FileText },
  user: { label: '用户管理', icon: Users },
  system: { label: '系统配置', icon: Cpu },
  wechat: { label: '微信配置', icon: MessageCircle },
  storage: { label: '存储配置', icon: HardDrive },
};

// ── Utility functions ──

export function isSensitiveKey(key: string): boolean {
  const sensitivePatterns = ['password', 'secret', 'token', 'key', 'api'];
  return sensitivePatterns.some((pattern) => key.toLowerCase().includes(pattern));
}

export function getConfigUnit(key: string): string | null {
  const unitMap: Record<string, string> = {
    userStorageQuota: 'GB',
    projectStorageQuota: 'GB',
    libraryStorageQuota: 'GB',
    maxFileSize: 'MB',
  };
  return unitMap[key] || null;
}

export function parseValue(
  item: RuntimeConfigResponseDto,
  editedValues: Record<string, string | number | boolean>,
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
  const [editedValues, setEditedValues] = useState<Record<string, string | number | boolean>>({});
  const [hiddenValues, setHiddenValues] = useState<Set<string>>(new Set());

  const canManageConfig = hasPermission(SystemPermission.SYSTEM_CONFIG_WRITE);

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await runtimeConfigControllerGetAllConfigs();
      setConfigs(data as RuntimeConfigResponseDto[]);
    } catch (error: unknown) {
      handleError(error, '获取配置失败');
      showToast(error instanceof Error ? error.message : '获取配置失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const groupedConfigs: ConfigGroup[] = useMemo(() =>
    Object.entries(
      configs.reduce<Record<string, RuntimeConfigResponseDto[]>>((acc, config) => {
        const category = config.category;
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category]!.push(config);
        return acc;
      }, {}),
    )
      .map(([category, items]) => ({
        category,
        label: CATEGORY_CONFIG[category]?.label || category,
        icon: CATEGORY_CONFIG[category]?.icon || Settings,
        items,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  [configs]);

  const handleValueChange = useCallback((key: string, value: string | number | boolean) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async (key: string) => {
    const value = editedValues[key];
    if (value === undefined) return;

    try {
      setSaving((prev) => new Set(prev).add(key));
      await runtimeConfigControllerUpdateConfig({ path: { key }, body: { value: value as never } });
      showToast('配置已保存', 'success');
      setEditedValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await fetchConfigs();
    } catch (error: unknown) {
      handleError(error, '保存配置失败');
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [editedValues, fetchConfigs, showToast]);

  const handleReset = useCallback(async (key: string) => {
    const confirmed = await showConfirm({
      title: '确认重置',
      message: '确定要将此配置重置为默认值吗？此操作不可撤销。',
      confirmText: '确认重置',
      cancelText: '取消',
      type: 'warning',
    });

    if (!confirmed) return;

    try {
      setSaving((prev) => new Set(prev).add(key));
      await runtimeConfigControllerResetConfig({ path: { key } });
      showToast('已重置为默认值', 'success');
      setEditedValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await fetchConfigs();
    } catch (error: unknown) {
      handleError(error, '重置配置失败');
      showToast(error instanceof Error ? error.message : '重置失败', 'error');
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [fetchConfigs, showConfirm, showToast]);

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

  const isValueHidden = useCallback((key: string): boolean => {
    return hiddenValues.has(key);
  }, [hiddenValues]);

  const modifiedCount = Object.keys(editedValues).length;

  const configStats: ConfigStats = useMemo(() => ({
    total: configs.length,
    public: configs.filter((c) => c.isPublic).length,
    modified: modifiedCount,
  }), [configs, modifiedCount]);

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
