import { triggerSaveAs } from '../mxcadHelpers';
import type { Command, CommandContext, CommandResult } from './types';

export class ExportFileCommand implements Command {
  readonly name = 'exportFile';

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    await triggerSaveAs();
    return { success: true };
  }
}
