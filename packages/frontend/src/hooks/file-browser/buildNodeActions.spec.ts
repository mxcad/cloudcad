///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildNodeActions } from './buildNodeActions';
import {
  getAction,
  toBooleanMap,
} from '@/components/file-item/fileActionConfig';
import type { FileSystemNode } from '@/types/filesystem';

vi.mock('@/languages', () => ({ t: (m: string) => m }));

const fileNode = {
  id: 'f1',
  name: 'drawing.dwg',
  nodeType: 'FILE',
  isFolder: false,
  isRoot: false,
  extension: '.dwg',
} as FileSystemNode;

const folderNode = {
  id: 'd1',
  name: 'folder',
  nodeType: 'FOLDER',
  isFolder: true,
  isRoot: false,
} as FileSystemNode;

const rootNode = {
  id: 'p1',
  name: '项目A',
  nodeType: 'PROJECT',
  isFolder: true,
  isRoot: true,
} as FileSystemNode;

const fullCallbacks = {
  onDownload: () => {},
  onShowVersionHistory: () => {},
  onEdit: () => {},
  onShowMembers: () => {},
  onShowRoles: () => {},
  onShowOperationHistory: () => {},
  onShare: () => {},
  onMove: () => {},
  onCopy: () => {},
  onRestore: () => {},
  onPermanentlyDelete: () => {},
  onDeleteNode: () => {},
  onOpen: () => {},
  onOpenInNewTab: () => {},
  onOpenFileLocation: () => {},
  onCopyClipboard: () => {},
  onCut: () => {},
  onFolderDownload: () => {},
  onCopyPath: () => {},
};

const fullPermissions = {
  canDownload: true,
  canEdit: true,
  canDelete: true,
  canShare: true,
  canViewVersionHistory: true,
  canManageExternalReference: true,
  canMove: true,
  canCopy: true,
  canCreate: true,
  canManageTrash: true,
};

function actionTypes(result: ReturnType<typeof buildNodeActions>) {
  return [...result.main, ...result.destructive].map((a) => a.type);
}

