///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 运行时配置页面 - CloudCAD
 *
 * 客户运维视角：类型感知输入 + 前置校验 + 来源/差异标注 + 生效状态提示 +
 * 危险项二次确认 + 搜索分组 + 单键/分类恢复默认 + 修改历史。
 * 档位（user/admin/advanced）只做展示分层，不做权限门控——
 * 能进本页的人已持有 SYSTEM_CONFIG_READ/WRITE。
 */

import React from 'react';
import {
  Search,
  Settings,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTheme } from '@/contexts/ThemeContext';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { useRuntimeConfig } from './hooks/useRuntimeConfig';
import { PageHeader } from './PageHeader';
import { ConfigCard } from './ConfigCard';
import type { RowActions } from './ConfigCard';
import { ConfigHistoryPanel } from './ConfigHistoryPanel';
import { ResetCategoryModal } from './ResetCategoryModal';
import styles from './RuntimeConfigPage.module.css';
import { t } from '@/languages';

export const RuntimeConfigPage: React.FC = () => {
  useDocumentTitle(t('运行时配置'));
  const { isDark } = useTheme();

  const rc = useRuntimeConfig();

  const allCollapsed =
    rc.groups.length > 0 &&
    rc.groups.every((g) => rc.collapsed.has(g.category));
  const historyItem = rc.historyKey
    ? (rc.configs.find((c) => c.key === rc.historyKey) ?? null)
    : null;
  const resetPreviewGroup = rc.resetPreviewCategory
    ? (rc.groups.find((g) => g.category === rc.resetPreviewCategory) ?? null)
    : null;

  /** 传给每个配置行的回调集合（hook 返回值的行级子集） */
  const rowActions: RowActions = {
    drafts: rc.drafts,
    saving: rc.saving,
    canManageConfig: rc.canManageConfig,
    secretVisible: rc.secretVisible,
    fieldErrors: rc.fieldErrors,
    draftOf: rc.draftOf,
    isDirty: rc.isDirty,
    onDraftChange: rc.handleDraftChange,
    onFormatJson: rc.handleFormatJson,
    onToggleSecret: rc.toggleSecretVisibility,
    onSave: rc.handleSave,
    onReset: rc.handleReset,
    onShowHistory: rc.openHistory,
  };

  if (rc.loading) {
    return (
      <div className={styles.configPage} data-theme={isDark ? 'dark' : 'light'}>
        <div className={styles.loadingState} data-testid="rc-loading">
          <div className={styles.loadingSpinner} />
          <p>{t('正在加载配置...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.configPage} data-theme={isDark ? 'dark' : 'light'}>
      <PageHeader stats={rc.stats} canManageConfig={rc.canManageConfig} />

      {/* 工具栏：关键词搜索 + 只看已修改 + 全部折叠/展开 */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Input
            leftIcon={Search}
            size="md"
            value={rc.keyword}
            onChange={(e) => rc.setKeyword(e.target.value)}
            placeholder={t('搜索配置项（键名 / 说明 / 分类）')}
            data-testid="rc-search"
          />
        </div>
        <Checkbox
          size="sm"
          checked={rc.onlyModified}
          onChange={(e) => rc.setOnlyModified(e.target.checked)}
          label={t('只看已修改的')}
          data-testid="rc-only-modified"
        />
        <div className={styles.toolbarSpacer} />
        <Button
          variant="ghost"
          size="sm"
          icon={allCollapsed ? ChevronDown : ChevronUp}
          onClick={() => rc.setAllCollapsed(!allCollapsed)}
          disabled={rc.groups.length === 0}
          data-testid="rc-toggle-all"
        >
          {allCollapsed ? t('展开全部') : t('折叠全部')}
        </Button>
      </div>

      {/* 配置分组卡片 */}
      {rc.groups.length > 0 && (
        <div className={styles.configGrid}>
          {rc.groups.map((group) => (
            <ConfigCard
              key={group.category}
              group={group}
              collapsed={rc.collapsed.has(group.category)}
              savingCategory={rc.savingCategory}
              onToggleCollapsed={() => rc.toggleCollapsed(group.category)}
              onRequestResetCategory={() =>
                rc.requestResetCategory(group.category)
              }
              actions={rowActions}
            />
          ))}
        </div>
      )}

      {/* 搜索无结果 */}
      {rc.groups.length === 0 && rc.configs.length > 0 && (
        <div className={styles.emptyState} data-testid="rc-empty-state">
          <div className={styles.emptyIcon}>
            <SlidersHorizontal size={48} />
          </div>
          <h3>{t('没有匹配的配置项')}</h3>
          <p>{t('试试其他关键词，或取消「只看已修改的」筛选')}</p>
        </div>
      )}

      {/* 后端未返回任何配置 */}
      {rc.groups.length === 0 && rc.configs.length === 0 && (
        <div className={styles.emptyState} data-testid="rc-empty-state">
          <div className={styles.emptyIcon}>
            <Settings size={48} />
          </div>
          <h3>{t('暂无配置项')}</h3>
          <p>{t('系统尚未配置任何运行时参数')}</p>
        </div>
      )}

      {/* 修改历史 */}
      <ConfigHistoryPanel
        item={historyItem}
        entries={rc.history}
        loading={rc.historyLoading}
        error={rc.historyError}
        onClose={rc.closeHistory}
      />

      {/* 分类级批量恢复默认预览 */}
      <ResetCategoryModal
        group={resetPreviewGroup}
        saving={rc.savingCategory}
        onConfirm={rc.confirmResetCategory}
        onCancel={rc.cancelResetCategory}
      />
    </div>
  );
};

export default RuntimeConfigPage;
