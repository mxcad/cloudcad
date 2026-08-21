import { handleOpenFileCommand } from '../mxcadOpenFile';
import type { Command, CommandContext, CommandResult } from './types';

export class OpenFileCommand implements Command {
  readonly name = 'openFile';

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    await handleOpenFileCommand();
    return { success: true };
  }
}

export class OpenFileNoCacheCommand implements Command {
  readonly name = 'openFile_noCache';

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    await handleOpenFileCommand(true);
    return { success: true };
  }
}
