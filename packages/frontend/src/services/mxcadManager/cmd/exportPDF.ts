// Mx_ExportPDF 子类声明 — 参数化实现见 exportFormat.ts（ExportFormatCommand）
import { ExportFormatCommand } from './exportFormat';

export class ExportPDFCommand extends ExportFormatCommand {
  constructor() {
    super('Mx_ExportPDF', 'pdf');
  }
}
