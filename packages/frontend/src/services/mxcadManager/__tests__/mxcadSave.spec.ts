///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock uploadBlobWithTus instead of saveControllerSaveMxwebToNode
vi.mock('@/utils/uppyUploadUtils', () => ({
  uploadBlobWithTus: vi.fn(),
  uploadFileWithUppy: vi.fn(),
}));

vi.mock('@/utils/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/utils/loadingUtils', () => ({
  showGlobalLoading: vi.fn(),
  hideGlobalLoading: vi.fn(),
  setLoadingMessage: vi.fn(),
}));

vi.mock('@/utils/authCheck', () => ({
  isAuthenticated: vi.fn(() => true),
}));

vi.mock('@/contexts/NotificationContext', () => ({
  globalShowToast: vi.fn(),
}));

import {
  saveMxwebToNode,
  createSaveFormData,
  showSaveConfirmDialog,
} from '../mxcadSave';
import { uploadBlobWithTus } from '@/utils/uppyUploadUtils';

import { handleError } from '@/utils/errorHandler';

describe('mxcadSave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSaveFormData', () => {
    it('creates FormData with blob and nodeId', () => {
      const blob = new Blob(['test data'], { type: 'application/octet-stream' });
      const formData = createSaveFormData(blob, 'node-1', 'test.mxweb');

      expect(formData.get('file')).toBeInstanceOf(Blob);
      expect(formData.get('nodeId')).toBe('node-1');
      expect(formData.get('name')).toBe('test.mxweb');
      expect(formData.get('chunk')).toBe('0');
      expect(formData.get('chunks')).toBe('1');
    });

    it('includes size from blob', () => {
      const data = new Uint8Array(1024);
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const formData = createSaveFormData(blob, 'node-2', 'drawing.mxweb');

      expect(formData.get('size')).toBe(String(blob.size));
    });
  });

  describe('saveMxwebToNode', () => {
    const mockBlob = new Blob(['saved-data'], { type: 'application/octet-stream' });

    it('saves blob to a node via Tus upload', async () => {
      const mockUpload = uploadBlobWithTus as ReturnType<typeof vi.fn>;
      mockUpload.mockResolvedValue({ nodeId: 'node-abc' });

      await saveMxwebToNode({
        nodeId: 'node-abc',
        blob: mockBlob,
        fileName: 'drawing.mxweb',
      });

      expect(mockUpload).toHaveBeenCalledTimes(1);
      const callArgs = mockUpload.mock.calls[0][0];
      expect(callArgs.blob).toBe(mockBlob);
      expect(callArgs.metadata.uploadType).toBe('save');
      expect(callArgs.metadata.overwriteNodeId).toBe('node-abc');
    });

    it('includes commitMessage when provided', async () => {
      const mockUpload = uploadBlobWithTus as ReturnType<typeof vi.fn>;
      mockUpload.mockResolvedValue({ nodeId: 'node-def' });

      await saveMxwebToNode({
        nodeId: 'node-def',
        blob: mockBlob,
        fileName: 'drawing.mxweb',
        commitMessage: 'Fixed layer alignment',
      });

      const callArgs = mockUpload.mock.calls[0][0];
      expect(callArgs.metadata.commitMessage).toBe('Fixed layer alignment');
    });

    it('includes expectedTimestamp when provided', async () => {
      const mockUpload = uploadBlobWithTus as ReturnType<typeof vi.fn>;
      mockUpload.mockResolvedValue({ nodeId: 'node-ghi' });

      await saveMxwebToNode({
        nodeId: 'node-ghi',
        blob: mockBlob,
        fileName: 'drawing.mxweb',
        expectedTimestamp: '2024-01-15T10:30:00Z',
      });

      const callArgs = mockUpload.mock.calls[0][0];
      expect(callArgs.metadata.expectedTimestamp).toBe('2024-01-15T10:30:00Z');
    });

    it('handles missing optional parameters gracefully', async () => {
      const mockUpload = uploadBlobWithTus as ReturnType<typeof vi.fn>;
      mockUpload.mockResolvedValue({ nodeId: 'node-jkl' });

      await saveMxwebToNode({
        nodeId: 'node-jkl',
        blob: mockBlob,
        fileName: 'minimal.mxweb',
      });

      const callArgs = mockUpload.mock.calls[0][0];
      expect(callArgs.metadata.commitMessage).toBeUndefined();
      expect(callArgs.metadata.expectedTimestamp).toBeUndefined();
    });

    it('propagates API errors', async () => {
      const mockUpload = uploadBlobWithTus as ReturnType<typeof vi.fn>;
      const apiError = new Error('Server error: file too large');
      mockUpload.mockRejectedValue(apiError);

      await expect(
        saveMxwebToNode({
          nodeId: 'node-err',
          blob: mockBlob,
          fileName: 'drawing.mxweb',
        })
      ).rejects.toThrow('Server error: file too large');

      expect(handleError).toHaveBeenCalled();
    });
  });

  describe('showSaveConfirmDialog', () => {
    it('returns user message when confirm clicked with text', async () => {
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        setTimeout(() => {
          const input = (node as HTMLElement).querySelector('#mxcad-save-dialog-input') as HTMLTextAreaElement;
          if (input) {
            Object.defineProperty(input, 'value', { value: 'Updated section A', writable: true });
          }
          const confirmBtn = (node as HTMLElement).querySelector('#mxcad-save-dialog-confirm');
          if (confirmBtn) {
            (confirmBtn as HTMLButtonElement).click();
          }
        }, 10);
        return node;
      });

      const result = await showSaveConfirmDialog();
      expect(result).toBe('Updated section A');

      vi.restoreAllMocks();
    });

    it('returns empty string when confirm clicked with no text', async () => {
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        setTimeout(() => {
          const confirmBtn = (node as HTMLElement).querySelector('#mxcad-save-dialog-confirm');
          if (confirmBtn) {
            (confirmBtn as HTMLButtonElement).click();
          }
        }, 10);
        return node;
      });

      const result = await showSaveConfirmDialog();
      expect(result).toBe('');

      vi.restoreAllMocks();
    });

    it('returns null when user cancels', async () => {
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        setTimeout(() => {
          const cancelBtn = (node as HTMLElement).querySelector('#mxcad-save-dialog-cancel');
          if (cancelBtn) {
            (cancelBtn as HTMLButtonElement).click();
          }
        }, 10);
        return node;
      });

      const result = await showSaveConfirmDialog();
      expect(result).toBeNull();

      vi.restoreAllMocks();
    });

    it('returns null when ESC is pressed', async () => {
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        setTimeout(() => {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        }, 10);
        return node;
      });

      const result = await showSaveConfirmDialog();
      expect(result).toBeNull();

      vi.restoreAllMocks();
    });

    it('confirms on Ctrl+Enter', async () => {
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        setTimeout(() => {
          const input = (node as HTMLElement).querySelector('#mxcad-save-dialog-input') as HTMLTextAreaElement;
          if (input) {
            Object.defineProperty(input, 'value', { value: 'Quick save', writable: true });
          }
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
        }, 10);
        return node;
      });

      const result = await showSaveConfirmDialog();
      expect(result).toBe('Quick save');

      vi.restoreAllMocks();
    });
  });
});