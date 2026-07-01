import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { ChevronRightIcon, FolderIcon } from './FileIcons';
import { BreadcrumbItem } from '../types/filesystem';
import { TruncateText } from './ui/TruncateText';
import { Tooltip } from './ui/Tooltip';
import { Menu } from './ui/Menu';
import { Input } from './ui/Input';
import { ArrowLeft, Pencil, Check, X } from 'lucide-react';
import { t } from '@/languages';

interface BreadcrumbNavigationProps {
  breadcrumbs: BreadcrumbItem[];
  onNavigate: (crumb: BreadcrumbItem, element: HTMLButtonElement) => void;
  /** 展现模式 */
  variant?: 'default' | 'library' | 'panel';
  /** 是否可编辑（default 模式下生效） */
  editable?: boolean;
  /** 返回按钮 */
  onBack?: () => void;
  /** 返回项目列表 */
  onBackToProjects?: () => void;
  /** 路径提交回调（编辑模式） */
  onPathSubmit?: (path: string) => void;
}

export const BreadcrumbNavigation: React.FC<BreadcrumbNavigationProps> = ({
  breadcrumbs,
  onNavigate,
  variant = 'default',
  editable = false,
  onBack,
  onBackToProjects,
  onPathSubmit,
}) => {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const editTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const [visibleCount, setVisibleCount] = useState(0);
  const [needsCollapse, setNeedsCollapse] = useState(false);

  const pathString = useMemo(
    () => breadcrumbs.map((b) => b.name).join(' / '),
    [breadcrumbs],
  );

  const startEditing = useCallback(() => {
    setEditValue(pathString);
    setIsEditing(true);
    editTimeoutRef.current = setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 50);
  }, [pathString]);

  useEffect(() => {
    return () => clearTimeout(editTimeoutRef.current);
  }, []);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditValue('');
  }, []);

  const submitEditing = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== pathString) {
      onPathSubmit?.(trimmed);
    }
    setIsEditing(false);
  }, [editValue, pathString, onPathSubmit]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        submitEditing();
      } else if (e.key === 'Escape') {
        cancelEditing();
      }
    },
    [submitEditing, cancelEditing],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || variant !== 'panel') return;

    const calculateVisible = () => {
      const containerWidth = container.clientWidth;
      const reservedWidth = 220;
      const availableWidth = containerWidth - reservedWidth;

      const items = container.querySelectorAll('[data-breadcrumb-item]');
      let totalWidth = 0;
      let count = 0;

      items.forEach((item, index) => {
        const width = (item as HTMLElement).offsetWidth;
        const itemTotalWidth = width + (index > 0 ? 16 : 0);
        if (totalWidth + itemTotalWidth <= availableWidth) {
          totalWidth += itemTotalWidth;
          count++;
        }
      });

      const minVisible = Math.min(1, breadcrumbs.length);
      const finalCount = Math.max(minVisible, count);
      setVisibleCount(finalCount);
      setNeedsCollapse(finalCount < breadcrumbs.length);
    };

    calculateVisible();
    const ro = new ResizeObserver(calculateVisible);
    ro.observe(container);
    window.addEventListener('resize', calculateVisible);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calculateVisible);
    };
  }, [breadcrumbs, variant]);

  const collapsedBreadcrumb = useMemo(() => {
    if (!needsCollapse || breadcrumbs.length <= 1) {
      return { visible: breadcrumbs, collapsed: [] as BreadcrumbItem[] };
    }

    const visibleCount_ = Math.max(2, visibleCount);
    if (visibleCount_ >= breadcrumbs.length) {
      return { visible: breadcrumbs, collapsed: [] as BreadcrumbItem[] };
    }

    return {
      visible: [breadcrumbs[0], ...breadcrumbs.slice(-(visibleCount_ - 1))],
      collapsed: breadcrumbs.slice(1, -(visibleCount_ - 1)),
    };
  }, [breadcrumbs, needsCollapse, visibleCount]);

  if (breadcrumbs.length === 0 && !isEditing) {
    return null;
  }

  if (isEditing && editable) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          ref={editInputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={submitEditing}
          size="md"
          wrapperClassName="flex-1"
          className="min-w-[200px]"
        />
        <Tooltip content={t("确认")}>
          <button
            onClick={submitEditing}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--primary-600)' }}
          >
            <Check size={16} />
          </button>
        </Tooltip>
        <Tooltip content={t("取消")}>
          <button
            onClick={cancelEditing}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X size={16} />
          </button>
        </Tooltip>
      </div>
    );
  }

  const separator = (idx: number, isLast: boolean) =>
    isLast || idx === 0 ? null : <span className="text-slate-400 mx-1 select-none">/</span>;

  const renderCrumb = (crumb: BreadcrumbItem, index: number, isLast: boolean) => (
    <React.Fragment key={crumb.id}>
      {separator(index, isLast)}
      <button
        ref={(el) => { itemRefs.current[index] = el; }}
        data-breadcrumb-item
        onClick={(e) => {
          if (!isLast) onNavigate(crumb, e.currentTarget);
        }}
        className={`flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg transition-all duration-200 whitespace-nowrap
          ${
            isLast
              ? variant === 'panel'
                ? 'text-slate-900 font-semibold cursor-default'
                : 'text-slate-900 font-medium cursor-default'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer'
          }
        `}
        disabled={isLast}
        title={crumb.name}
      >
        {variant !== 'panel' && index === 0 && crumb.isRoot ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="flex-shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4"
          >
            <path d="M32 6L10 22V54C10 56.2091 11.7909 58 14 58H50C52.2091 58 54 56.2091 54 54V22L32 6Z" fill="#0891D1" stroke="#06B6D4" strokeWidth="2" />
            <rect x="16" y="28" width="32" height="24" rx="1" fill="white" fillOpacity="0.9" />
            <rect x="26" y="38" width="12" height="14" rx="1" fill="#06B6D4" />
            <rect x="20" y="32" width="8" height="6" rx="1" fill="#0891D1" />
            <rect x="36" y="32" width="8" height="6" rx="1" fill="#0891D1" />
          </svg>
        ) : (
          <FolderIcon size={14} className="flex-shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
        )}
        <TruncateText
          maxWidth={variant === 'panel' ? 100 : 80}
          smMaxWidth={variant === 'panel' ? 120 : 120}
          mdMaxWidth={variant === 'panel' ? 150 : 150}
          lgMaxWidth={variant === 'panel' ? 180 : 200}
          className="text-slate-900"
        >
          {crumb.name}
        </TruncateText>
      </button>
    </React.Fragment>
  );

  return (
    <div ref={containerRef} className="flex items-center gap-0.5 text-xs sm:text-sm whitespace-nowrap">
      {variant === 'panel' && (
        <>
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
            title={t("返回上一级")}
          >
            <ArrowLeft size={14} />
            <span>{t("返回")}</span>
          </button>
          <ChevronRightIcon size={12} className="text-slate-400 flex-shrink-0 mx-0.5" />
          <button
            onClick={onBackToProjects}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all whitespace-nowrap"
          >
            {t("项目列表")}
          </button>
          {breadcrumbs.length > 0 && (
            <ChevronRightIcon size={12} className="text-slate-400 flex-shrink-0 mx-0.5" />
          )}
        </>
      )}

      {variant === 'panel' && needsCollapse && collapsedBreadcrumb.visible[0] ? (
        <>
          {renderCrumb(collapsedBreadcrumb.visible[0], 0, false)}
          {separator(1, false)}
          {collapsedBreadcrumb.collapsed.length > 0 && (
            <Menu>
              <Menu.Trigger>
                <button
                  data-breadcrumb-collapse-btn
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                >
                  ...
                </button>
              </Menu.Trigger>
              <Menu.Content align="start" side="bottom" sideOffset={4}>
                {collapsedBreadcrumb.collapsed.map((item) => (
                  <Menu.Item
                    key={item.id}
                    onClick={() => onNavigate(item, document.createElement('button'))}
                  >
                    {item.name}
                  </Menu.Item>
                ))}
              </Menu.Content>
            </Menu>
          )}
          {separator(1, false)}
          {collapsedBreadcrumb.visible.slice(1).map((item, idx) => {
            if (!item) return null;
            const isLast = idx === collapsedBreadcrumb.visible.length - 2;
            return renderCrumb(item, breadcrumbs.length - collapsedBreadcrumb.visible.length + 1 + idx, isLast);
          })}
        </>
      ) : variant === 'library' ? (
        breadcrumbs.map((crumb, index) => renderCrumb(crumb, index, index === breadcrumbs.length - 1))
      ) : (
        <>
          {breadcrumbs.map((crumb, index) => renderCrumb(crumb, index, index === breadcrumbs.length - 1))}
          {editable && breadcrumbs.length > 0 && (
            <Tooltip content={t("编辑路径")}>
              <button
                onClick={startEditing}
                className="ml-1 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all flex-shrink-0"
              >
                <Pencil size={14} />
              </button>
            </Tooltip>
          )}
        </>
      )}
    </div>
  );
};
