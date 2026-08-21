import type { CurrentFileInfo } from '../mxcadTypes';
import type {
  SaveFileFn,
  SavePermissionQuerier,
  SaveSdkHandles,
} from '../saveFile';

export interface CommandResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface CommandContext {
  fileName: string;
  fileInfo: CurrentFileInfo | null;
  saveDrawingToBlob(name: string): Promise<{
    blob: Blob;
    data: ArrayBuffer | Uint8Array;
    filename: string;
  }>;
  /** 保存深服务（单入口判别 node / library / saveAs，默认实现见 saveFile.ts） */
  saveFile: SaveFileFn;
  /** SDK 句柄（默认实现注入，测试可替换） */
  sdk: SaveSdkHandles;
  /** 权限查询器（默认实现保留现有 localStorage 解析） */
  permissions: SavePermissionQuerier;
}

export interface Command {
  readonly name: string;
  execute(ctx: CommandContext): Promise<CommandResult>;
}

class CommandRegistryImpl {
  private commands = new Map<string, Command>();

  register(command: Command): void {
    this.commands.set(command.name, command);
  }

  get(name: string): Command | undefined {
    return this.commands.get(name);
  }

  async execute(name: string, ctx: CommandContext): Promise<CommandResult> {
    const command = this.commands.get(name);
    if (!command) {
      return { success: false, error: `Command '${name}' not found` };
    }
    return command.execute(ctx);
  }

  has(name: string): boolean {
    return this.commands.has(name);
  }

  getAll(): Command[] {
    return Array.from(this.commands.values());
  }
}

export const CommandRegistry = new CommandRegistryImpl();
