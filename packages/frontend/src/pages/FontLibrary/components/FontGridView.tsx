import { Download, Trash2, Upload, Type, FolderOpen } from 'lucide-react';
import type { MutableRefObject } from 'react';
import { Button, Tag, Checkbox } from '@/components/ui';
import { FileNameText } from '../../../components/ui/TruncateText';
import { formatFileSize } from '../../../components/ui/FileSize';
import { getFontIcon, getFontTypeVariant } from '../fontTypeConfig';
import { t } from '@/languages';
import type { FontInfo } from '../../../types/filesystem';

interface FontGridViewProps {
  fonts: FontInfo[];
  loading: boolean;
  selectedFonts: Set<string>;
  canUploadFonts: boolean;
  canDownloadFonts: boolean;
  canDeleteFonts: boolean;
  hasActiveFilters: boolean;
  handleSelect: (
    fontName: string,
    ctrlKey?: boolean,
    shiftKey?: boolean
  ) => void;
  handleDelete: (fontName: string) => Promise<void>;
  handleDownload: (fontName: string) => Promise<void>;
  openUploadModal: () => void;
  formatDate: (date: string | Date) => string;
  /** 框选刚结束标记（页面层 useRubberBandSelection 注入，防止拖框后的 click 误单选） */
  rubberBandJustEndedRef: MutableRefObject<boolean>;
}

export const FontGridView: React.FC<FontGridViewProps> = ({
  fonts,
  loading,
  selectedFonts,
  canUploadFonts,
  canDownloadFonts,
  canDeleteFonts,
  hasActiveFilters,
  handleSelect,
  handleDelete,
  handleDownload,
  openUploadModal,
  formatDate,
  rubberBandJustEndedRef,
}) => {
  // 骨架屏已移除：加载期间渲染空白，数据就绪后直接显示内容
  if (loading) {
    return null;
  }

  if (fonts.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div className="col-span-full py-16 text-center">
          <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-bg-tertiary flex items-center justify-center">
            <div className="relative">
              <FolderOpen size={40} className="text-text-muted" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--primary-100)] flex items-center justify-center">
                <Type size={14} className="text-[var(--primary-600)]" />
              </div>
            </div>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-1">
            {t('暂无字体')}
          </h3>
          <p className="text-text-tertiary text-sm mb-4">
            {hasActiveFilters
              ? t('没有找到匹配的字体')
              : t('当前位置没有字体文件')}
          </p>
          {canUploadFonts && !hasActiveFilters && (
            <Button icon={Upload} onClick={openUploadModal}>
              {t('上传第一个字体')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {fonts.map((font, index) => {
        const typeInfo = getFontIcon(font.extension);
        const isSelected = selectedFonts.has(font.name);
        const IconComponent = typeInfo.Icon;
        return (
          <div
            key={font.name}
            data-node-id={font.name}
            // 不用 card-theme 基类：其 unlayered 的 :hover（shadow-lg + 上浮 +
            // 边框加深）按 CSS 级联层规则恒赢 @layer 里的 Tailwind utilities，
            // hover 选中卡片时会把选中态 ring 覆盖掉。改显式 Tailwind 类，
            // hover 效果只作用于未选中卡片（同 FileItem：选中态 hover 保持稳定）
            className={`group relative cursor-pointer rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-6 transition-all duration-300 animate-fade-in ${
              isSelected
                ? 'ring-2 ring-[var(--primary-500)]'
                : 'hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5'
            }`}
            style={{ animationDelay: `${index * 50}ms` }}
            onClick={(e) => {
              // 框选刚结束时的 click 误触发会清掉框选结果，直接跳过（同 FileItem）
              if (rubberBandJustEndedRef.current) {
                rubberBandJustEndedRef.current = false;
                return;
              }
              // checkbox/操作按钮的点击不触发行选择
              if ((e.target as HTMLElement).closest('input, button, a')) return;
              handleSelect(font.name, e.ctrlKey || e.metaKey, e.shiftKey);
            }}
          >
            {/* Checkbox 内层 input 为 sr-only，点击可见方框需自行拦截冒泡，
                否则会触发卡片级选择（原裸 input 由 closest('input') 排除）
                选中时恒显示，未选中 hover 卡片时淡入 */}
            <div
              className={`absolute top-3 left-3 z-10 transition-opacity ${
                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                size="sm"
                checked={isSelected}
                onChange={() => handleSelect(font.name, true)}
              />
            </div>

            <div
              className={`absolute top-3 right-3 z-10 flex gap-1 transition-opacity ${
                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
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

            <div className="pt-8 pb-4 text-center">
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor: `${typeInfo.color}15`,
                }}
              >
                <IconComponent size={32} style={{ color: typeInfo.color }} />
              </div>
              <h3
                className="font-medium text-text-primary mb-1 px-4"
                title={font.name}
              >
                <FileNameText className="justify-center">
                  {font.name}
                </FileNameText>
              </h3>
              <div className="flex items-center justify-center gap-3 text-xs text-text-tertiary">
                <Tag variant={getFontTypeVariant(font.extension)}>
                  {typeInfo.label}
                </Tag>
                <span>{formatFileSize(font.size)}</span>
              </div>
              <p className="text-xs text-text-muted mt-3">
                {formatDate(font.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
