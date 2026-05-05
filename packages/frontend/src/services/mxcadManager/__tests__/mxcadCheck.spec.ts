///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api-sdk before importing the module
vi.mock('@/api-sdk', () => ({
  mxCadControllerCheckDuplicateFile: vi.fn(),
}));

// Mock notification context
vi.mock('@/contexts/NotificationContext', () => ({
  globalShowToast: vi.fn(),
}));

// Mock auth check
vi.mock('@/utils/authCheck', () => ({
  isAuthenticated: vi.fn(() => true),
}));

import {
  checkDuplicateFile,
  showDuplicateFileDialog,
} from '../mxcadCheck';
import { mxCadControllerCheckDuplicateFile } from '@/api-sdk';

describe('mxcadCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkDuplicateFile', () => {
    it('returns false when no duplicate exists', async () => {
      const mockCheck = mxCadControllerCheckDuplicateFile as ReturnType<typeof vi.fn>;
      mockCheck.mockResolvedValue({
        data: { isDuplicate: false, existingNodeId: null },
      });

      const result = await checkDuplicateFile('abc123', 'test.dwg', 'node-1');
      expect(result.isDuplicate).toBe(false);
      expect(result.existingNodeId).toBeNull();
    });

    it('returns true and existingNodeId when duplicate exists', async () => {
      const mockCheck = mxCadControllerCheckDuplicateFile as ReturnType<typeof vi.fn>;
      mockCheck.mockResolvedValue({
        data: { isDuplicate: true, existingNodeId: 'existing-node-42' },
      });

      const result = await checkDuplicateFile('def456', 'existing.dwg', 'node-2');
      expect(result.isDuplicate).toBe(true);
      expect(result.existingNodeId).toBe('existing-node-42');
    });

    it('handles API errors gracefully by returning isDuplicate=false', async () => {
      const mockCheck = mxCadControllerCheckDuplicateFile as ReturnType<typeof vi.fn>;
      mockCheck.mockRejectedValue(new Error('Network error'));

      const result = await checkDuplicateFile('ghi789', 'error.dwg', 'node-3');
      expect(result.isDuplicate).toBe(false);
      expect(result.existingNodeId).toBeNull();
    });

    it('handles null response data', async () => {
      const mockCheck = mxCadControllerCheckDuplicateFile as ReturnType<typeof vi.fn>;
      mockCheck.mockResolvedValue({ data: null });

      const result = await checkDuplicateFile('jkl012', 'nulldata.dwg', 'node-4');
      expect(result.isDuplicate).toBe(false);
      expect(result.existingNodeId).toBeNull();
    });

    it('passes correct parameters to the API', async () => {
      const mockCheck = mxCadControllerCheckDuplicateFile as ReturnType<typeof vi.fn>;
      mockCheck.mockResolvedValue({
        data: { isDuplicate: false },
      });

      await checkDuplicateFile('hash-abc', 'myfile.dwg', 'target-node-99');

      expect(mockCheck).toHaveBeenCalledTimes(1);
      expect(mockCheck).toHaveBeenCalledWith({
        body: {
          fileHash: 'hash-abc',
          filename: 'myfile.dwg',
          nodeId: 'target-node-99',
        },
      });
    });
  });

  describe('showDuplicateFileDialog', () => {
    it('returns "open" when user clicks open existing file', async () => {
      // Mock DOM - create a fake dialog that auto-clicks "open"
      const originalCreateElement = document.createElement.bind(document);
      const originalGetElementById = document.getElementById.bind(document);
      const originalAppendChild = document.body.appendChild.bind(document.body);

      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        // Schedule a click on the "open" button after microtask
        setTimeout(() => {
          const openBtn = (node as HTMLElement).querySelector('#mxcad-duplicate-dialog-open');
          if (openBtn) {
            (openBtn as HTMLButtonElement).click();
          }
        }, 10);
        return node;
      });
      // Restore createElement for dialog construction
      vi.spyOn(document, 'createElement').mockImplementation(
        (tagName: string, _options?: ElementCreationOptions) => {
          return originalCreateElement(tagName);
        }
      );

      const result = await showDuplicateFileDialog('test.dwg');
      expect(result).toBe('open');

      // Cleanup mocks
      vi.restoreAllMocks();
    });

    it('returns null when user clicks cancel', async () => {
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        setTimeout(() => {
          const cancelBtn = (node as HTMLElement).querySelector('#mxcad-duplicate-dialog-cancel');
          if (cancelBtn) {
            (cancelBtn as HTMLButtonElement).click();
          }
        }, 10);
        return node;
      });

      const result = await showDuplicateFileDialog('test.dwg');
      expect(result).toBeNull();

      vi.restoreAllMocks();
    });

    it('returns "upload" when user clicks upload new file', async () => {
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        setTimeout(() => {
          const uploadBtn = (node as HTMLElement).querySelector('#mxcad-duplicate-dialog-upload');
          if (uploadBtn) {
            (uploadBtn as HTMLButtonElement).click();
          }
        }, 10);
        return node;
      });

      const result = await showDuplicateFileDialog('test.dwg');
      expect(result).toBe('upload');

      vi.restoreAllMocks();
    });

    it('includes the filename in the dialog', async () => {
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      let capturedInnerHTML = '';

      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        capturedInnerHTML = (node as HTMLElement).innerHTML;
        setTimeout(() => {
          const closeBtn = (node as HTMLElement).querySelector('#mxcad-duplicate-dialog-close');
          if (closeBtn) {
            (closeBtn as HTMLButtonElement).click();
          }
        }, 10);
        return node;
      });

      await showDuplicateFileDialog('my-custom-file.dwg');
      expect(capturedInnerHTML).toContain('my-custom-file.dwg');

      vi.restoreAllMocks();
    });
  });
});
