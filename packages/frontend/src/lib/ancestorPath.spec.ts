import { describe, it, expect, vi } from 'vitest';
import {
  resolveAncestorPath,
  type AncestorClient,
  type AncestorNode,
} from './ancestorPath';

/** 构造内存版祖先链客户端：id → 节点（parentId 指向父） */
function makeClient(
  nodes: Record<string, AncestorNode>,
  opts: { throwOn?: string; throwError?: Error } = {}
): AncestorClient {
  return {
    getNode: vi.fn(async (id: string) => {
      if (opts.throwOn === id) throw opts.throwError ?? new Error('boom');
      return nodes[id] ?? null;
    }),
  };
}

describe('resolveAncestorPath', () => {
  it('遍历到根（parentId 为空）返回根→叶完整路径', async () => {
    const client = makeClient({
      root: { id: 'root', name: '根', parentId: null },
      mid: { id: 'mid', name: '中', parentId: 'root' },
      leaf: { id: 'leaf', name: '叶', parentId: 'mid' },
    });
    const result = await resolveAncestorPath('leaf', { client });
    expect(result.complete).toBe(true);
    expect(result.path).toEqual([
      { id: 'root', name: '根' },
      { id: 'mid', name: '中' },
      { id: 'leaf', name: '叶' },
    ]);
  });

  it('stopAt 命中时停止且该节点不入路径', async () => {
    const client = makeClient({
      lib: { id: 'lib', name: '库根', parentId: null },
      a: { id: 'a', name: 'A', parentId: 'lib' },
      b: { id: 'b', name: 'B', parentId: 'a' },
    });
    const result = await resolveAncestorPath('b', {
      client,
      stopAt: (n) => n.id === 'lib',
    });
    expect(result.complete).toBe(true);
    expect(result.path).toEqual([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]);
  });

  it('起始节点即命中 stopAt 时返回空路径且 complete', async () => {
    const client = makeClient({
      lib: { id: 'lib', name: '库根', parentId: null },
    });
    const result = await resolveAncestorPath('lib', {
      client,
      stopAt: (n) => n.id === 'lib',
    });
    expect(result.complete).toBe(true);
    expect(result.path).toEqual([]);
  });

  it('客户端抛错：返回已解析部分 + failedId + 原始错误', async () => {
    const error = new Error('network down');
    const client = makeClient(
      {
        root: { id: 'root', name: '根', parentId: null },
        leaf: { id: 'leaf', name: '叶', parentId: 'mid' },
      },
      { throwOn: 'mid', throwError: error }
    );
    const result = await resolveAncestorPath('leaf', { client });
    expect(result.complete).toBe(false);
    expect(result.failedId).toBe('mid');
    expect(result.error).toBe(error);
    expect(result.path).toEqual([{ id: 'leaf', name: '叶' }]);
  });

  it('节点缺失（返回 null）：complete=false 且无 error', async () => {
    const client = makeClient({
      leaf: { id: 'leaf', name: '叶', parentId: 'ghost' },
    });
    const result = await resolveAncestorPath('leaf', { client });
    expect(result.complete).toBe(false);
    expect(result.failedId).toBe('ghost');
    expect(result.error).toBeUndefined();
    expect(result.path).toEqual([{ id: 'leaf', name: '叶' }]);
  });

  it('深度上限截断：complete=false 且无错误', async () => {
    // 环：a → b → a，maxDepth=2 时截断
    const client = makeClient({
      a: { id: 'a', name: 'A', parentId: 'b' },
      b: { id: 'b', name: 'B', parentId: 'a' },
    });
    const result = await resolveAncestorPath('a', { client, maxDepth: 2 });
    expect(result.complete).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.path).toEqual([
      { id: 'b', name: 'B' },
      { id: 'a', name: 'A' },
    ]);
  });

  it('起始节点即缺失：空路径 + complete=false', async () => {
    const client = makeClient({});
    const result = await resolveAncestorPath('ghost', { client });
    expect(result.complete).toBe(false);
    expect(result.failedId).toBe('ghost');
    expect(result.path).toEqual([]);
  });
});
