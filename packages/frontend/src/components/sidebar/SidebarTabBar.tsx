///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React, { useLayoutEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { Users } from "lucide-react";
import { LayoutDashboard } from "lucide-react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SidebarTab } from "../../types/sidebar";
import { Button, Tab, Tabs } from "../ui";
import { Tooltip } from "@/components/ui";
import { returnToCloudMapManagement } from "@/services/mxcadManager";
import { t } from "@/languages";
import styles from "./sidebar.module.css";

interface SidebarTabBarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onCloseClick: () => void;
  isExpanded?: boolean;
}

function getTabs(): {
  id: SidebarTab;
  label: string;
  icon: React.ElementType;
  isAction?: boolean;
}[] {
  return [
    {
      id: "project-management",
      label: t("项目管理"),
      icon: LayoutDashboard,
      isAction: true,
    },
    { id: "drawings", label: t("图纸"), icon: FileText },
    { id: "collaborate", label: t("实时协同"), icon: Users },
  ];
}

/**
 * 侧边栏 Tab 栏组件
 *
 * 设计特点：
 * - Pill 风格的 Tab 按钮，带渐变激活态
 * - 图标+文字组合，视觉层次清晰
 * - 精致的悬停和点击反馈
 * - 支持深色/亮色主题
 * - 装不下时仅显示图标（悬停出 tooltip），与图纸子级 tabs 行为一致
 */
export const SidebarTabBar: React.FC<SidebarTabBarProps> = ({
  activeTab,
  onTabChange,
  onCloseClick,
  isExpanded = true,
}) => {
  // 是否仅显示图标：标签文字装不下时为 true。用 ResizeObserver 检测真实溢出，
  // 相比固定宽度阈值能同时适配中/英文等多语言标签长度。
  const [compact, setCompact] = useState(false);
  const tabsWrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const wrap = tabsWrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;

    const update = () => {
      // 以「完整标签」测量层的宽度对比可视宽度，避免 compact 后自身收缩导致来回抖动
      setCompact(measure.scrollWidth > wrap.clientWidth + 1);
    };
    // 同步首测，避免初始一帧出现滚动条闪烁
    update();
    const ro = new ResizeObserver(update);
    // 同时观察包装与测量层：宽度拖拽（包装尺寸变）与内容变宽（测量层尺寸变，如语言切换/字体加载）都会触发重估
    ro.observe(wrap);
    ro.observe(measure);
    return () => ro.disconnect();
  }, []);

  const renderTabs = (withLabels: boolean) => (
    <Tabs className={!withLabels ? styles.tabBarTabsFill : ''}>
      {getTabs().map((tab) => (
        <Tab
          key={tab.id}
          active={tab.isAction ? false : activeTab === tab.id}
          tabVariant="primary"
          icon={tab.icon}
          onClick={() => {
            if (tab.isAction) {
              returnToCloudMapManagement();
            } else {
              onTabChange(tab.id);
            }
          }}
          title={withLabels ? tab.label : undefined}
          tooltip={compact && !withLabels ? tab.label : undefined}
          tooltipPosition="bottom"
          tooltipDelay={200}
        >
          {withLabels ? tab.label : undefined}
        </Tab>
      ))}
    </Tabs>
  );

  return (
    <div className={styles.tabBar}>
      <Tooltip
        content={isExpanded ? t("关闭侧边栏") : t("展开侧边栏")}
        position="bottom"
        delay={100}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={onCloseClick}
          aria-label={isExpanded ? t("关闭侧边栏") : t("展开侧边栏")}
          className={styles.tabBarButton}
        >
          {isExpanded ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}
        </Button>
      </Tooltip>
      <div ref={tabsWrapRef} className={styles.tabBarTabsWrap}>
        {renderTabs(!compact)}
        {/* 隐藏测量层：始终渲染完整标签，用于判断是否装不下（不参与布局、不可交互） */}
        <div ref={measureRef} className={styles.tabBarMeasure} aria-hidden>
          {renderTabs(true)}
        </div>
      </div>
      <div></div>
    </div>
  );
};
