import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

import { cn } from '@/lib/utils';
import { Z_LAYERS } from '@/constants/layers';

/**
 * Popover 弹出层（shadcn/ui 拉取改造）
 *
 * 适配清单：
 * - z-index：shadcn 默认 z-50 替换为 Z_LAYERS.POPUP（高于 Modal，供弹窗内使用）
 * - 主题：shadcn token（bg-popover/text-popover-foreground）替换为项目 CSS 变量
 * - 动画类（tailwindcss-animate）项目未装，已移除
 */
function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 outline-hidden',
          className
        )}
        style={{
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border-default)',
          boxShadow: 'var(--shadow-xl)',
          color: 'var(--text-primary)',
          zIndex: Z_LAYERS.POPUP,
        }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
