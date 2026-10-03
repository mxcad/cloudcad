///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 运行时配置页数据层：取值、草稿、本地校验、保存、单键/分类重置、修改历史、搜索分组。
 *
 * 权限说明：进本页的人已持有 SYSTEM_CONFIG_READ/WRITE，档位（tier）只做展示分层，
 * 因此这里不做任何额外的权限判断。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  runtimeConfigControllerGetAllConfigs,
  runtimeConfigControllerUpdateConfig,
  runtimeConfigControllerResetConfig,
  runtimeConfigControllerGetConfigHistory,
  runtimeConfigControllerResetCategory,
} from '@/api-sdk';
import { useNotification } from '@/contexts/NotificationContext';
import { usePermission } from '@/hooks/usePermission';
import { SystemPermission } from '@/constants/permissions';
import { getErrorMessage, handleError } from '@/utils/errorHandler';
import { queryKeys } from '@/lib/queryKeys';
import { t } from '@/languages';
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  CATEGORY_ORDER,
  toConfigItems,
  toHistoryEntries,
} from '../meta';
import type { ConfigGroup, ConfigHistoryEntry, ConfigItem } from '../types';
import { defaultDraftOf, toSubmitValue, prettyJson } from '../validate';
import type { DraftValue } from '../validate';

/** 单条历史拉取条数（后端上限 100） */
const HISTORY_LIMIT = 50;

export interface RuntimeConfigStats {
  total: number;
  /** 后端标记的已修改项（区别于安装默认行） */
  modified: number;
  /** 需要重启才生效的项 */
  restartRequired: number;
  /** 环境变量已注入、优先级低于运行时配置的项 */
  envDriven: number;
  /** 当前页面尚未提交的草稿数 */
  pendingSave: number;
}

export interface UseRuntimeConfigReturn {
  configs: ConfigItem[];
  groups: ConfigGroup[];
  loading: boolean;
  drafts: Record<string, DraftValue>;
  fieldErrors: Record<string, string>;
  saving: Set<string>;
  savingCategory: boolean;
  resetPreviewCategory: string | null;
  resetPreviewItems: ConfigItem[];
  historyKey: string | null;
  history: ConfigHistoryEntry[];
  historyLoading: boolean;
  historyError: string | null;
  collapsed: Set<string>;
  keyword: string;
  onlyModified: boolean;
  secretVisible: Set<string>;
  canManageConfig: boolean;
  stats: RuntimeConfigStats;
  setKeyword: (keyword: string) => void;
  setOnlyModified: (onlyModified: boolean) => void;
  toggleCollapsed: (category: string) => void;
  setAllCollapsed: (collapsed: boolean) => void;
  draftOf: (item: ConfigItem) => DraftValue;
  isDirty: (item: ConfigItem) => boolean;
  handleDraftChange: (key: string, value: DraftValue) => void;
  handleFormatJson: (key: string) => void;
  handleSave: (key: string) => Promise<boolean>;
  handleReset: (key: string) => Promise<void>;
  toggleSecretVisibility: (key: string) => void;
  requestResetCategory: (category: string) => void;
  confirmResetCategory: () => Promise<void>;
  cancelResetCategory: () => void;
  openHistory: (key: string) => void;
  closeHistory: () => void;
}

/**
 * 判断一条草稿相对当前值是否有实际变化。
 * 合法草稿按规范化值比对（避免 JSON 纯格式差异误判为待保存）；
 * 非法草稿与当前值的文本表示比对——保证错误提示能显示、保存按钮可用，
 * 用户不会面对一个「无法提交也看不到原因」的死状态。
 */
function isDraftChanged(
  item: ConfigItem,
  draft: DraftValue | undefined
): boolean {
  if (draft === undefined) return false;
  const outcome = toSubmitValue(item, draft);
  if (outcome.valid && outcome.value !== undefined) {
    return JSON.stringify(outcome.value) !== JSON.stringify(item.value ?? null);
  }
  return String(draft).trim() !== String(item.value ?? '').trim();
}

