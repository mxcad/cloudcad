import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VersionHistoryModal } from './VersionHistoryModal';
import type { MxLogEntryDto } from '@/api-sdk';
import type { FileSystemNode } from '../../types/filesystem';

const node = {
  id: 'node-1',
  name: 'drawing.dwg',
  nodeType: 'FILE',
  isFolder: false,
  isRoot: false,
  parentId: 'project-1',
  path: '202608/node-1/abc123.dwg.mxweb',
} as FileSystemNode;

function makeEntry(overrides: Partial<MxLogEntryDto> = {}): MxLogEntryDto {
  return {
    revision: 2,
    author: 'svn-user',
    date: new Date().toISOString(),
    message: 'Save: drawing.dwg - 修改了标题',
    userName: '张三',
    ...overrides,
  } as MxLogEntryDto;
}

function renderModal(entries: MxLogEntryDto[]) {
  return render(
    <VersionHistoryModal
      isOpen
      node={node}
      entries={entries}
      totalCount={entries.length}
      loading={false}
      error={null}
      openingRevision={null}
      openingVersionError={null}
      onClose={vi.fn()}
      onOpenVersion={vi.fn()}
    />
  );
}

describe('VersionHistoryModal 版本说明展示', () => {
  it('单行说明正常展示', () => {
    renderModal([makeEntry()]);
    expect(screen.getByText(/修改了标题/)).toBeTruthy();
  });

  it('多行说明（含隔行空行）完整展示（回归：旧正则不匹配换行导致整条丢失）', () => {
    renderModal([
      makeEntry({ message: 'Save: drawing.dwg - 第一行\n\n第三行' }),
    ]);
    const note = screen.getByText(/第一行/);
    expect(note.textContent).toContain('第一行');
    expect(note.textContent).toContain('第三行');
  });

  it('说明仅含空白时不展示说明列', () => {
    renderModal([makeEntry({ message: 'Save: drawing.dwg -   \n  ' })]);
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it('无说明的提交（Save: 文件名）不展示说明列', () => {
    renderModal([makeEntry({ message: 'Save: drawing.dwg' })]);
    expect(screen.queryByText(/·/)).toBeNull();
  });
});