describe('buildNodeActions — 权限 → 动作分组全枚举', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('普通文件节点（非根、非回收站）', () => {
    it('全权限全回调：动作分组含主操作与危险操作', () => {
      const result = buildNodeActions({
        node: fileNode,
        isTrash: false,
        permissions: fullPermissions,
        callbacks: fullCallbacks,
      });
      const types = actionTypes(result);
      expect(types).toContain('download');
      expect(types).toContain('view_version_history');
      expect(types).toContain('rename');
      expect(types).toContain('move');
      expect(types).toContain('copy');
      expect(types).toContain('share');
      expect(types).toContain('copy_clipboard');
      expect(types).toContain('cut');
      expect(types).toContain('delete');
      expect(result.main.length + result.destructive.length).toBe(types.length);
      // 危险操作归组
      expect(result.destructive.map((a) => a.type)).toEqual(['delete']);
      // 非根节点不出现项目级动作
      expect(types).not.toContain('edit');
      expect(types).not.toContain('show_members');
      expect(types).not.toContain('show_roles');
    });

    it('权限位 false：对应动作消失（canDelete=false → 无 delete；canMove=false → 无 cut/move）', () => {
      const result = buildNodeActions({
        node: fileNode,
        isTrash: false,
        permissions: {
          ...fullPermissions,
          canDelete: false,
          canMove: false,
        },
        // move/copy 动作仅受回调门控（权限门控由外壳组装回调时处理，与 FileSystemContent 一致）
        callbacks: { ...fullCallbacks, onMove: undefined, onCopy: undefined },
      });
      const types = actionTypes(result);
      expect(types).not.toContain('delete');
      expect(types).not.toContain('cut');
      expect(types).not.toContain('move');
      // canCopy 仍 true → copy_clipboard 保留
      expect(types).toContain('copy_clipboard');
    });

    it('回调未提供：动作不显示（onShare 缺省 → 无 share）', () => {
      const result = buildNodeActions({
        node: fileNode,
        isTrash: false,
        permissions: fullPermissions,
        callbacks: { ...fullCallbacks, onShare: undefined },
      });
      expect(actionTypes(result)).not.toContain('share');
    });

    it('excludeMoveCopy（侧边栏）：move/copy 消失', () => {
      const result = buildNodeActions({
        node: fileNode,
        isTrash: false,
        permissions: fullPermissions,
        callbacks: fullCallbacks,
        excludeMoveCopy: true,
      });
      const types = actionTypes(result);
      expect(types).not.toContain('move');
      expect(types).not.toContain('copy');
    });

    it('文件夹：下载消失、文件夹打包下载出现（onFolderDownload 门控）', () => {
      const result = buildNodeActions({
        node: folderNode,
        isTrash: false,
        permissions: fullPermissions,
        callbacks: fullCallbacks,
      });
      const types = actionTypes(result);
      expect(types).not.toContain('download');
      expect(types).toContain('batch_download_folder');
      expect(types).toContain('rename');
    });

    it('非 CAD 文件：版本历史不出现', () => {
      const plainNode = { ...fileNode, name: 'doc.pdf', extension: '.pdf' };
      const result = buildNodeActions({
        node: plainNode,
        isTrash: false,
        permissions: fullPermissions,
        callbacks: fullCallbacks,
      });
      expect(actionTypes(result)).not.toContain('view_version_history');
    });

    it('搜索模式：打开所在位置/复制路径出现（onOpenFileLocation/onCopyPath 门控）', () => {
      const result = buildNodeActions({
        node: fileNode,
        isTrash: false,
        isSearchResult: true,
        permissions: fullPermissions,
        callbacks: fullCallbacks,
      });
      const types = actionTypes(result);
      expect(types).toContain('open_file_location');
      expect(types).toContain('copy_path');
    });

    it('非搜索模式：open_file_location/copy_path 不出现', () => {
      const result = buildNodeActions({
        node: fileNode,
        isTrash: false,
        permissions: fullPermissions,
        callbacks: fullCallbacks,
      });
      const types = actionTypes(result);
      expect(types).not.toContain('open_file_location');
      expect(types).not.toContain('copy_path');
    });
  });

  describe('项目根节点（isRoot）', () => {
    it('出现 edit/show_members/show_roles/show_operation_history（canEdit/canManageRoles 门控）', () => {
      const result = buildNodeActions({
        node: rootNode,
        isTrash: false,
        permissions: {
          ...fullPermissions,
          canEdit: true,
          canDelete: true,
          canManageTrash: false,
        },
        callbacks: fullCallbacks,
      });
      const types = actionTypes(result);
      expect(types).toContain('edit');
      expect(types).toContain('show_members');
      expect(types).toContain('show_roles');
      expect(types).toContain('show_operation_history');
      expect(types).toContain('delete');
      expect(types).not.toContain('rename');
    });

    it('操作历史回调未提供：入口不出现（onShowOperationHistory 缺省 → 无 show_operation_history）', () => {
      const result = buildNodeActions({
        node: rootNode,
        isTrash: false,
        permissions: { ...fullPermissions, canEdit: true, canDelete: true },
        callbacks: { ...fullCallbacks, onShowOperationHistory: undefined },
      });
      expect(actionTypes(result)).not.toContain('show_operation_history');
    });

    it('无项目权限：编辑/删除不出现', () => {
      const result = buildNodeActions({
        node: rootNode,
        isTrash: false,
        permissions: { ...fullPermissions, canEdit: false, canDelete: false },
        callbacks: fullCallbacks,
      });
      const types = actionTypes(result);
      expect(types).not.toContain('edit');
      expect(types).not.toContain('delete');
    });
  });

  describe('回收站视图（isTrash）', () => {
    it('只显示 restore 与 permanently_delete（canManageTrash 门控）', () => {
      const result = buildNodeActions({
        node: fileNode,
        isTrash: true,
        permissions: { ...fullPermissions, canManageTrash: true },
        callbacks: fullCallbacks,
      });
      const types = actionTypes(result);
      expect(types).toEqual(['restore', 'permanently_delete']);
      expect(result.main.map((a) => a.type)).toEqual(['restore']);
      expect(result.destructive.map((a) => a.type)).toEqual([
        'permanently_delete',
      ]);
    });

    it('canManageTrash=false：回收站动作全部消失', () => {
      const result = buildNodeActions({
        node: fileNode,
        isTrash: true,
        permissions: { ...fullPermissions, canManageTrash: false },
        callbacks: fullCallbacks,
      });
      expect(actionTypes(result)).toEqual([]);
    });
  });

  describe('动作 run 分发（注册表统一执行）', () => {
    const e = new MouseEvent('click') as unknown as React.MouseEvent;

    it('show_operation_history → onShowOperationHistory 被调用', () => {
      const cb = vi.fn();
      getAction('show_operation_history').run({
        node: rootNode,
        e,
        callbacks: { onShowOperationHistory: cb },
      });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('事件型回调（edit/show_members/show_roles）收到合成事件', () => {
      const cb = vi.fn();
      getAction('edit').run({
        node: rootNode,
        e,
        callbacks: { onEdit: cb },
      });
      expect(cb).toHaveBeenCalledWith(e);
    });

    it('节点型回调（download/delete）收到 node', () => {
      const cb = vi.fn();
      getAction('download').run({
        node: fileNode,
        e,
        callbacks: { onDownload: cb },
      });
      expect(cb).toHaveBeenCalledWith(fileNode);
    });

    it('move/copy/restore 节点型分发', () => {
      const moveCb = vi.fn();
      const copyCb = vi.fn();
      const restoreCb = vi.fn();
      getAction('move').run({
        node: fileNode,
        e,
        callbacks: { onMove: moveCb },
      });
      getAction('copy').run({
        node: fileNode,
        e,
        callbacks: { onCopy: copyCb },
      });
      getAction('restore').run({
        node: fileNode,
        e,
        callbacks: { onRestore: restoreCb },
      });
      expect(moveCb).toHaveBeenCalledWith(fileNode);
      expect(copyCb).toHaveBeenCalledWith(fileNode);
      expect(restoreCb).toHaveBeenCalledWith(fileNode);
    });

    it('upload_external_reference 事件型分发（FileItem 注入 onUploadExternalReference）', () => {
      const cb = vi.fn();
      getAction('upload_external_reference').run({
        node: fileNode,
        e,
        callbacks: { onUploadExternalReference: cb },
      });
      expect(cb).toHaveBeenCalledWith(e);
    });

    it('upload_external_reference 可见性同时受权限位与回调可用性门控', () => {
      const result = buildNodeActions({
        node: fileNode,
        isTrash: false,
        permissions: fullPermissions, // canManageExternalReference: true
        callbacks: fullCallbacks, // 不含 onUploadExternalReference
      });
      expect(actionTypes(result)).not.toContain('upload_external_reference');
    });

    it('回调未提供时静默（不抛错）', () => {
      expect(() =>
        getAction('show_operation_history').run({
          node: rootNode,
          e,
          callbacks: {},
        })
      ).not.toThrow();
    });
  });
});

describe('toBooleanMap — overrides 优先级（b1d6cb75 回归钉死）', () => {
  it('overrides 应覆盖 callbacks 自动推导：onDeleteNode undefined 时 override 兜底生效', () => {
    // 复现侧边栏场景：onDelete 存在、onDeleteNode 未传入。调用方经 override 提供
    // onDeleteNode: !!onDeleteNode || !!onDelete，必须生效让「更多菜单」出现删除项。
    const result = toBooleanMap(
      { onDelete: () => {} } as never,
      { onDeleteNode: true }
    );
    expect(result.onDeleteNode).toBe(true);
  });

  it('未提供 override 时回退 callbacks 自动推导', () => {
    const result = toBooleanMap({
      onDownload: () => {},
    } as never);
    // onDownload 在 CHECK_KEYS，由 callbacks 存在性推导
    expect(result.onDownload).toBe(true);
    // 未提供 onDeleteNode → false
    expect(result.onDeleteNode).toBe(false);
  });
});
