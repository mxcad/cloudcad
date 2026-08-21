import React from 'react';
import { CheckSquare, X, Clipboard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { t } from '@/languages';

export interface BatchActionItem {
  key: string;
  /** 按钮文字（可选：省略即 icon-only + tooltip 模式） */
  label?: React.ReactNode;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  /** icon-only 模式按钮提示 */
  tooltip?: string;
  onClick: () => void;
}

/** 剪贴板状态（文件系统/资源库：粘贴 + 数量角标 + 清空） */
export interface BatchClipboardState {
  items: string[];
  canPaste: boolean;
  onPaste: () => void;
  onClear: () => void;
  /** 粘贴按钮被禁用原因（如跨项目转移策略禁止；disabled 时 hover 提示） */
  pasteDisabledReason?: string | null;
}

export interface BatchActionBarProps {
  /** 选中数量（显示条件由调用方控制：> 0 才渲染） */
  count: number;
  /** 取消选择 */
  onClear: () => void;
  /** 批量动作按钮组 */
  actions: BatchActionItem[];
  /** 可选全选 Checkbox（grid 视图无表头全选时使用） */
  selectAllChecked?: boolean;
  onSelectAll?: () => void;
  /** 可选剪贴板区（粘贴/清空，非选中态的剪贴板模式） */
  clipboard?: BatchClipboardState;
  /** 自定义计数文案（默认「已选 N 项」） */
  label?: (count: number) => React.ReactNode;
  className?: string;
}

/**
 * BatchActionBar - 批量操作条（ADR-0052）
 *
 * 全站统一的多选操作栏：胶囊形态（rounded-full + shadow），
 * CheckSquare + 数字角标 + 计数文字 + 分割线 + 批量动作按钮组 + 取消选择。
 * 批量动作一律循环调用现有 SDK 单条接口（统计成功/失败计数 Toast 汇总），
 * 本组件不关心动作实现。移动端（sm 以下）只显示图标，文字隐藏。
 */
export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  count,
  onClear,
  actions,
  selectAllChecked,
  onSelectAll,
  clipboard,
  label,
  className = '',
}) => (
  <div
    className={`inline-flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-3 rounded-full shadow-2xl ${className}`}
    style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
    }}
  >
    {selectAllChecked !== undefined && onSelectAll && (
      <Checkbox size="sm" checked={selectAllChecked} onChange={onSelectAll} />
    )}

    {count > 0 && (
      <>
        <div className="relative flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0">
          <CheckSquare
            size={20}
            className="sm:hidden"
            style={{ color: 'var(--primary-500)' }}
          />
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full sm:hidden"
            style={{
              background: 'var(--primary-500)',
              color: 'var(--text-inverse)',
            }}
          >
            {count > 99 ? '99+' : count}
          </span>
        </div>
        <span
          className="hidden sm:inline text-sm font-semibold whitespace-nowrap"
          style={{ color: 'var(--text-primary)' }}
        >
          {label ? label(count) : t('已选 {count} 项', { count: String(count) })}
        </span>
        <div
          className="hidden sm:block w-px h-4"
          style={{ background: 'var(--border-default)' }}
        />
      </>
    )}

    <div className="flex items-center gap-2 sm:gap-3">
      {/* 动作按钮仅在有选中项时显示（剪贴板模式 count=0：无选中项，剪切/复制/删除无意义） */}
      {count > 0 &&
        actions.map((action) => (
          <Button
            key={action.key}
            variant={action.variant ?? 'secondary'}
            size="sm"
            icon={action.icon}
            tooltip={action.tooltip}
            disabled={action.disabled}
            loading={action.loading}
            onClick={action.onClick}
          >
            {action.label !== undefined && (
              <span className="hidden sm:inline">{action.label}</span>
            )}
          </Button>
        ))}

      {clipboard && (
        <div
          className="flex items-center gap-0 rounded-lg"
          style={{
            border: '1px solid var(--border-default)',
            overflow: 'hidden',
          }}
        >
          <span
            className="inline-flex"
            title={
              clipboard.items.length > 0 && !clipboard.canPaste
                ? (clipboard.pasteDisabledReason ?? t('粘贴'))
                : undefined
            }
          >
          <Button
            variant="secondary"
            icon={Clipboard}
            onClick={clipboard.onPaste}
            disabled={clipboard.items.length === 0 || !clipboard.canPaste}
            style={{
              color: 'var(--text-secondary)',
              border: 'none',
              borderRadius: 0,
            }}
            className="relative pl-3 pr-2"
          >
            <span className="hidden sm:inline">{t('粘贴')}</span>
            {clipboard.items.length > 0 && (
              <span
                className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold leading-none"
                style={{
                  background: 'var(--primary-500)',
                  color: 'var(--text-inverse)',
                }}
              >
                {clipboard.items.length}
              </span>
            )}
          </Button>
          </span>
          {clipboard.items.length > 0 && (
            <Button
              variant="secondary"
              onClick={clipboard.onClear}
              style={{
                color: 'var(--text-muted)',
                border: 'none',
                borderRadius: 0,
                padding: '0 8px',
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </Button>
          )}
        </div>
      )}
    </div>

    <Button
      variant="secondary"
      size="sm"
      icon={X}
      onClick={onClear}
      style={{ color: 'var(--text-muted)' }}
    >
      <span className="hidden sm:inline">{t('取消选择')}</span>
    </Button>
  </div>
);
