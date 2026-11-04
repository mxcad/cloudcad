///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 运行时配置页「配置列表取值 + 草稿/保存 + 搜索分组 + 折叠/定位 + 统计」核心面。
 *
 * 从原 god-hook（useRuntimeConfig）拆出（评审候选 2）：面板类职责已在
 * `useConfigChannel` / `useModeSwitch` / `useResetCategory` / `useConfigHistory`，
 * 本 hook 只保留列表核心。对外经 `useRuntimeConfig` 分组组合，页面消费分组切片。
 *
 * 编排依赖注入：保存/重置后需刷新通道状态（channel 的 refreshChannelStatuses），
 * 经 `deps.refreshChannelStatuses` 传入，避免本 hook 反向依赖 channel。
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
} from '@/api-sdk';
import { useNotification } from '@/contexts/NotificationContext';
import { usePermission } from '@/hooks/usePermission';
import { SystemPermission } from '@/constants/permissions';
import { getErrorMessage, handleError } from '@/utils/errorHandler';
import { queryKeys } from '@/lib/queryKeys';
import { t } from '@/languages';
import {
  CATEGORY_ORDER,
  buildSubgroupSections,
  toConfigItems,
  configItemId,
  getCategoryLabel,
  getCategoryIcon,
} from '../meta';
import type {
  ConfigGroup,
  ConfigItem,
  DependencyStatus,
} from '../types';
import { defaultDraftOf, toSubmitValue, prettyJson } from '../validate';
import type { DraftValue } from '../validate';

export interface RuntimeConfigStats {
  total: number;
  /** 后端标记的已修改项（区别于安装默认行） */
  modified: number;
  /** 环境变量已注入、优先级低于运行时配置的项 */
  envDriven: number;
  /** 当前页面尚未提交的草稿数 */
  pendingSave: number;
  /**
   * 被安全模式管理的项数（声明了 profile 目标值的键）。
   * 其中多数属 advanced 档、默认隐藏，页面列表里看不到——这个计数是给
   * 管理员的「模式实际管住了多少项」锚点。
   */
  modeManaged: number;
}

