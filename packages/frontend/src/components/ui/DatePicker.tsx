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
  /**
   * 开启时分选择（本地时区，秒/毫秒归零）。默认 false = 只选日期并回填当天
   * 23:59:59.999，现有消费方的 expiresAt > now 判定语义不变。
   */
  withTime?: boolean;
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

/** 解析 ISO 字符串为本地日期；withTime=false 时归零到当天 0 点 */
function toLocalDate(
  value: string | undefined,
  withTime = false
): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (!withTime)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    0,
    0
  );
}

/** 本地日期 → ISO（保留时分，秒/毫秒归零，满足后端 @IsISO8601） */
function toIsoStartOfMinute(date: Date): string {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    0,
    0
  ).toISOString();
}

/** 面板时/分输入框的草稿值（保留空串，允许边输入边删） */
type TimeDraft = { hour: string; minute: string };

/** 从已提交值回填时/分草稿；未选择或非法时按 00:00 起步 */
function readTimeDraft(value: string | undefined): TimeDraft {
  const date = value ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime()))
    return { hour: '00', minute: '00' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return { hour: pad(date.getHours()), minute: pad(date.getMinutes()) };
}

/** 空串按 0 处理，越界夹到区间内；解析结果不回流输入框 */
function parseDraftPart(raw: string, max: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), max);
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
  withTime = false,
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
  const selected = useMemo(
    () => toLocalDate(value, withTime),
    [value, withTime]
  );
  // 时/分草稿按原文保存（不让 "1" 被格式化回 "01" 打断连续输入），
  // 只在已提交值变化时重新对齐
  const [timeDraft, setTimeDraft] = useState<TimeDraft>(() =>
    readTimeDraft(value)
  );
  useEffect(() => {
    setTimeDraft(readTimeDraft(value));
  }, [value]);
  const selectedTime = useMemo(
    () => ({
      hour: parseDraftPart(timeDraft.hour, 23),
      minute: parseDraftPart(timeDraft.minute, 59),
    }),
    [timeDraft]
  );
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
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      }).format(selected)
    : '';

  // 日历只给日期，时/分沿用面板草稿（换一天不丢已填时刻）
  const handleSelect = (date: Date | undefined) => {
    if (date) {
      if (withTime) {
        onChange(
          toIsoStartOfMinute(
            new Date(
              date.getFullYear(),
              date.getMonth(),
              date.getDate(),
              selectedTime.hour,
              selectedTime.minute,
              0,
              0
            )
          )
        );
      } else {
        onChange(toIsoEndOfDay(date));
      }
    }
    setOpen(false);
  };

  const handleToday = () => {
    const now = new Date();
    onChange(withTime ? toIsoStartOfMinute(now) : toIsoEndOfDay(now));
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
        {withTime && (
          <div className="flex items-center gap-1 px-2 pt-2">
            <Input
              type="number"
              size="xs"
              wrapperClassName="w-14"
              min={0}
              max={23}
              value={timeDraft.hour}
              placeholder="00"
              aria-label={t('小时')}
              onChange={(event) =>
                setTimeDraft((prev) => ({ ...prev, hour: event.target.value }))
              }
            />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {t('时')}
            </span>
            <Input
              type="number"
              size="xs"
              wrapperClassName="w-14"
              min={0}
              max={59}
              value={timeDraft.minute}
              placeholder="00"
              aria-label={t('分钟')}
              onChange={(event) =>
                setTimeDraft((prev) => ({
                  ...prev,
                  minute: event.target.value,
                }))
              }
            />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {t('分')}
            </span>
          </div>
        )}
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
