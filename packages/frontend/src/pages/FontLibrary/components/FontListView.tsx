import { Download, Trash2, FolderOpen, Type } from 'lucide-react';
import { Button, Tag } from '@/components/ui';
import { FileNameText } from '../../../components/ui/TruncateText';
import { formatFileSize } from '../../../components/ui/FileSize';
import { getFontIcon, getFontTypeVariant } from '../fontTypeConfig';
import { SelectableTable } from '@/components/common/SelectableTable';
import { t } from '@/languages';
import type { FontInfo } from '../../../types/filesystem';
import styles from './FontListView.module.css';

interface FontListViewProps {
  fonts: FontInfo[];
  loading: boolean;
  selectedFonts: Set<string>;
  canDownloadFonts: boolean;
  canDeleteFonts: boolean;
  handleSelect: (
    fontName: string,
    ctrlKey?: boolean,
    shiftKey?: boolean
  ) => void;
  handleSelectAll: () => void;
  handleDelete: (fontName: string) => Promise<void>;
  handleDownload: (fontName: string) => Promise<void>;
  /** 框选注入（拖拽多选结果），透传给 SelectableTable 启用列表框选 */
  selectMany: (fontNames: string[]) => void;
  formatDate: (date: string | Date) => string;
  /** 底部悬浮操作栏（透传给 SelectableTable，滚动容器内 sticky 吸底） */
  bottomBar?: React.ReactNode;
}

/**
 * 字体列表视图（表格形态，ADR-0052：SelectableTable 统一容器承载
 * 框选/全选/行选择机制；grid 视图仍由页面层容器承载框选）
 */
export const FontListView: React.FC<FontListViewProps> = ({
  fonts,
  loading,
  selectedFonts,
  canDownloadFonts,
  canDeleteFonts,
  handleSelect,
  handleSelectAll,
  handleDelete,
  handleDownload,
  selectMany,
  formatDate,
  bottomBar,
}) => (
  <div className="h-full flex flex-col min-h-0">
    <div className={styles.tableContainer}>
      <SelectableTable<FontInfo>
        rows={fonts}
        rowId={(font) => font.name}
        selectedIds={selectedFonts}
        loading={loading}
        bottomBar={bottomBar}
        tableClassName={styles.table}
        selectedRowClassName={styles.rowSelected}
    loadingView={
      <div className="py-12 text-center">
        <div className="flex items-center justify-center gap-3 text-text-tertiary">
          <div className="animate-spin w-5 h-5 border-2 border-[var(--primary-500)] border-t-transparent rounded-full" />
          {t('加载中...')}
        </div>
      </div>
    }
    emptyView={
      <div className="py-16 text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-bg-tertiary flex items-center justify-center">
          <div className="relative">
            <FolderOpen size={32} className="text-text-muted" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[var(--primary-100)] flex items-center justify-center">
              <Type size={10} className="text-[var(--primary-600)]" />
            </div>
          </div>
        </div>
        <p className="text-text-tertiary">{t('暂无数据')}</p>
      </div>
    }
    onToggleSelect={handleSelect}
    rowClassName={() =>
      'cursor-pointer transition-colors hover:bg-[var(--bg-tertiary)]/50'
    }
    onToggleSelectAll={handleSelectAll}
    onRubberBandSelect={selectMany}
    renderHeader={() => (
      <>
        <th>{t('字体文件')}</th>
        <th className="w-24">{t('格式')}</th>
        <th className="w-28">{t('大小')}</th>
        <th className="w-36">{t('修改时间')}</th>
        <th className="w-24 text-right">{t('操作')}</th>
      </>
    )}
    renderRow={(font) => {
      const typeInfo = getFontIcon(font.extension);
      const IconComponent = typeInfo.Icon;
      return (
        <>
          <td>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${typeInfo.color}15` }}
              >
                <IconComponent size={20} style={{ color: typeInfo.color }} />
              </div>
              <div>
                <p className="font-medium text-text-primary">
                  <FileNameText>{font.name}</FileNameText>
                </p>
                <p className="text-xs text-text-muted">
                  {font.creator || t('系统管理员')}
                </p>
              </div>
            </div>
          </td>
          <td>
            <Tag variant={getFontTypeVariant(font.extension)}>
              {typeInfo.label}
            </Tag>
          </td>
          <td className="text-text-secondary">{formatFileSize(font.size)}</td>
          <td className="text-text-tertiary text-sm">
            {formatDate(font.createdAt)}
          </td>
          <td className="text-right">
            <div
              className="flex items-center justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {canDownloadFonts && (
                <Button
                  variant="secondary"
                  icon={Download}
                  onClick={() => handleDownload(font.name)}
                  tooltip={t('下载')}
                />
              )}
              {canDeleteFonts && (
                <Button
                  variant="secondary"
                  icon={Trash2}
                  onClick={() => handleDelete(font.name)}
                  tooltip={t('删除')}
                />
              )}
            </div>
          </td>
        </>
      );
    }}
      />
    </div>
  </div>
);
