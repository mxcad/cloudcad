// Mx_ExportDXF 子类声明 — 参数化实现见 exportFormat.ts（ExportFormatCommand）
import { ExportFormatCommand } from './exportFormat';

export class ExportDXFCommand extends ExportFormatCommand {
  constructor() {
    super('Mx_ExportDXF', 'dxf');
  }
}
