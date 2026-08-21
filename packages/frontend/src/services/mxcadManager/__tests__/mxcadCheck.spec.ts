///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock api-sdk before importing the module
vi.mock('@/api-sdk', () => ({
  mxcadUploadControllerCheckFileExist: vi.fn(),
}));

// Mock auth check
vi.mock('@/utils/authCheck', () => ({
  isAuthenticated: vi.fn(() => true),
}));

import { checkDuplicateFile, showDuplicateFileDialog } from '../mxcadCheck';
import { mxcadUploadControllerCheckFileExist } from '@/api-sdk';

describe('mxcadCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // showDuplicateFileDialog 会把弹框挂到 document.body；用例失败/提前退出时残留节点会污染后续用例
  afterEach(() => {
    document.getElementById('mxcad-duplicate-file-dialog')?.remove();
  });

  describe('checkDuplicateFile', () => {
    it('returns false when no duplicate exists', async () => {
      const mockCheck = mxcadUploadControllerCheckFileExist as ReturnType<
        typeof vi.fn
      >;
      mockCheck.mockResolvedValue({
        data: { exists: false, nodeId: null },
      });

      const result = await checkDuplicateFile('abc123', 'test.dwg', 'node-1');
      expect(result.isDuplicate).toBe(false);
      expect(result.existingNodeId).toBeNull();
    });

    it('returns true and existingNodeId when duplicate exists', async () => {
      const mockCheck = mxcadUploadControllerCheckFileExist as ReturnType<
        typeof vi.fn
      >;
      mockCheck.mockResolvedValue({
        data: { exists: true, nodeId: 'existing-node-42' },
      });

      const result = await checkDuplicateFile(
        'def456',
        'existing.dwg',
        'node-2'
      );
      expect(result.isDuplicate).toBe(true);
      expect(result.existingNodeId).toBe('existing-node-42');
    });

    it('handles API errors gracefully by returning isDuplicate=false', async () => {
      const mockCheck = mxcadUploadControllerCheckFileExist as ReturnType<
        typeof vi.fn
      >;
      mockCheck.mockRejectedValue(new Error('Network error'));

      const result = await checkDuplicateFile('ghi789', 'error.dwg', 'node-3');
      expect(result.isDuplicate).toBe(false);
      expect(result.existingNodeId).toBeNull();
    });

    it('handles null response data', async () => {
      const mockCheck = mxcadUploadControllerCheckFileExist as ReturnType<
        typeof vi.fn
      >;
      mockCheck.mockResolvedValue({ data: null });

      const result = await checkDuplicateFile(
        'jkl012',
        'nulldata.dwg',
        'node-4'
      );
      expect(result.isDuplicate).toBe(false);
      expect(result.existingNodeId).toBeNull();
    });

    it('passes correct parameters to the API', async () => {
      const mockCheck = mxcadUploadControllerCheckFileExist as ReturnType<
        typeof vi.fn
      >;
      mockCheck.mockResolvedValue({
        data: { exists: false },
      });

      await checkDuplicateFile('hash-abc', 'myfile.dwg', 'target-node-99');

      expect(mockCheck).toHaveBeenCalledTimes(1);
      expect(mockCheck).toHaveBeenCalledWith({
        body: {
          fileHash: 'hash-abc',
          filename: 'myfile.dwg',
          nodeId: 'target-node-99',
          fileSize: 0,
        },
      });
    });
  });

  describe('showDuplicateFileDialog', () => {
    it('returns "open" when user clicks open existing file', async () => {
      const promise = showDuplicateFileDialog('test.dwg');
      const openBtn = document.getElementById(
        'mxcad-duplicate-dialog-open'
      ) as HTMLButtonElement;
      openBtn.click();

      await expect(promise).resolves.toBe('open');
      expect(document.getElementById('mxcad-duplicate-file-dialog')).toBeNull();
    });

    it('returns null when user clicks cancel', async () => {
      const promise = showDuplicateFileDialog('test.dwg');
      const cancelBtn = document.getElementById(
        'mxcad-duplicate-dialog-cancel'
      ) as HTMLButtonElement;
      cancelBtn.click();

      await expect(promise).resolves.toBeNull();
      expect(document.getElementById('mxcad-duplicate-file-dialog')).toBeNull();
    });

    it('returns "upload" when user clicks upload new file', async () => {
      const promise = showDuplicateFileDialog('test.dwg');
      const uploadBtn = document.getElementById(
        'mxcad-duplicate-dialog-upload'
      ) as HTMLButtonElement;
      uploadBtn.click();

      await expect(promise).resolves.toBe('upload');
      expect(document.getElementById('mxcad-duplicate-file-dialog')).toBeNull();
    });

    it('includes the filename in the dialog', async () => {
      const promise = showDuplicateFileDialog('my-custom-file.dwg');
      const dialog = document.getElementById('mxcad-duplicate-file-dialog');
      expect(dialog?.innerHTML).toContain('my-custom-file.dwg');

      const closeBtn = document.getElementById(
        'mxcad-duplicate-dialog-close'
      ) as HTMLButtonElement;
      closeBtn.click();
      await expect(promise).resolves.toBeNull();
    });

    it('removes a pre-existing dialog before showing a new one', async () => {
      showDuplicateFileDialog('first.dwg');
      expect(
        document.getElementById('mxcad-duplicate-file-dialog')
      ).not.toBeNull();

      const promise = showDuplicateFileDialog('second.dwg');
      expect(
        document.getElementById('mxcad-duplicate-file-dialog')?.innerHTML
      ).toContain('second.dwg');

      const openBtn = document.getElementById(
        'mxcad-duplicate-dialog-open'
      ) as HTMLButtonElement;
      openBtn.click();

      await expect(promise).resolves.toBe('open');
      expect(document.getElementById('mxcad-duplicate-file-dialog')).toBeNull();
    });
  });
});
