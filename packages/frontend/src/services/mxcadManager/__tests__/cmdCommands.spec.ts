import { describe, it, expect, vi } from 'vitest';
import type { CommandResult, CommandContext } from '../cmd/types';

const mockCtx: CommandContext = {
  fileName: 'test.dwg',
  fileInfo: { fileId: '', name: 'test.dwg', parentId: null, projectId: null },
  saveDrawingToBlob: vi.fn().mockResolvedValue({
    blob: new Blob(['test'], { type: 'application/octet-stream' }),
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

describe('CommandRegistry', () => {
  it('registers and executes commands', async () => {
    const { CommandRegistry } = await import('../cmd/types');
    const mockCommand = {
      name: 'test-command',
      execute: vi.fn().mockResolvedValue({ success: true } as CommandResult),
    };
    CommandRegistry.register(mockCommand);
    expect(CommandRegistry.has('test-command')).toBe(true);
    const result = await CommandRegistry.execute('test-command', mockCtx);
    expect(result.success).toBe(true);
    expect(mockCommand.execute).toHaveBeenCalledWith(mockCtx);
  });

  it('returns error for unknown command', async () => {
    const { CommandRegistry } = await import('../cmd/types');
    const result = await CommandRegistry.execute('non-existent', mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns undefined for unregistered command', async () => {
    const { CommandRegistry } = await import('../cmd/types');
    expect(CommandRegistry.get('ghost')).toBeUndefined();
  });

  it('accepts multiple registrations', async () => {
    const { CommandRegistry } = await import('../cmd/types');
    const cmdA = { name: 'A', execute: vi.fn() };
    const cmdB = { name: 'B', execute: vi.fn() };
    CommandRegistry.register(cmdA);
    CommandRegistry.register(cmdB);
    expect(CommandRegistry.has('A')).toBe(true);
    expect(CommandRegistry.has('B')).toBe(true);
  });

  it('getAll returns copy of registered commands', async () => {
    const { CommandRegistry } = await import('../cmd/types');
    const all = CommandRegistry.getAll();
    expect(Array.isArray(all)).toBe(true);
  });
});