export function useRuntimeConfig(): UseRuntimeConfigReturn {
  const { showToast, showConfirm } = useNotification();
  const { hasPermission } = usePermission();
  const queryClient = useQueryClient();

  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [savingCategory, setSavingCategory] = useState(false);
  const [resetPreviewCategory, setResetPreviewCategory] = useState<
    string | null
  >(null);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [history, setHistory] = useState<ConfigHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [onlyModified, setOnlyModified] = useState(false);
  /** 已展开显示的遮罩值（input.secret 项默认隐藏） */
  const [secretVisible, setSecretVisible] = useState<Set<string>>(new Set());

  const canManageConfig = hasPermission(SystemPermission.SYSTEM_CONFIG_WRITE);

  /**
   * 保存/重置 maxFileSize 后刷新公开配置缓存：该项是公开配置，
   * 前端上传限制读的是聚合后的 public 响应，不清缓存会导致同会话内上传限制不生效。
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
      // 否则 setConfigs(undefined) 会让后续 reduce 在渲染期崩溃
      if (result.error) throw result.error;
      setConfigs(toConfigItems(result.data));
    } catch (error: unknown) {
      handleError(error, t('获取配置失败'));
      showToast(getErrorMessage(error) || t('获取配置失败'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchConfigs();
  }, [fetchConfigs]);

  const configsByKey = useMemo(
    () => new Map(configs.map((item) => [item.key, item])),
    [configs]
  );

  const stats: RuntimeConfigStats = useMemo(
    () => ({
      total: configs.length,
      modified: configs.filter((c) => c.isModified).length,
      restartRequired: configs.filter((c) => c.hot === false).length,
      envDriven: configs.filter(
        (c) => c.envValue !== null && c.envValue !== undefined
      ).length,
      pendingSave: configs.filter((c) => isDraftChanged(c, drafts[c.key]))
        .length,
    }),
    [configs, drafts]
  );

  /** 搜索 + 只看已修改 → 按分类分组（分类顺序固定，已修改项组内置顶） */
  const groups: ConfigGroup[] = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const matched = configs.filter((item) => {
      if (onlyModified && !item.isModified) return false;
      if (!q) return true;
      return (
        item.key.toLowerCase().includes(q) ||
        (item.description ?? '').toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });

    const byCategory = new Map<string, ConfigItem[]>();
    for (const item of matched) {
      const list = byCategory.get(item.category) ?? [];
      list.push(item);
      byCategory.set(item.category, list);
    }

    const ordered = [...byCategory.keys()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 || ib === -1) return ia === -1 ? 1 : -1;
      return ia - ib;
    });

    return ordered.map((category) => {
      const items = [...(byCategory.get(category) ?? [])].sort((a, b) => {
        const ma = a.isModified ? 0 : 1;
        const mb = b.isModified ? 0 : 1;
        return ma - mb || a.key.localeCompare(b.key);
      });
      return {
        category,
        label: CATEGORY_META[category]?.label ?? category,
        icon: CATEGORY_META[category]?.icon ?? FALLBACK_CATEGORY_META.icon,
        items,
        modifiedCount: items.filter((i) => i.isModified).length,
      };
    });
  }, [configs, keyword, onlyModified]);

  const draftOf = useCallback(
    (item: ConfigItem): DraftValue => {
      const draft = drafts[item.key];
      return draft === undefined ? defaultDraftOf(item) : draft;
    },
    [drafts]
  );

  const isDirty = useCallback(
    (item: ConfigItem): boolean => isDraftChanged(item, drafts[item.key]),
    [drafts]
  );

  const handleDraftChange = useCallback((key: string, value: DraftValue) => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
    // 用户重新编辑即清除该项的就地错误
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /** 美化 JSON 草稿：只改缩进不改语义，无法解析时原样不动 */
  const handleFormatJson = useCallback(
    (key: string) => {
      const item = configsByKey.get(key);
      if (!item) return;
      setDrafts((prev) => {
        const current = prev[key] ?? defaultDraftOf(item);
        if (typeof current !== 'string') return prev;
        const next = prettyJson(current);
        if (next === current) return prev;
        return { ...prev, [key]: next };
      });
      setFieldErrors((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [configsByKey]
  );

  const toggleCollapsed = useCallback((category: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const setAllCollapsed = useCallback(
    (value: boolean) => {
      setCollapsed(value ? new Set(groups.map((g) => g.category)) : new Set());
    },
    [groups]
  );

  const toggleSecretVisibility = useCallback((key: string) => {
    setSecretVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /**
   * 保存单项。流程：本地校验 → 危险项二次确认 → 提交 → 就地错误 / toast。
   * 危险项（dangerous）在保存前确认并说明 impact；普通项不弹确认框，避免干扰日常操作。
   */
  const handleSave = useCallback(
    async (key: string): Promise<boolean> => {
      const item = configsByKey.get(key);
      if (!item) return false;

      const outcome = toSubmitValue(item, draftOf(item));
      if (!outcome.valid || outcome.value === undefined) {
        setFieldErrors((prev) => ({
          ...prev,
          [key]: outcome.message ?? t('输入值不合法'),
        }));
        return false;
      }

      if (item.dangerous) {
        const confirmed = await showConfirm({
          title: t('确认修改危险配置'),
          message: [
            t('即将修改「{key}」，该配置已标记为危险项。', { key }),
            item.impact ?? t('请确认了解该配置的影响面。'),
          ].join('\n'),
          confirmText: t('确认修改'),
          cancelText: t('取消'),
          type: 'warning',
        });
        if (!confirmed) return false;
      }

      try {
        setSaving((prev) => new Set(prev).add(key));
        const result = await runtimeConfigControllerUpdateConfig({
          path: { key },
          body: { val: outcome.value as never },
        });
        // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
        // 否则保存失败仍会弹「配置已保存」
        if (result.error) throw result.error;
        showToast(t('配置已保存'), 'success');
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        await fetchConfigs();
        await applyMaxFileSizeSideEffects(key);
        return true;
      } catch (error: unknown) {
        handleError(error, t('保存配置失败'));
        // 后端 400（范围/类型/枚举不合法）就地展示在对应卡片，而不是只弹全局 toast
        setFieldErrors((prev) => ({
          ...prev,
          [key]: getErrorMessage(error) || t('保存失败'),
        }));
        showToast(getErrorMessage(error) || t('保存失败'), 'error');
        return false;
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [
      configsByKey,
      draftOf,
      showConfirm,
      showToast,
      fetchConfigs,
      applyMaxFileSizeSideEffects,
    ]
  );

  /**
   * 单键恢复默认。
   * 后端语义是「清空显式修改标记」而非「写回默认值」：若该键在 .env 配了值，
   * 生效值会退回 env 值而不是代码默认值，因此确认文案必须带这一提示。
   */
  const handleReset = useCallback(
    async (key: string) => {
      const item = configsByKey.get(key);
      if (!item) return;

      const hasEnv = item.envValue !== null && item.envValue !== undefined;
      const lines = [t('确定要把「{key}」恢复默认吗？', { key })];
      if (hasEnv) {
        lines.push(
          t(
            '该项已由环境变量设置，恢复默认后生效值将变为环境变量值「{env}」，而不是代码默认值「{def}」。',
            {
              env: String(item.envValue),
              def: String(item.defaultValue ?? ''),
            }
          )
        );
      } else {
        lines.push(t('此操作会清空页面修改，不可撤销。'));
      }

      const confirmed = await showConfirm({
        title: t('确认恢复默认'),
        message: lines.join('\n'),
        confirmText: t('确认恢复'),
        cancelText: t('取消'),
        type: 'warning',
      });
      if (!confirmed) return;

      try {
        setSaving((prev) => new Set(prev).add(key));
        const result = await runtimeConfigControllerResetConfig({
          path: { key },
        });
        if (result.error) throw result.error;
        showToast(t('已恢复默认'), 'success');
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setFieldErrors((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        await fetchConfigs();
        await applyMaxFileSizeSideEffects(key);
      } catch (error: unknown) {
        handleError(error, t('恢复默认失败'));
        showToast(getErrorMessage(error) || t('恢复默认失败'), 'error');
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [
      configsByKey,
      showConfirm,
      showToast,
      fetchConfigs,
      applyMaxFileSizeSideEffects,
    ]
  );

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
        body: { category },
      });
      if (result.error) throw result.error;
      showToast(t('已恢复默认'), 'success');
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of configs) {
          if (item.category === category) delete next[item.key];
        }
        return next;
      });
      setFieldErrors({});
      await fetchConfigs();
      await applyMaxFileSizeSideEffects('maxFileSize');
    } catch (error: unknown) {
      handleError(error, t('恢复默认失败'));
      showToast(getErrorMessage(error) || t('恢复默认失败'), 'error');
    } finally {
      setSavingCategory(false);
    }
  }, [
    resetPreviewCategory,
    configs,
    showToast,
    fetchConfigs,
    applyMaxFileSizeSideEffects,
  ]);

  const resetPreviewItems = useMemo(
    () =>
      resetPreviewCategory
        ? configs.filter((c) => c.category === resetPreviewCategory)
        : [],
    [configs, resetPreviewCategory]
  );

  const openHistory = useCallback(async (key: string) => {
    setHistoryKey(key);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const result = await runtimeConfigControllerGetConfigHistory({
        path: { key },
        query: { limit: String(HISTORY_LIMIT) },
      });
      if (result.error) throw result.error;
      setHistory(toHistoryEntries(result.data));
    } catch (error: unknown) {
      handleError(error, t('获取修改历史失败'));
      setHistoryError(getErrorMessage(error) || t('获取修改历史失败'));
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const closeHistory = useCallback(() => {
    setHistoryKey(null);
    setHistory([]);
    setHistoryError(null);
  }, []);

  return {
    configs,
    groups,
    loading,
    drafts,
    fieldErrors,
    saving,
    savingCategory,
    resetPreviewCategory,
    resetPreviewItems,
    historyKey,
    history,
    historyLoading,
    historyError,
    collapsed,
    keyword,
    onlyModified,
    secretVisible,
    canManageConfig,
    stats,
    setKeyword,
    setOnlyModified,
    toggleCollapsed,
    setAllCollapsed,
    draftOf,
    isDirty,
    handleDraftChange,
    handleFormatJson,
    handleSave,
    handleReset,
    toggleSecretVisibility,
    requestResetCategory,
    confirmResetCategory,
    cancelResetCategory,
    openHistory,
    closeHistory,
  };
}