export interface UseConfigListReturn {
  configs: ConfigItem[];
  /** key → 配置项：预览接口只返回 key，展示中文说明时据此取 description */
  configsByKey: Map<string, ConfigItem>;
  /**
   * 开关依赖状态（检查手段②）：key → 该开关每个依赖项的满足情况。
   * 满足与否按依赖项的**当前生效值**判定，页面据此渲染「依赖项 + 满足/不满足」。
   */
  dependencyStatus: Map<string, DependencyStatus[]>;
  groups: ConfigGroup[];
  loading: boolean;
  configsError: string | null;
  drafts: Record<string, DraftValue>;
  fieldErrors: Record<string, string>;
  saving: Set<string>;
  collapsed: Set<string>;
  keyword: string;
  onlyModified: boolean;
  /** 默认收起的高级项条数（工具栏文案用） */
  advancedCount: number;
  showAdvanced: boolean;
  secretVisible: Set<string>;
  canManageConfig: boolean;
  setKeyword: (keyword: string) => void;
  setOnlyModified: (onlyModified: boolean) => void;
  setShowAdvanced: (showAdvanced: boolean) => void;
  toggleCollapsed: (category: string) => void;
  setAllCollapsed: (collapsed: boolean) => void;
  /** 待高亮的配置项 key：通道缺失键点击定位后短暂闪烁，提示位置 */
  highlightKey: string | null;
  /** 定位到指定配置项（通道缺失键清单的跳转入口） */
  focusConfigItem: (key: string) => void;
  draftOf: (item: ConfigItem) => DraftValue;
  isDirty: (item: ConfigItem) => boolean;
  handleDraftChange: (key: string, value: DraftValue) => void;
  handleFormatJson: (key: string) => void;
  handleSave: (key: string) => Promise<boolean>;
  handleReset: (key: string) => Promise<void>;
  toggleSecretVisibility: (key: string) => void;
  retryFetch: () => Promise<void>;
  // ---- 编排辅助（mode 应用 / 分类重置后调用） ----
  /** 清空指定键的草稿与就地错误 */
  clearKeys: (keys: string[]) => void;
  /** 清空某分类所有项的草稿与就地错误 */
  clearCategory: (category: string) => void;
  /** 静默刷新配置列表（不切全页 loading） */
  refetchSilent: () => Promise<void>;
  /** 保存/重置公开配置后刷新公开配置缓存 */
  invalidatePublicCache: (isPublic: boolean) => Promise<void>;
  /** 通道状态刷新（编排注入，见 deps） */
  refreshChannelStatuses: () => Promise<void>;
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

export function useConfigList(deps: {
  /** 保存/重置后刷新通道状态（channel 的 refreshChannelStatuses） */
  refreshChannelStatuses: () => Promise<void>;
}): UseConfigListReturn {
  const { showToast, showConfirm } = useNotification();
  const { hasPermission } = usePermission();
  const queryClient = useQueryClient();
  const { refreshChannelStatuses } = deps;

  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  /** 待定位的配置项（seq 递增保证连续点击同一键也能重新触发滚动） */
  const [focusRequest, setFocusRequest] = useState<{
    key: string;
    seq: number;
  } | null>(null);
  /** 正在高亮闪烁的配置项 key（定位落点后短暂提示位置） */
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [onlyModified, setOnlyModified] = useState(false);
  /** 高级项默认收起：这类项（各接口限流阈值、压缩级别、文件锁参数）需要理解系统内部才敢改；备份/告警/清理等运维基线属 admin 档，默认展开 */
  const [showAdvanced, setShowAdvanced] = useState(false);
  /** 已展开显示的遮罩值（input.secret 项默认隐藏） */
  const [secretVisible, setSecretVisible] = useState<Set<string>>(new Set());
  /** 首次拉取失败时的错误文案；非空时页面渲染错误态而非「暂无配置项」 */
  const [configsError, setConfigsError] = useState<string | null>(null);

  const canManageConfig = hasPermission(SystemPermission.SYSTEM_CONFIG_WRITE);

  /**
   * 保存/重置公开配置项后刷新公开配置缓存：公开配置的前端消费者
   *（上传限制、VIP 导出门控、品牌与客服信息）读的是聚合后的 public 响应，
   * 不清缓存会让同会话内的改动不生效。按 isPublic 判定而非硬编码键名——
   * 否则 15 个公开项（mailEnabled / supportEmail / collaborationDomains …）
   * 改完仍显旧值。
   */
  const invalidatePublicCache = useCallback(
    async (isPublic: boolean) => {
      if (!isPublic) return;
      await queryClient.invalidateQueries({
        queryKey: queryKeys.runtimeConfig.public,
      });
    },
    [queryClient]
  );

  /**
   * 拉取配置列表。`silent` 用于保存/重置后的刷新：静默模式下不切全页 loading，
   * 否则用户刚保存一条配置，整页会闪成「正在加载配置...」并丢失滚位。
   * 首次加载与重试走非静默模式，由页面渲染 loading / 错误态。
   */
  const fetchConfigs = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) {
        setLoading(true);
        setConfigsError(null);
      }
      try {
        const result = await runtimeConfigControllerGetAllConfigs({
          throwOnError: true,
        });
        // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出
        setConfigs(toConfigItems(result.data));
      } catch (error: unknown) {
        // 失败不能伪装成「暂无配置项」：首次加载失败给错误态，静默刷新只 toast
        const message = getErrorMessage(error) || t('获取配置失败');
        handleError(error, t('获取配置失败'));
        showToast(message, 'error');
        if (!silent) setConfigsError(message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    void fetchConfigs();
  }, [fetchConfigs]);

  const configsByKey = useMemo(
    () => new Map(configs.map((item) => [item.key, item])),
    [configs]
  );

  /** 开关依赖状态：声明了 requires 的键，逐项判定依赖项当前生效值是否为 true */
  const dependencyStatus = useMemo(() => {
    const map = new Map<string, DependencyStatus[]>();
    for (const item of configs) {
      if (!item.requires?.length) continue;
      map.set(
        item.key,
        item.requires.map((depKey) => {
          const dep = configsByKey.get(depKey);
          return {
            key: depKey,
            label: dep?.description || depKey,
            satisfied: dep?.value === true,
          };
        })
      );
    }
    return map;
  }, [configs, configsByKey]);

  // ---- 派生：分组 ----

