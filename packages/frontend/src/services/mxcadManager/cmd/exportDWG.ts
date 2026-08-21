// Mx_ExportDWG 子类声明 — 参数化实现见 exportFormat.ts（ExportFormatCommand）
import { ExportFormatCommand } from './exportFormat';

export class ExportDWGCommand extends ExportFormatCommand {
  constructor() {
    super('Mx_ExportDWG', 'dwg');
  }
}
