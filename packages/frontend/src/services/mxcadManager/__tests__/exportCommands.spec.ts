///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 导出命令簇参数化合并（架构切片 T6）回归测试：
 * - Mx_ExportDWG / Mx_ExportDXF / Mx_ExportPDF 注册名与事件语义保持不变
 * - 三个命令共用 ExportFormatCommand 参数化实现（format 参数）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CAD_EVENTS } from '@/constants/events';
import {
  subscribe,
  clearDrawingSessionListeners,
} from '@/services/drawingSession';
import type { CommandContext } from '../cmd/types';
import { CommandRegistry } from '../cmd/types';
import {
  ExportFormatCommand,
  ExportDWGCommand,
  ExportDXFCommand,
  ExportPDFCommand,
} from '../cmd/exportFormat';

const mockCtx: CommandContext = {
  fileName: 'test.dwg',
  fileInfo: { fileId: 'node-123', name: 'test.dwg', parentId: null, projectId: null },
  saveDrawingToBlob: vi.fn().mockResolvedValue({
    blob: new Blob(['export'], { type: 'application/octet-stream' }),
    data: new ArrayBuffer(8),
    filename: 'test.dwg',
  }),
  saveFile: vi.fn().mockResolvedValue({ status: 'saved' }),
  sdk: {
    getNode: vi.fn(),
    getLibraryNode: vi.fn(),
    getUserProjectPermissions: vi.fn(),
    saveMxwebToNode: vi.fn(),
  },
  permissions: {
    hasProjectPermission: vi.fn(),
    hasLibraryPermission: vi.fn(),
  },
};

describe('导出命令簇参数化（T6）', () => {
  beforeEach(() => {
    clearDrawingSessionListeners();
    vi.clearAllMocks();
  });

  it('注册名保持不变：Mx_ExportDWG / Mx_ExportDXF / Mx_ExportPDF', () => {
    CommandRegistry.register(new ExportDWGCommand());
    CommandRegistry.register(new ExportDXFCommand());
    CommandRegistry.register(new ExportPDFCommand());

    expect(CommandRegistry.has('Mx_ExportDWG')).toBe(true);
    expect(CommandRegistry.has('Mx_ExportDXF')).toBe(true);
    expect(CommandRegistry.has('Mx_ExportPDF')).toBe(true);
  });

  it('Mx_ExportDWG 触发 EXPORT_DWG 且 payload 携带 format: dwg', async () => {
    const handler = vi.fn();
    const unsub = subscribe(CAD_EVENTS.EXPORT_DWG, handler);

    const result = await CommandRegistry.execute('Mx_ExportDWG', mockCtx);

    expect(result.success).toBe(true);
    expect(handler).toHaveBeenCalledWith({
      fileName: 'test.dwg',
      blob: expect.any(Blob),
      format: 'dwg',
    });
    unsub();
  });

  it('Mx_ExportDXF 触发 EXPORT_DXF 且 payload 携带 format: dxf', async () => {
    const handler = vi.fn();
    const unsub = subscribe(CAD_EVENTS.EXPORT_DXF, handler);

    const result = await CommandRegistry.execute('Mx_ExportDXF', mockCtx);

    expect(result.success).toBe(true);
    expect(handler).toHaveBeenCalledWith({
      fileName: 'test.dwg',
      blob: expect.any(Blob),
      format: 'dxf',
    });
    unsub();
  });

  it('Mx_ExportPDF 触发 EXPORT_PDF 且 payload 与历史一致（无 format 字段）', async () => {
    const handler = vi.fn();
    const unsub = subscribe(CAD_EVENTS.EXPORT_PDF, handler);

    const result = await CommandRegistry.execute('Mx_ExportPDF', mockCtx);

    expect(result.success).toBe(true);
    expect(handler).toHaveBeenCalledWith({
      fileName: 'test.dwg',
      blob: expect.any(Blob),
    });
    expect(handler.mock.calls[0][0]).not.toHaveProperty('format');
    unsub();
  });

  it('事件 payload 只含 fileName/blob/format（无 nodeId，云图与本地图一致）', async () => {
    const handler = vi.fn();
    const unsub = subscribe(CAD_EVENTS.EXPORT_DWG, handler);
    const localCtx: CommandContext = {
      ...mockCtx,
      fileInfo: {
        fileId: '',
        name: 'local.dwg',
        parentId: null,
        projectId: null,
      },
    };

    const result = await CommandRegistry.execute('Mx_ExportDWG', localCtx);

    expect(result.success).toBe(true);
    const payload = handler.mock.calls[0][0];
    // 导出的是编辑器内存 blob，不携带 nodeId；云图/本地图行为一致
    expect(payload).not.toHaveProperty('nodeId');
    expect(payload).toHaveProperty('blob');
    unsub();
  });

  it('参数化基类可直接以 name + format 构造（等价于子类）', async () => {
    const handler = vi.fn();
    const unsub = subscribe(CAD_EVENTS.EXPORT_DXF, handler);

    const cmd = new ExportFormatCommand('Mx_ExportDXF', 'dxf');
    const result = await cmd.execute(mockCtx);

    expect(result.success).toBe(true);
    expect(cmd.name).toBe('Mx_ExportDXF');
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'dxf' })
    );
    unsub();
  });

  it('保存失败时返回失败结果并记录错误（事件不触发）', async () => {
    (mockCtx.saveDrawingToBlob as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('save failed')
    );
    const handler = vi.fn();
    const unsub = subscribe(CAD_EVENTS.EXPORT_DWG, handler);

    const result = await CommandRegistry.execute('Mx_ExportDWG', mockCtx);

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('save failed');
    expect(handler).not.toHaveBeenCalled();
    unsub();
  });
});
