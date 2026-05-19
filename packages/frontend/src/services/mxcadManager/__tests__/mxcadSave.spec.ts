import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api-sdk', () => ({
  saveControllerSaveMxwebToNode: vi.fn(),
}));

vi.mock('@/utils/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/contexts/NotificationContext', () => ({
  globalShowPrompt: vi.fn(),
}));

import {
  saveMxwebToNode,
  showSaveConfirmDialog,
} from '../mxcadSave';
import { saveControllerSaveMxwebToNode } from '@/api-sdk';
import { globalShowPrompt } from '@/contexts/NotificationContext';
import { handleError } from '@/utils/errorHandler';

describe('mxcadSave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveMxwebToNode', () => {
    const mockBlob = new Blob(['saved-data'], { type: 'application/octet-stream' });

    it('saves blob to a node via SDK', async () => {
      (saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await saveMxwebToNode({
        nodeId: 'node-abc',
        blob: mockBlob,
        filename: 'drawing.mxweb',
      });

      expect(saveControllerSaveMxwebToNode).toHaveBeenCalledTimes(1);
      const callArgs = (saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.path.nodeId).toBe('node-abc');
      expect(callArgs.body.file).toBeInstanceOf(File);
    });

    it('includes commitMessage when provided', async () => {
      (saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await saveMxwebToNode({
        nodeId: 'node-def',
        blob: mockBlob,
        filename: 'drawing.mxweb',
        commitMessage: 'Fixed layer alignment',
      });

      const callArgs = (saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.body.commitMessage).toBe('Fixed layer alignment');
    });

    it('includes expectedTimestamp when provided', async () => {
      (saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await saveMxwebToNode({
        nodeId: 'node-ghi',
        blob: mockBlob,
        filename: 'drawing.mxweb',
        expectedTimestamp: '2024-01-15T10:30:00Z',
      });

      const callArgs = (saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.body.expectedTimestamp).toBe('2024-01-15T10:30:00Z');
    });

    it('handles missing optional parameters gracefully', async () => {
      (saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await saveMxwebToNode({
        nodeId: 'node-jkl',
        blob: mockBlob,
        filename: 'minimal.mxweb',
      });

      const callArgs = (saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.body.commitMessage).toBeUndefined();
      expect(callArgs.body.expectedTimestamp).toBeUndefined();
    });

    it('propagates API errors', async () => {
      const apiError = new Error('Server error: file too large');
      (saveControllerSaveMxwebToNode as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(apiError);

      await expect(
        saveMxwebToNode({
          nodeId: 'node-err',
          blob: mockBlob,
          filename: 'drawing.mxweb',
        })
      ).rejects.toThrow('Server error: file too large');

      expect(handleError).toHaveBeenCalled();
    });
  });

  describe('showSaveConfirmDialog', () => {
    it('returns user message when prompt resolves with text', async () => {
      (globalShowPrompt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('Updated section A');

      const result = await showSaveConfirmDialog();
      expect(result).toBe('Updated section A');
      expect(globalShowPrompt).toHaveBeenCalledWith({
        title: '保存文件',
        label: '修改说明（可选）',
        confirmText: '保存',
        multiline: true,
      });
    });

    it('returns empty string when prompt resolves with empty', async () => {
      (globalShowPrompt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('');

      const result = await showSaveConfirmDialog();
      expect(result).toBe('');
    });

    it('returns null when user cancels', async () => {
      (globalShowPrompt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await showSaveConfirmDialog();
      expect(result).toBeNull();
    });
  });
});
