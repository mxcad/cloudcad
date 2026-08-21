import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCheckFileExist = vi.fn();
vi.mock('../api-sdk', () => ({
  mxcadUploadControllerCheckFileExist: (...args: unknown[]) => mockCheckFileExist(...args),
}));

import { checkDuplicateFile } from './checkService';

describe('checkDuplicateFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('文件存在时返回 isDuplicate=true', async () => {
    mockCheckFileExist.mockResolvedValue({
      data: { exists: true, nodeId: 'node-123' },
    });

    const result = await checkDuplicateFile('hash123', 'test.dwg', 1024);
    expect(result.isDuplicate).toBe(true);
    expect(result.existingNodeId).toBe('node-123');
  });

  it('文件不存在时返回 isDuplicate=false', async () => {
    mockCheckFileExist.mockResolvedValue({
      data: { exists: false },
    });

    const result = await checkDuplicateFile('hash456', 'new.dwg', 2048);
    expect(result.isDuplicate).toBe(false);
    expect(result.existingNodeId).toBeNull();
  });

  it('API 错误时返回 isDuplicate=false', async () => {
    mockCheckFileExist.mockRejectedValue(new Error('Network error'));

    const result = await checkDuplicateFile('hash789', 'err.dwg', 512);
    expect(result.isDuplicate).toBe(false);
    expect(result.existingNodeId).toBeNull();
  });
});
