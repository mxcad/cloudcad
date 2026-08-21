import { MxFun } from 'mxdraw';
import type { Command, CommandContext, CommandResult } from './types';

export class SaveToCloudCommand implements Command {
  readonly name = 'Mx_SaveToCloud';

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    MxFun.sendStringToExecute('Mx_Save');
    return { success: true };
  }
}
