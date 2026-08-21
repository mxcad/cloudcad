import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/authCheck', () => ({
  isAuthenticated: vi.fn(),
}));

vi.mock('@/utils/tokenUtils', () => ({
  isAccessTokenExpired: vi.fn(),
}));

vi.mock('@/utils/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: vi.fn(),
}));

vi.mock('../mxcadHelpers', () => ({
  getPersonalSpaceId: vi.fn().mockResolvedValue('ps-1'),
  showSaveAsDialog: vi.fn().mockResolvedValue(undefined),
  triggerSaveAs: vi.fn().mockResolvedValue(undefined),
}));

import { emit, subscribe, clearDrawingSessionListeners } from '../../drawingSession';
import { CAD_EVENTS } from '@/constants/events';
import { isAuthenticated } from '@/utils/authCheck';
import { isAccessTokenExpired } from '@/utils/tokenUtils';
import { globalShowToast } from '@/utils/notificationEvents';
import { handleError } from '@/utils/errorHandler';
import {
  getPersonalSpaceId,
  showSaveAsDialog,
  triggerSaveAs,
} from '../mxcadHelpers';
import { SaveCommand } from '../cmd/saveCommand';
import type { CommandContext } from '../cmd/types';
import type { CurrentFileInfo } from '../mxcadTypes';

function makeCtx(
  overrides: Partial<{
    fileInfo: CurrentFileInfo | null;
    saveFile: CommandContext['saveFile'];
  }> = {}
): CommandContext {
  return {
    fileName: 'drawing.dwg',
    fileInfo: {
      fileId: 'node-1',
      parentId: 'ps-1',
      projectId: null,
      name: 'drawing.dwg',
    },
    saveDrawingToBlob: vi.fn(),
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearDrawingSessionListeners();
  (isAuthenticated as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
  (
    isAccessTokenExpired as unknown as ReturnType<typeof vi.fn>
  ).mockReturnValue(false);
});

describe('SaveCommand（Mx_Save）— CommandContext 注入后', () => {
  it('未登录/令牌过期 → bus 发出 SAVE_REQUIRED 并返回 unauthorized', async () => {
    (isAuthenticated as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      false
    );
    const handler = vi.fn();
    subscribe(CAD_EVENTS.SAVE_REQUIRED, handler);

    const command = new SaveCommand();
    const result = await command.execute(makeCtx());

    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(handler).toHaveBeenCalledWith({ action: '保存文件' });
  });

  it('无文件信息 → 获取个人空间并打开另存为（untitled）', async () => {
    const ctx = makeCtx({ fileInfo: null });
    const command = new SaveCommand();
    const result = await command.execute(ctx);

    expect(result).toEqual({ success: true });
    expect(getPersonalSpaceId).toHaveBeenCalled();
    expect(showSaveAsDialog).toHaveBeenCalledWith('ps-1', 'untitled');
    expect(ctx.saveFile).not.toHaveBeenCalled();
  });

  it('有文件信息 → 委托 ctx.saveFile 保存成功', async () => {
    const saveFile = vi.fn().mockResolvedValue({ status: 'saved' });
    const command = new SaveCommand();
    const result = await command.execute(makeCtx({ saveFile }));

    expect(result).toEqual({ success: true });
    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(saveFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'node-1' })
    );
  });

  it('无权限→另存为 / 已删除 / 用户取消 → 均返回 success（UI 决策在深服务内）', async () => {
    for (const status of ['saveAs', 'cancelled']) {
      const saveFile = vi.fn().mockResolvedValue({ status });
      const command = new SaveCommand();
      const result = await command.execute(makeCtx({ saveFile }));
      expect(result).toEqual({ success: true });
    }
  });

  it('保存失败 → 返回 success:false 透传错误', async () => {
    const saveFile = vi
      .fn()
      .mockResolvedValue({ status: 'failed', error: '配额不足' });
    const command = new SaveCommand();
    const result = await command.execute(makeCtx({ saveFile }));

    expect(result).toEqual({ success: false, error: '配额不足' });
  });

  it('深服务抛异常 → handleError + 错误 toast + success:false', async () => {
    const saveFile = vi.fn().mockRejectedValue(new Error('boom'));
    const command = new SaveCommand();
    const result = await command.execute(makeCtx({ saveFile }));

    expect(result).toEqual({ success: false, error: 'Error: boom' });
    expect(handleError).toHaveBeenCalled();
    expect(globalShowToast).toHaveBeenCalledWith('boom', 'error');
  });
});
