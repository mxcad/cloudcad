import { handleError } from '@/utils/errorHandler';
import { CAD_EVENTS } from '@/constants/events';
import { emit } from '../../drawingSession';
import type { Command, CommandContext, CommandResult } from './types';

/** 导出格式 — Mx_ExportDWG / Mx_ExportDXF / Mx_ExportPDF 共用同一参数化实现 */
export type ExportFormat = 'dwg' | 'dxf' | 'pdf';

/**
 * 参数化导出命令 — 导出命令簇的单一实现（架构切片 T6）
 *
 * 由 format 参数决定事件与 payload：
 * - 'dwg' → EXPORT_DWG + format: 'dwg'
 * - 'dxf' → EXPORT_DXF + format: 'dxf'
 * - 'pdf' → EXPORT_PDF（payload 与历史行为一致，无 format 字段）
 *
 * 注册名（Mx_ExportDWG / Mx_ExportDXF / Mx_ExportPDF）由三个子类保留，
 * cmd/index.ts 的注册项与 MxFun.addCommand 桥接均不受影响。
 */
export class ExportFormatCommand implements Command {
  constructor(
    public readonly name: string,
    private readonly format: ExportFormat
  ) {}

  async execute(ctx: CommandContext): Promise<CommandResult> {
    try {
      // 导出编辑器内存里最新的 mxweb blob（含未保存改动），云图/本地图行为一致；
      // 弹框据此上传 blob（skipDb）→ 创建非阻塞 fileHash 转换任务 → 面板下载 tab 跟踪 → 完成自动下载。
      const { blob, filename } = await ctx.saveDrawingToBlob(ctx.fileName);
      if (this.format === 'dwg') {
        emit(CAD_EVENTS.EXPORT_DWG, {
          fileName: filename,
          blob,
          format: 'dwg',
        });
      } else if (this.format === 'dxf') {
        emit(CAD_EVENTS.EXPORT_DXF, {
          fileName: filename,
          blob,
          format: 'dxf',
        });
      } else {
        emit(CAD_EVENTS.EXPORT_PDF, { fileName: filename, blob });
      }
      return { success: true };
    } catch (error) {
      handleError(error, this.name);
      return { success: false, error: String(error) };
    }
  }
}

/** Mx_ExportDWG — 保留注册名与事件语义 */
export class ExportDWGCommand extends ExportFormatCommand {
  constructor() {
    super('Mx_ExportDWG', 'dwg');
  }
}

/** Mx_ExportDXF — 保留注册名与事件语义 */
export class ExportDXFCommand extends ExportFormatCommand {
  constructor() {
    super('Mx_ExportDXF', 'dxf');
  }
}

/** Mx_ExportPDF — 保留注册名与事件语义 */
export class ExportPDFCommand extends ExportFormatCommand {
  constructor() {
    super('Mx_ExportPDF', 'pdf');
  }
}
