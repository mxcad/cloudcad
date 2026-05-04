import { Tooltip, SimpleTooltip } from './Tooltip';
import { Button } from './Button';
import { HelpCircle, Info, Settings, Bell } from 'lucide-react';

/**
 * Tooltip 组件使用示例
 *
 * 展示了 Tooltip 组件的各种用法
 */

export function TooltipExamples() {
  return (
    <div className="space-y-8 p-8">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">Tooltip 组件示例</h2>

      {/* 示例 1：基本用法 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--text-secondary)]">1. 基本用法</h3>
        <div className="flex gap-4">
          <Tooltip content="这是一个提示">
            <Button variant="primary">悬停查看提示</Button>
          </Tooltip>
        </div>
      </section>

      {/* 示例 2：不同位置 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--text-secondary)]">2. 不同位置</h3>
        <div className="flex gap-4 items-center">
          <Tooltip content="上方提示" position="top">
            <Button variant="secondary" icon={HelpCircle}>
              上方
            </Button>
          </Tooltip>

          <Tooltip content="下方提示" position="bottom">
            <Button variant="secondary" icon={Info}>
              下方
            </Button>
          </Tooltip>

          <Tooltip content="左侧提示" position="left">
            <Button variant="secondary" icon={Settings}>
              左侧
            </Button>
          </Tooltip>

          <Tooltip content="右侧提示" position="right">
            <Button variant="secondary" icon={Bell}>
              右侧
            </Button>
          </Tooltip>
        </div>
      </section>

      {/* 示例 3：不同触发方式 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--text-secondary)]">3. 不同触发方式</h3>
        <div className="flex gap-4">
          <Tooltip content="悬停触发（默认）" trigger="hover">
            <Button variant="outline">悬停触发</Button>
          </Tooltip>

          <Tooltip content="点击触发" trigger="click">
            <Button variant="outline">点击触发</Button>
          </Tooltip>

          <Tooltip content="聚焦触发" trigger="focus">
            <input
              type="text"
              placeholder="聚焦触发"
              className="input-theme px-4 py-2 rounded-lg"
            />
          </Tooltip>
        </div>
      </section>

      {/* 示例 4：自定义延迟 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--text-secondary)]">4. 自定义延迟</h3>
        <div className="flex gap-4">
          <Tooltip content="立即显示" delay={0} hideDelay={0}>
            <Button variant="ghost">无延迟</Button>
          </Tooltip>

          <Tooltip content="延迟 500ms 显示" delay={500}>
            <Button variant="ghost">延迟 500ms</Button>
          </Tooltip>

          <Tooltip content="延迟 1秒 显示" delay={1000}>
            <Button variant="ghost">延迟 1秒</Button>
          </Tooltip>
        </div>
      </section>

      {/* 示例 5：禁用状态 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--text-secondary)]">5. 禁用状态</h3>
        <div className="flex gap-4">
          <Tooltip content="这个提示不会显示" disabled>
            <Button variant="secondary">禁用 Tooltip</Button>
          </Tooltip>
        </div>
      </section>

      {/* 示例 6：长文本内容 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--text-secondary)]">6. 长文本内容</h3>
        <div className="flex gap-4">
          <Tooltip
            content="这是一个很长的提示文本，用于演示 Tooltip 如何处理多行内容。它会自动换行并保持美观的显示效果。"
            maxWidth={250}
          >
            <Button variant="outline">长文本提示</Button>
          </Tooltip>
        </div>
      </section>

      {/* 示例 7：自定义样式 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--text-secondary)]">7. 自定义样式</h3>
        <div className="flex gap-4">
          <Tooltip
            content="自定义样式的提示"
            className="!bg-gradient-to-r !from-purple-500 !to-pink-500 !text-white"
            arrow={false}
          >
            <Button variant="secondary">自定义样式</Button>
          </Tooltip>
        </div>
      </section>

      {/* 示例 8：SimpleTooltip 简化用法 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--text-secondary)]">8. SimpleTooltip 简化用法</h3>
        <div className="flex gap-4">
          <SimpleTooltip
            content="简化的 Tooltip 用法"
            element={<span className="text-[var(--text-primary)] cursor-help">悬停查看</span>}
          />

          <SimpleTooltip
            content="图标提示示例"
            element={<HelpCircle className="w-5 h-5 text-[var(--text-tertiary)]" />}
            position="right"
          />
        </div>
      </section>

      {/* 示例 9：图标按钮提示 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--text-secondary)]">9. 图标按钮提示</h3>
        <div className="flex gap-2">
          <Tooltip content="设置">
            <button className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors">
              <Settings className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
          </Tooltip>

          <Tooltip content="通知">
            <button className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors">
              <Bell className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
          </Tooltip>

          <Tooltip content="帮助">
            <button className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors">
              <HelpCircle className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
          </Tooltip>
        </div>
      </section>
    </div>
  );
}

export default TooltipExamples;
