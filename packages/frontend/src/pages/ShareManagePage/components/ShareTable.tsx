import React from "react";
import {
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Edit3,
  ArrowUp,
  ArrowDown,
  Image,
} from "lucide-react";
import { Button, Tag } from "@/components/ui";

import { SelectableTable } from "@/components/common/SelectableTable";
import { formatExpiryDate, isExpired } from "@/constants/share";
import { t } from "@/languages";
import styles from "../ShareManagePage.module.css";
import { getSortableColumns } from "../constants";
import type { SortConfig, SortField } from "../types";
import type { ShareListItemDto } from "@/api-sdk";

interface ShareTableProps {
  items: ShareListItemDto[];
  selectedTokens: Set<string>;
  sort: SortConfig;
  copiedToken: string | null;
  showPagination: boolean;
  paginationMeta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onToggleSelect: (
    token: string,
    ctrlKey?: boolean,
    shiftKey?: boolean,
  ) => void;
  onToggleSelectAll: () => void;
  onRubberBandSelect?: (tokenIds: string[]) => void;
  onSort: (field: SortField) => void;
  onCopy: (linkUrl: string, token?: string) => void;
  onEditExpiry: (token: string, expiresAt: string | null) => void;
  onRevoke: (token: string) => void;
  /** 预览分享图片（打开 ShareDialog 自动预览，下载在预览弹框内） */
  onPreviewPoster: (item: ShareListItemDto) => void;
  onPageChange: (newPage: number) => void;
  /** 每页条数变化回调（切换后应重置页码并重新加载） */
  onPageSizeChange?: (pageSize: number) => void;
  /** 滚动分页（滚动加载；页脚跳页与滚动并存） */
  onScrollPageChange?: (page: number, direction: "prev" | "next") => void;
  /** 列表第一项所属页码（prev 触发防重复加载已存在页） */
  minLoadedPage?: number;
  /** 翻页/后台刷新失败信息（列表已有内容时显示为底部失败条） */
  loadError?: string | null;
  /** 失败条重试回调 */
  onRetryLoadMore?: () => void;
  loading?: boolean;
  /** 底部悬浮操作栏（透传给 SelectableTable，滚动容器内 sticky 吸底） */
  bottomBar?: React.ReactNode;
}

/**
 * 分享管理表格（ADR-0052：SelectableTable 统一容器承载框选/全选/行选择/分页机制）
 */
export const ShareTable: React.FC<ShareTableProps> = ({
  items,
  selectedTokens,
  sort,
  copiedToken,
  showPagination,
  paginationMeta,
  onToggleSelect,
  onToggleSelectAll,
  onRubberBandSelect,
  onSort,
  onCopy,
  onEditExpiry,
  onRevoke,
  onPreviewPoster,
  onPageChange,
  onPageSizeChange,
  onScrollPageChange,
  minLoadedPage,
  loadError,
  onRetryLoadMore,
  loading = false,
  bottomBar,
}) => {
  const renderSortIcon = (field: SortField) => {
    if (sort.field !== field) return null;
    return sort.order === "desc" ? (
      <ArrowDown size={10} />
    ) : (
      <ArrowUp size={10} />
    );
  };

  return (
    <div className={styles.tableContainer}>
      <SelectableTable<ShareListItemDto>
        rows={items}
        rowId={(item) => item.token}
        selectedIds={selectedTokens}
        bottomBar={bottomBar}
        paginationMeta={showPagination ? paginationMeta : null}
        onToggleSelect={onToggleSelect}
        onToggleSelectAll={onToggleSelectAll}
        onRubberBandSelect={onRubberBandSelect}
        onPageChange={onPageChange}
        showSizeChanger
        onPageSizeChange={onPageSizeChange}
        pageSizeOptions={[30, 50, 100]}
        onScrollPageChange={onScrollPageChange}
        minLoadedPage={minLoadedPage}
        loadError={loadError}
        onRetryLoadMore={onRetryLoadMore}
        loading={loading}
        selectedRowClassName={styles.rowSelected}
        renderHeader={() => (
          <>
            <th className="text-left">{t("文件")}</th>
            <th className="text-left">{t("链接")}</th>
            <th className="text-left">{t("状态")}</th>
            {getSortableColumns().map((col) => (
              <th
                key={col.field}
                className={`${styles.thSortable} text-left`}
                onClick={() => onSort(col.field)}
              >
                <span className={styles.thContent}>
                  {col.label}
                  <span className={styles.sortIcon}>
                    {renderSortIcon(col.field)}
                  </span>
                </span>
              </th>
            ))}
            <th className="text-left">{t("操作")}</th>
          </>
        )}
        renderRow={(item) => {
          const expired = isExpired(item.expiresAt as string | null);
          return (
            <>
              <td className={styles.tdFilename}>{t(item.fileName)}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <div className={styles.linkCell}>
                  <span className={styles.linkText}>
                    {item.url?.length > 25
                      ? item.url.slice(0, 25) + "..."
                      : item.url}
                  </span>
                  <button
                    onClick={() => onCopy(item.url, item.token)}
                    className={styles.copyBtn}
                    title={t("复制链接")}
                  >
                    {copiedToken === item.token ? (
                      <Check size={12} />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <Tag
                  variant={expired ? "neutral" : "success"}
                  size="xs"
                  onClick={() =>
                    onEditExpiry(item.token, item.expiresAt as string | null)
                  }
                >
                  {expired ? t("已过期") : t("有效")}
                </Tag>
              </td>
              <td className={styles.tdMeta}>
                {item.createdAt
                  ? new Date(item.createdAt).toLocaleDateString()
                  : "-"}
              </td>
              <td
                className={`${styles.tdMeta} ${styles.tdClickable}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditExpiry(item.token, item.expiresAt as string | null);
                }}
              >
                {formatExpiryDate(item.expiresAt as string | null)}
              </td>
              <td className={styles.tdMeta}>{item.usedCount}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <div className={styles.actionCell}>
                  <Button
                    variant="secondary"
                    size="xs"
                    icon={ExternalLink}
                    onClick={() => window.open(item.url, "_blank")}
                    tooltip={t("打开文件")}
                  />
                  <Button
                    variant="secondary"
                    size="xs"
                    icon={Edit3}
                    onClick={() =>
                      onEditExpiry(item.token, item.expiresAt as string | null)
                    }
                    tooltip={t("修改有效期")}
                  />
                  <Button
                    variant="secondary"
                    size="xs"
                    icon={Image}
                    onClick={() => onPreviewPoster(item)}
                    tooltip={t("预览分享图片")}
                  />
                  <Button
                    variant="secondary"
                    size="xs"
                    icon={Trash2}
                    onClick={() => onRevoke(item.token)}
                    tooltip={t("撤销分享")}
                    style={{ color: "var(--error)" }}
                  />
                </div>
              </td>
            </>
          );
        }}
      />
    </div>
  );
};
