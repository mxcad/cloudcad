///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api-sdk
vi.mock('@/api-sdk', () => ({
  mxCadControllerSaveMxwebToNode: vi.fn(),
  fileSystemControllerCheckProjectPermission: vi.fn(),
  mxCadControllerUploadThumbnail: vi.fn(),
  mxCadControllerCheckThumbnail: vi.fn(),
}));

// Mock services
vi.mock('@/services/filesApi', () => ({
  filesApi: {
    get: vi.fn(),
  },
}));

// Mock utils
vi.mock('@/utils/hashUtils', () => ({
  calculateFileHash: vi.fn(),
}));

vi.mock('@/utils/uppyUploadUtils', () => ({
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
import { mxCadControllerSaveMxwebToNode } from '@/api-sdk';
import { filesApi } from '@/services/filesApi';
import { handleError } from '@/utils/errorHandler';
import { globalShowToast } from '@/contexts/NotificationContext';

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

    it('saves blob to a node with basic parameters', async () => {
      const mockSave = mxCadControllerSaveMxwebToNode as ReturnType<typeof vi.fn>;
      mockSave.mockResolvedValue({ data: { success: true } });

      await saveMxwebToNode({
        nodeId: 'node-abc',
        blob: mockBlob,
        filename: 'drawing.mxweb',
      });

      expect(mockSave).toHaveBeenCalledTimes(1);
      const callArgs = mockSave.mock.calls[0][0];
      expect(callArgs.path.nodeId).toBe('node-abc');
      const body = callArgs.body as FormData;
      expect(body.get('nodeId')).toBe('node-abc');
      expect(body.get('name')).toBe('drawing.mxweb');
    });

    it('includes commitMessage in FormData when provided', async () => {
      const mockSave = mxCadControllerSaveMxwebToNode as ReturnType<typeof vi.fn>;
      mockSave.mockResolvedValue({ data: { success: true } });

      await saveMxwebToNode({
        nodeId: 'node-def',
        blob: mockBlob,
        filename: 'drawing.mxweb',
        commitMessage: 'Fixed layer alignment',
      });

      const callArgs = mockSave.mock.calls[0][0];
      const body = callArgs.body as FormData;
      expect(body.get('commitMessage')).toBe('Fixed layer alignment');
    });

    it('includes expectedTimestamp when provided (optimistic locking)', async () => {
      const mockSave = mxCadControllerSaveMxwebToNode as ReturnType<typeof vi.fn>;
      mockSave.mockResolvedValue({ data: { success: true } });

      await saveMxwebToNode({
        nodeId: 'node-ghi',
        blob: mockBlob,
        filename: 'drawing.mxweb',
        expectedTimestamp: '2024-01-15T10:30:00Z',
      });

      const callArgs = mockSave.mock.calls[0][0];
      const body = callArgs.body as FormData;
      expect(body.get('expectedTimestamp')).toBe('2024-01-15T10:30:00Z');
    });

    it('handles missing optional parameters gracefully', async () => {
      const mockSave = mxCadControllerSaveMxwebToNode as ReturnType<typeof vi.fn>;
      mockSave.mockResolvedValue({ data: { success: true } });

      // commitMessage and expectedTimestamp are optional — should not break
      await saveMxwebToNode({
        nodeId: 'node-jkl',
        blob: mockBlob,
        filename: 'minimal.mxweb',
      });

      const callArgs = mockSave.mock.calls[0][0];
      const body = callArgs.body as FormData;
      expect(body.get('commitMessage')).toBeNull();
      expect(body.get('expectedTimestamp')).toBeNull();
    });

    it('propagates API errors', async () => {
      const mockSave = mxCadControllerSaveMxwebToNode as ReturnType<typeof vi.fn>;
      const apiError = new Error('Server error: file too large');
      mockSave.mockRejectedValue(apiError);

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
    it('returns user message when confirm clicked with text', async () => {
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        setTimeout(() => {
          const input = (node as HTMLElement).querySelector('#mxcad-save-dialog-input') as HTMLTextAreaElement;
          if (input) {
            // Simulate user typing
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
