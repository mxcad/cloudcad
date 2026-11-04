import React, { useRef } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { t } from "@/languages";
import { Button, Tag } from "@/components/ui";
import { Pagination, DescriptionText } from "@/components/ui";

import { useScrollPagination } from "@/hooks/common/useScrollPagination";
import type { AlertRecordDto } from "@/api-sdk";
import type { AlertHistoryState } from "../hooks/useAlertHistory";
import { formatDateTimeWithSeconds } from "@/utils/dateUtils";
import styles from "../SystemMonitorPage.module.css";

export interface AlertHistoryTabProps {
  state: AlertHistoryState;
  page: number;
  pageSize: number;
  /** 滚动分页累积后的展示列表（父页 useAccumulatedPagination 合并）；未传回退 state.data.items */
  viewItems?: AlertRecordDto[];
  /** 滚动分页（累积模型）翻页回调；提供后启用滚动分页 */
  onScrollPageChange?: (page: number, direction: "prev" | "next") => void;
  /** 列表第一项所属页码（prev 触发防重复加载已存在页） */
  minLoadedPage?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/**
 * 系统监控中心「告警历史」Tab（#248）
 * 分页列表 + 状态标签 + 空态；open 状态告警高亮（warning 黄 / critical 红）
 * 滚动分页默认开启（提供 onScrollPageChange 即启用，向下加载更多/向上加载前页）
 */
export const AlertHistoryTab: React.FC<AlertHistoryTabProps> = ({
  state,
  page,
  pageSize,
  viewItems,
  onScrollPageChange,
  minLoadedPage,
  onPageChange,
  onPageSizeChange,
}) => {
  const { data, loading, error, refreshCountdown, refresh } = state;

  const items = viewItems ?? data?.items ?? [];
  const pagination = data?.pagination ?? {
    page: 1,
    limit: pageSize,
    total: 0,
    totalPages: 0,
  };

  // 滚动分页（累积模型）：向下加载更多 / 向上加载前页，与按钮分页并存
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const { visiblePage, jumpTo, showBottomLoader, showTopLoader, isLastPage } =
    useScrollPagination({
      containerRef: tableScrollRef,
      itemContainerRef: tableBodyRef,
      itemsLength: items.length,
      pageSize,
      currentPage: page,
      totalPages: pagination.totalPages,
      loading,
      enabled: !!onScrollPageChange,
      minLoadedPage,
      onPageChange: (pg, direction) => onScrollPageChange?.(pg, direction),
    });

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t("告警历史")}</h2>
          <div className={styles.sectionHeaderRight}>
            <span className={styles.refreshCountdown}>
              {t("{seconds}s 后自动刷新", {
                seconds: String(refreshCountdown),
              })}
            </span>
            <Button
              variant="primary"
              className={styles.refreshButton}
              onClick={refresh}
              loading={loading}
              icon={RefreshCw}
            >
              {loading ? t("刷新中...") : t("立即刷新")}
            </Button>
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.tableContainer}>
          <div ref={tableScrollRef} className={styles.tableScroll}>
            {showTopLoader && (
              <div
                className="flex items-center justify-center gap-2 py-2 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                <Loader2 size={14} className="animate-spin" />
                <span>{t("加载中...")}</span>
              </div>
            )}
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("时间")}</th>
                  <th>{t("级别")}</th>
                  <th>{t("来源")}</th>
                  <th>{t("消息")}</th>
                  <th>{t("状态")}</th>
                </tr>
              </thead>
              <tbody ref={tableBodyRef}>
                {loading && !items.length ? (
                  <tr>
                    <td colSpan={5} className={styles.tableEmpty}>
                      <span className={styles.loadingText}>
                        {t("正在获取数据")}
                      </span>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.tableEmpty}>
                      {t("暂无告警记录")}
                    </td>
                  </tr>
                ) : (
                  items.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} />
                  ))
                )}
              </tbody>
            </table>
            {showBottomLoader ? (
              <div
                className="flex items-center justify-center gap-2 py-2 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                <Loader2 size={14} className="animate-spin" />
                <span>{t("加载中...")}</span>
              </div>
            ) : isLastPage ? (
              <div
                className="flex items-center justify-center gap-2 py-2 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                <span>{t("已经是最后一页")}</span>
              </div>
            ) : null}
          </div>

          {pagination.totalPages > 1 && (
            <Pagination
              meta={{ ...pagination, page: visiblePage }}
              onPageChange={(p) => {
                jumpTo(p);
                onPageChange(p);
              }}
              showSizeChanger
              onPageSizeChange={onPageSizeChange}
              pageSizeOptions={[30, 50, 100]}
            />
          )}
        </div>
      </section>
    </>
  );
};

const AlertRow: React.FC<{ alert: AlertRecordDto }> = ({ alert }) => {
  const isOpen = alert.status === "OPEN";
  return (
    <tr
      data-status={alert.status}
      data-level={alert.level}
      className={isOpen ? styles.alertRowOpen : undefined}
    >
      <td>{formatDateTimeWithSeconds(alert.createdAt)}</td>
      <td>
        {alert.level === "P0" ? (
          <Tag variant="error">{t("严重")}</Tag>
        ) : alert.level === "P1" ? (
          <Tag variant="warning">{t("警告")}</Tag>
        ) : (
          <Tag variant="neutral">{t("提示")}</Tag>
        )}
      </td>
      <td>
        <span className={styles.alertSource}>{alert.source}</span>
      </td>
      <td>
        <DescriptionText maxWidth={40}>{alert.message || "-"}</DescriptionText>
      </td>
      <td>
        {isOpen ? (
          <Tag variant={alert.level === "P0" ? "error" : "warning"} dot>
            {t("未解决")}
          </Tag>
        ) : (
          <Tag variant="neutral">{t("已解决")}</Tag>
        )}
      </td>
    </tr>
  );
};
