import type { Command, CommandContext, CommandResult } from './types';

export class ToggleFileQueueCommand implements Command {
  readonly name = 'Mx_ToggleFileQueue';

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    try {
      // 动态 import：面板是 UI 组件（带 lucide 图标与 React hook），静态引入会把
      // 整块面板代码塞进 CAD 入口 chunk，违背 #471 的分包约束。
      const { toggleFileQueuePanel } = await import(
        '@/components/conversion-panel/ConversionPanel'
      );
      toggleFileQueuePanel();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}
