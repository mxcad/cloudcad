///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { enUS, ko, zhCN, zhTW, type Locale } from 'date-fns/locale';
import { useVoerkaI18n } from '@voerkai18n/react';
import { i18nScope, t } from '@/languages';
import { Button } from './Button';
import { Input } from './Input';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface DatePickerProps {
  /** ISO 8601 字符串；undefined = 未选择 */
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** ISO 8601 字符串；早于此日期的日期不可选（本地日期粒度，当天可选） */
  minDate?: string;
  /** ISO 8601 字符串；晚于此日期的日期不可选（本地日期粒度，当天可选） */
  maxDate?: string;
  /** 受控打开状态（不传则内部管理；多面板互斥场景传 open + onOpenChange） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const LOCALES: Record<string, Locale> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'en-US': enUS,
  'ko-KR': ko,
};

/** 解析 ISO 字符串为本地日期（时分秒归零）；非法返回 undefined */
function toLocalDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 本地日期 → ISO（当天 23:59:59.999，与后端 expiresAt > now 判定对齐） */
function toIsoEndOfDay(date: Date): string {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  ).toISOString();
}

/**
 * DatePicker 日期选择组件（shadcn/ui Calendar + Popover 拉取改造）
 *
 * - 点击输入框弹出日历面板，选中日期回填当天 23:59:59.999 的 ISO
 * - 「今天」快捷选择，「清除」清空（配合 IP 黑名单 = 永久封禁）
 * - 传入 minDate 时早于该日期的日期禁用（当天仍可选）
 * - 周表头 / 月份标题跟随当前语言（date-fns locale）
 * - 面板互斥依赖 Radix Popover 的外部点击关闭（点击其他 trigger 即"外部点击"）
 */
export function DatePicker({
  value,
  onChange,
  placeholder = t('选择日期'),
  disabled = false,
  size = 'md',
  minDate,
  maxDate,
  open: controlledOpen,
  onOpenChange,
}: DatePickerProps) {
  const { activeLanguage } = useVoerkaI18n(i18nScope);
  const [internalOpen, setInternalOpen] = useState(false);
  const triggerRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // 受控（open 传入）时由调用方管理打开状态；否则内部管理（兼容旧用法）
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange]
  );
  const selected = useMemo(() => toLocalDate(value), [value]);
  const minLocalDate = useMemo(
    () => (minDate ? toLocalDate(minDate) : undefined),
    [minDate]
  );
  const maxLocalDate = useMemo(
    () => (maxDate ? toLocalDate(maxDate) : undefined),
    [maxDate]
  );
  // 显式构造 matcher：{ before, after } 同时出现会被当作闭区间
  // （rdp 的 isDateInterval 只看 key 存在性），缺边时单边禁用
  const disabledMatcher = useMemo(() => {
    if (minLocalDate && maxLocalDate)
      return { before: minLocalDate, after: maxLocalDate };
    if (minLocalDate) return { before: minLocalDate };
    if (maxLocalDate) return { after: maxLocalDate };
    return undefined;
  }, [minLocalDate, maxLocalDate]);
  const locale = LOCALES[activeLanguage] ?? enUS;

  // 点击输入框/面板以外的区域自动关闭（兜底监听，不依赖 Radix 内部实现）
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (contentRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, setOpen]);

  // 「今天」在 min/max 边界之外时禁用（避免选中被禁日期）
  const todayLocal = new Date();
  todayLocal.setHours(0, 0, 0, 0);
  const todayDisabled =
    (minLocalDate !== undefined && todayLocal < minLocalDate) ||
    (maxLocalDate !== undefined && todayLocal > maxLocalDate);

  const displayValue = selected
    ? new Intl.DateTimeFormat(activeLanguage, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(selected)
    : '';

  const handleSelect = (date: Date | undefined) => {
    if (date) onChange(toIsoEndOfDay(date));
    setOpen(false);
  };

  const handleToday = () => {
    onChange(toIsoEndOfDay(new Date()));
    setOpen(false);
  };

  const handleClear = () => {
    onChange(undefined);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          ref={triggerRef}
          // Radix PopoverTrigger 按按钮语义注入 type="button"，但按钮型 input
          // 不渲染 placeholder（HTML 规范）；显式覆盖回 text 恢复占位提示
          type="text"
          value={displayValue}
          placeholder={placeholder}
          readOnly
          disabled={disabled}
          size={size}
          rightIcon={CalendarIcon}
        />
      </PopoverTrigger>
      <PopoverContent ref={contentRef} className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          locale={locale}
          initialFocus
          disabled={disabledMatcher}
          formatters={{
            formatWeekdayName: (date) =>
              new Intl.DateTimeFormat(activeLanguage, {
                weekday: 'narrow',
              }).format(date),
          }}
        />
        <div className="flex justify-between border-t border-[var(--border-default)] p-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={handleToday}
            disabled={todayDisabled}
          >
            {t('今天')}
          </Button>
          <Button variant="ghost" size="xs" onClick={handleClear}>
            {t('清除')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default DatePicker;
