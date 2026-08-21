import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import {
  DayButton,
  DayPicker,
  getDefaultClassNames,
  useDayPicker,
  type NavProps,
} from 'react-day-picker';

import { cn } from '@/lib/utils';
import { t } from '@/languages';

const navButtonClassName =
  'flex select-none items-center justify-center rounded-md p-0 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] aria-disabled:opacity-50 disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * 导航工具条：左右各一组「上/下一年」+「上/下个月」按钮
 * （rdp 默认仅逐月导航，跨年需连点十余次；叠加年切换按钮）
 */
function CalendarNav({
  onPreviousClick,
  onNextClick,
  previousMonth,
  nextMonth,
  ...navProps
}: NavProps) {
  const { months, goToMonth } = useDayPicker();
  const displayMonth = months[0]?.date;
  const goToYear = (offset: number) => {
    if (!displayMonth) return;
    goToMonth(
      new Date(displayMonth.getFullYear(), displayMonth.getMonth() + offset, 1)
    );
  };
  return (
    <nav {...navProps}>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={t('上一年')}
          onClick={() => goToYear(-12)}
          className={navButtonClassName}
        >
          <ChevronsLeft size={16} />
        </button>
        <button
          type="button"
          aria-label={t('上个月')}
          disabled={!previousMonth}
          onClick={onPreviousClick}
          className={navButtonClassName}
        >
          <ChevronLeft size={16} />
        </button>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={t('下个月')}
          disabled={!nextMonth}
          onClick={onNextClick}
          className={navButtonClassName}
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          aria-label={t('下一年')}
          onClick={() => goToYear(12)}
          className={navButtonClassName}
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </nav>
  );
}

/**
 * Calendar 日历组件（shadcn/ui 拉取改造，基于 react-day-picker v9）
 *
 * 适配清单：
 * - 主题定制走 rdp CSS 变量（src/styles/calendar.css）：品牌色/尺寸/圆角
 * - shadcn Button 依赖替换为原生 button；selected 填充用 data-* 类
 * - 全局样式依赖：style.css 已由 src/styles/calendar.css 引入
 * - Nav 自定义：叠加年切换按钮（CalendarNav）
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('group/calendar w-fit p-3', className)}
      captionLayout={captionLayout}
      formatters={formatters}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn(
          'relative flex flex-col gap-4 md:flex-row',
          defaultClassNames.months
        ),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
          defaultClassNames.nav
        ),
        button_previous: cn(
          'flex select-none items-center justify-center rounded-md p-0 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] aria-disabled:opacity-50',
          defaultClassNames.button_previous
        ),
        button_next: cn(
          'flex select-none items-center justify-center rounded-md p-0 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] aria-disabled:opacity-50',
          defaultClassNames.button_next
        ),
        month_caption: cn(
          'flex w-full items-center justify-center text-[var(--text-primary)]',
          defaultClassNames.month_caption
        ),
        caption_label: cn(
          'select-none text-sm font-medium',
          defaultClassNames.caption_label
        ),
        month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'flex-1 select-none text-[var(--text-tertiary)]',
          defaultClassNames.weekday
        ),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        day: cn(
          'group/day relative aspect-square h-full w-full select-none p-0 text-center',
          defaultClassNames.day
        ),
        outside: cn('text-[var(--text-tertiary)]', defaultClassNames.outside),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          );
        },
        DayButton: CalendarDayButton,
        Nav: CalendarNav,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        'flex aspect-square h-auto w-full items-center justify-center rounded-md font-normal leading-none text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)]',
        'data-[selected-single=true]:bg-[var(--primary-500)] data-[selected-single=true]:text-white data-[selected-single=true]:hover:bg-[var(--primary-600)]',
        'data-[range-start=true]:bg-[var(--primary-500)] data-[range-start=true]:text-white data-[range-end=true]:bg-[var(--primary-500)] data-[range-end=true]:text-white data-[range-middle=true]:bg-[var(--bg-tertiary)]',
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  );
}

export { Calendar };