  /** 搜索 + 只看已修改 + 高级项开关 → 按分类分组（分类顺序固定，已修改项组内置顶） */
  const groups: ConfigGroup[] = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const matched = configs.filter((item) => {
      if (onlyModified && !item.isModified) return false;
      // 关键（搜索）时不过滤档位：藏起来的高级项也要能被搜出来
      if (!q && !showAdvanced && item.tier === 'advanced') return false;
      if (!q) return true;
      const categoryLabel = getCategoryLabel(item.category);
      return (
        item.key.toLowerCase().includes(q) ||
        (item.description ?? '').toLowerCase().includes(q) ||
        categoryLabel.toLowerCase().includes(q) ||
        (item.impact ?? '').toLowerCase().includes(q)
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
        label: getCategoryLabel(category) || category,
        icon: getCategoryIcon(category),
        items,
        subgroups: buildSubgroupSections(category, items),
        modifiedCount: items.filter((i) => i.isModified).length,
      };
    });
  }, [configs, keyword, onlyModified, showAdvanced]);

  const advancedCount = useMemo(
    () => configs.filter((c) => c.tier === 'advanced').length,
    [configs]
  );

  // ---- 草稿 ----

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
          throwOnError: true,
          path: { key },
          body: { val: outcome.value as never },
        });
        // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
        // 否则保存失败仍会弹「配置已保存」
        showToast(t('配置已保存'), 'success');
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        await fetchConfigs({ silent: true });
        await invalidatePublicCache(item.isPublic);
        // 通道配置项变更会使验证记录失效，刷新通道区块状态
        await refreshChannelStatuses();
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
      invalidatePublicCache,
      refreshChannelStatuses,
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
            '该项由系统预置为「{env}」，恢复出厂后仍由它生效，不会变成出厂默认值「{def}」。',
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
          throwOnError: true,
          path: { key },
        });
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
        await fetchConfigs({ silent: true });
        await invalidatePublicCache(item.isPublic);
        // 通道配置项重置会使验证记录失效，刷新通道区块状态
        await refreshChannelStatuses();
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
      invalidatePublicCache,
      refreshChannelStatuses,
    ]
  );

  // ---- UI：折叠 / 定位 ----

  const toggleCollapsed = useCallback((category: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  /**
   * 定位到指定配置项：通道缺失键清单的跳转入口。
   * 目标项可能被搜索关键词、只看已修改、高级项收起、分类折叠挡住，
   * 先把这些挡住的条件清掉再发定位请求——滚动与高亮由下方 effect 在
   * DOM 更新后执行。
   */
  const focusConfigItem = useCallback(
    (key: string) => {
      const item = configsByKey.get(key);
      if (!item) return;
      if (keyword.trim()) setKeyword('');
      if (onlyModified) setOnlyModified(false);
      if (item.tier === 'advanced' && !showAdvanced) setShowAdvanced(true);
      if (collapsed.has(item.category)) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(item.category);
          return next;
        });
      }
      setFocusRequest((prev) => ({ key, seq: (prev?.seq ?? 0) + 1 }));
    },
    [configsByKey, keyword, onlyModified, showAdvanced, collapsed]
  );

  /** 定位生效：滚动到配置项并短暂高亮（seq 变化即重新定位） */
  useEffect(() => {
    if (!focusRequest) return;
    const key = focusRequest.key;
    setHighlightKey(key);
    document.getElementById(configItemId(key))?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    const timer = setTimeout(() => setHighlightKey(null), 2400);
    return () => clearTimeout(timer);
  }, [focusRequest]);

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

  // ---- 编排辅助 ----

  /** 清空指定键的草稿 + 全部就地错误（mode 应用语义，与原 handleModeApplied 一致） */
  const clearKeys = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const key of keys) delete next[key];
      return next;
    });
    setFieldErrors({});
  }, []);

  /** 清空某分类所有项的草稿 + 全部就地错误（分类重置语义，与原 handleResetCategory 一致） */
  const clearCategory = useCallback(
    (category: string) => {
      const keys = configs
        .filter((item) => item.category === category)
        .map((item) => item.key);
      clearKeys(keys);
    },
    [configs, clearKeys]
  );

  const refetchSilent = useCallback(async () => {
    await fetchConfigs({ silent: true });
  }, [fetchConfigs]);

  return {
    configs,
    configsByKey,
    dependencyStatus,
    groups,
    loading,
    configsError,
    drafts,
    fieldErrors,
    saving,
    collapsed,
    keyword,
    onlyModified,
    advancedCount,
    showAdvanced,
    secretVisible,
    canManageConfig,
    setKeyword,
    setOnlyModified,
    setShowAdvanced,
    toggleCollapsed,
    setAllCollapsed,
    highlightKey,
    focusConfigItem,
    draftOf,
    isDirty,
    handleDraftChange,
    handleFormatJson,
    handleSave,
    handleReset,
    toggleSecretVisibility,
    retryFetch: () => fetchConfigs(),
    clearKeys,
    clearCategory,
    refetchSilent,
    invalidatePublicCache,
    refreshChannelStatuses,
  };
}
