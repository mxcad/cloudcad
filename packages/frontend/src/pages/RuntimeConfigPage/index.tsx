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

import React from "react";
import {
  Search,
  Settings,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useTheme } from "@/contexts/ThemeContext";
import { Input, Checkbox, Button } from "@/components/ui";

import { useRuntimeConfig } from "./hooks/useRuntimeConfig";
import { PageHeader } from "./PageHeader";
import { ConfigCard } from "./ConfigCard";
import type { RowActions } from "./ConfigCard";
import { ChannelStatusCard } from "./ChannelStatusCard";
import { CoordinateLogCard } from "./CoordinateLogCard";
import { ConfigHistoryPanel } from "./ConfigHistoryPanel";
import { ResetCategoryModal } from "./ResetCategoryModal";
import { ModeSwitchModal } from "./ModeSwitchModal";
import { useRuntimeConfig as usePublicRuntimeConfig } from "@/contexts/RuntimeConfigContext";
import styles from "./RuntimeConfigPage.module.css";
import { t } from "@/languages";

export const RuntimeConfigPage: React.FC = () => {
  useDocumentTitle(t("运行时配置"));
  const { isDark } = useTheme();

  const { list, channel, mode, reset, history, stats } = useRuntimeConfig();
  const { config: publicConfig } = usePublicRuntimeConfig();

  const allCollapsed =
    list.groups.length > 0 &&
    list.groups.every((g) => list.collapsed.has(g.category));
  const historyItem = history.historyKey
    ? (list.configs.find((c) => c.key === history.historyKey) ?? null)
    : null;
  const resetPreviewGroup = reset.resetPreviewCategory
    ? (list.groups.find((g) => g.category === reset.resetPreviewCategory) ??
      null)
    : null;

  /** 传给每个配置行的回调集合（hook 返回值的行级子集） */
  const rowActions: RowActions = {
    drafts: list.drafts,
    saving: list.saving,
    canManageConfig: list.canManageConfig,
    secretVisible: list.secretVisible,
    fieldErrors: list.fieldErrors,
    dependencyStatus: list.dependencyStatus,
    highlightKey: list.highlightKey,
    draftOf: list.draftOf,
    isDirty: list.isDirty,
    onDraftChange: list.handleDraftChange,
    onFormatJson: list.handleFormatJson,
    onToggleSecret: list.toggleSecretVisibility,
    onSave: list.handleSave,
    onReset: list.handleReset,
    onShowHistory: history.openHistory,
  };

  if (list.loading) {
    return (
      <div className={styles.configPage} data-theme={isDark ? "dark" : "light"}>
        <div className={styles.loadingState} data-testid="rc-loading">
          <div className={styles.loadingSpinner} />
          <p>{t("正在加载配置...")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.configPage} data-theme={isDark ? "dark" : "light"}>
      <PageHeader
        stats={stats}
        canManageConfig={list.canManageConfig}
        currentMode={publicConfig.securityMode}
        onModeSwitch={(target) => {
          void mode.requestModeSwitch(target);
        }}
      />

      {/* 工具栏：关键词搜索 + 只看已修改 + 全部折叠/展开 */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Input
            leftIcon={Search}
            size="md"
            value={list.keyword}
            onChange={(e) => list.setKeyword(e.target.value)}
            placeholder={t("搜索配置项（名称 / 分类 / 影响说明）")}
            data-testid="rc-search"
          />
        </div>
        <Checkbox
          size="sm"
          checked={list.onlyModified}
          onChange={(e) => list.setOnlyModified(e.target.checked)}
          label={t("只看已修改的")}
          data-testid="rc-only-modified"
        />
        {/* 高级项默认收起，需要改并发/超时/缓存 TTL 这类内部参数时手动展开 */}
        {list.advancedCount > 0 && (
          <Checkbox
            size="sm"
            checked={list.showAdvanced}
            onChange={(e) => list.setShowAdvanced(e.target.checked)}
            label={t("显示高级项（{n} 项）", {
              n: String(list.advancedCount),
            })}
            data-testid="rc-show-advanced"
          />
        )}
        <div className={styles.toolbarSpacer} />
        <Button
          variant="ghost"
          size="sm"
          icon={allCollapsed ? ChevronDown : ChevronUp}
          onClick={() => list.setAllCollapsed(!allCollapsed)}
          disabled={list.groups.length === 0}
          data-testid="rc-toggle-all"
        >
          {allCollapsed ? t("展开全部") : t("折叠全部")}
        </Button>
      </div>

      {/* 通道状态：配置完整度 + 验证状态 + 测试发送（ADR-0082 #496） */}
      {channel.channelStatuses.length > 0 && (
        <ChannelStatusCard
          channels={channel.channelStatuses}
          canManageConfig={list.canManageConfig}
          testing={channel.channelTesting}
          testTarget={channel.channelTestTarget}
          testRecipient={channel.channelTestRecipient}
          testResult={channel.channelTestResult}
          onOpenTest={channel.openChannelTest}
          onCloseTest={channel.closeChannelTest}
          onRecipientChange={channel.setChannelTestRecipient}
          onConfirmTest={channel.confirmChannelTest}
          configsByKey={list.configsByKey}
          onFocusConfig={list.focusConfigItem}
        />
      )}

      {/* 配置分组卡片 */}
      {list.groups.length > 0 && (
        <div className={styles.configGrid}>
          {list.groups.map((group) => (
            <ConfigCard
              key={group.category}
              group={group}
              collapsed={list.collapsed.has(group.category)}
              savingCategory={reset.savingCategory}
              onToggleCollapsed={() => list.toggleCollapsed(group.category)}
              onRequestResetCategory={() =>
                reset.requestResetCategory(group.category)
              }
              actions={rowActions}
              extraContent={
                group.category === "collaboration" ? (
                  <CoordinateLogCard canManage={list.canManageConfig} />
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {/* 搜索无结果 */}
      {list.groups.length === 0 && list.configs.length > 0 && (
        <div className={styles.emptyState} data-testid="rc-empty-state">
          <div className={styles.emptyIcon}>
            <SlidersHorizontal size={48} />
          </div>
          <h3>{t("没有匹配的配置项")}</h3>
          <p>{t("试试其他关键词，或取消「只看已修改的」筛选")}</p>
        </div>
      )}

      {/* 首次拉取失败：给出错误态与重试，而不是把失败伪装成「暂无配置项」 */}
      {list.configsError && list.groups.length === 0 && (
        <div className={styles.emptyState} data-testid="rc-error-state">
          <div className={styles.emptyIcon}>
            <Settings size={48} />
          </div>
          <h3>{t("获取配置失败")}</h3>
          <p>{list.configsError}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void list.retryFetch()}
            data-testid="rc-retry"
          >
            {t("重试")}
          </Button>
        </div>
      )}

      {/* 后端未返回任何配置 */}
      {list.groups.length === 0 &&
        list.configs.length === 0 &&
        !list.configsError && (
          <div className={styles.emptyState} data-testid="rc-empty-state">
            <div className={styles.emptyIcon}>
              <Settings size={48} />
            </div>
            <h3>{t("暂无配置项")}</h3>
            <p>{t("系统尚未配置任何运行时参数")}</p>
          </div>
        )}

      {/* 修改历史 */}
      <ConfigHistoryPanel
        item={historyItem}
        entries={history.history}
        loading={history.historyLoading}
        error={history.historyError}
        onClose={history.closeHistory}
      />

      {/* 分类级批量恢复默认预览 */}
      <ResetCategoryModal
        group={resetPreviewGroup}
        saving={reset.savingCategory}
        onConfirm={reset.confirmResetCategory}
        onCancel={reset.cancelResetCategory}
      />

      {/* 安全模式切换：先预览将改动的项，再确认应用 */}
      <ModeSwitchModal
        target={mode.modeSwitchTarget}
        previewing={mode.modePreviewing}
        preview={mode.modePreview}
        configsByKey={list.configsByKey}
        saving={mode.modeSaving}
        onConfirm={mode.confirmModeSwitch}
        onCancel={mode.cancelModeSwitch}
      />
    </div>
  );
};

export default RuntimeConfigPage;
