///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect } from 'vitest';
import { mergeNodesByMode } from './mergeNodesByMode';
import type { FileSystemNode } from '@/types/filesystem';

function makeNode(id: string): FileSystemNode {
  return { id, name: id, isFolder: false } as FileSystemNode;
}

describe('mergeNodesByMode — 滚动分页数据合并纯函数', () => {
  it('replace：整体替换为最新数据', () => {
    const prev = [makeNode('a'), makeNode('b')];
    const incoming = [makeNode('c'), makeNode('d')];
    expect(mergeNodesByMode(prev, incoming, 'replace').map((n) => n.id)).toEqual(
      ['c', 'd']
    );
  });

  it('append：追加到现有数据之后（保持顺序）', () => {
    const prev = [makeNode('a'), makeNode('b')];
    const incoming = [makeNode('c'), makeNode('d')];
    expect(mergeNodesByMode(prev, incoming, 'append').map((n) => n.id)).toEqual(
      ['a', 'b', 'c', 'd']
    );
  });

  it('prepend：前插到现有数据之前（保持顺序）', () => {
    const prev = [makeNode('a'), makeNode('b')];
    const incoming = [makeNode('c'), makeNode('d')];
    expect(mergeNodesByMode(prev, incoming, 'prepend').map((n) => n.id)).toEqual(
      ['c', 'd', 'a', 'b']
    );
  });

  it('append：按 id 去重（新数据含旧 id 时保留旧位置）', () => {
    const prev = [makeNode('a'), makeNode('b'), makeNode('c')];
    const incoming = [makeNode('c'), makeNode('d')];
    expect(mergeNodesByMode(prev, incoming, 'append').map((n) => n.id)).toEqual(
      ['a', 'b', 'c', 'd']
    );
  });

  it('prepend：按 id 去重（新数据含旧 id 时保留新位置）', () => {
    const prev = [makeNode('b'), makeNode('c')];
    const incoming = [makeNode('a'), makeNode('b')];
    expect(mergeNodesByMode(prev, incoming, 'prepend').map((n) => n.id)).toEqual(
      ['a', 'b', 'c']
    );
  });

  it('空数组：append 空数组保持原列表', () => {
    const prev = [makeNode('a')];
    expect(mergeNodesByMode(prev, [], 'append').map((n) => n.id)).toEqual(['a']);
  });

  it('incoming 全部重复：结果与 prev 一致', () => {
    const prev = [makeNode('a'), makeNode('b')];
    expect(
      mergeNodesByMode(prev, [makeNode('b'), makeNode('a')], 'append').map(
        (n) => n.id
      )
    ).toEqual(['a', 'b']);
  });
});
