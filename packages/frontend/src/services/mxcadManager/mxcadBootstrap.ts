///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * MxCAD 编辑器启动副作用（纯副作用模块，无导出）
 *
 * 命令注册、beforeunload、全局 Ctrl+S、引擎导出事件桥接、__openWebFile__
 * 命令。由 ./index.ts 顶部 import 引入，保持「引入 barrel 即启动编辑器」的
 * 既有契约。
 */

import 'mxcad-app/style';
import { MxFun } from 'mxdraw';
import { MxCpp } from 'mxcad';
import { useCADEditorStore } from '../../stores/useCADEditorStore';
import { getFileInfo, saveCurrentDrawingToBlob } from './mxcadHelpers';
import { exitCollaborationIfNeeded } from './mxcadCollaboration';
import { getModified } from '../drawingSession';
import { bridgeEngineExportFileEvent } from './engineEventBridge';
import { CommandRegistry } from './cmd/types';
import { saveCurrentFile, createDefaultSaveDeps } from './saveFile';
import type { CurrentFileInfo } from './mxcadTypes';
import './cmd/index';

// ==================== 模块级命令自动桥接 ====================

function buildContext() {
  const fileInfo = getFileInfo();
  const deps = createDefaultSaveDeps();
  return {
    fileName: fileInfo?.name || 'untitled',
    fileInfo,
    saveDrawingToBlob: saveCurrentDrawingToBlob,
    saveFile: (fi: CurrentFileInfo) => saveCurrentFile(fi, deps),
    sdk: deps.sdk,
    permissions: deps.permissions,
  };
}

for (const cmd of CommandRegistry.getAll()) {
  MxFun.addCommand(cmd.name, async () => {
    await CommandRegistry.execute(cmd.name, buildContext());
  });
}

// ==================== beforeunload 处理器 ====================

const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
  exitCollaborationIfNeeded();
  if (useCADEditorStore.getState().isLeavingPage) {
    e.returnValue = '';
    return;
  }
  if (getModified()) {
    e.preventDefault();
    e.returnValue = '';
  }
};

function setupBeforeUnloadHandler(): void {
  window.addEventListener('beforeunload', beforeUnloadHandler);
}

setupBeforeUnloadHandler();

// ==================== 引擎窗口事件 → 类型化 bus 桥接 ====================
// mxcad-export-file 由 CAD 引擎（外部黑盒）以 window CustomEvent 派发，
// 经 bridgeEngineExportFileEvent 桥接进 ADR-0039 类型化 bus（ADR-0040）。

const unbindEngineEventBridge = bridgeEngineExportFileEvent();

// ==================== 键盘快捷键 ====================

document.addEventListener(
  'keydown',
  (e) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      e.stopImmediatePropagation();
      MxFun.sendStringToExecute('Mx_Save');
    }
  },
  true
);

// ==================== __openWebFile__ 内部命令 ====================

MxFun.addCommand(
  '__openWebFile__',
  (args: Parameters<import('mxcad').McObject['openWebFile']>) => {
    const mxcad = MxCpp.getCurrentMxCAD();
    if (!mxcad) return;
    mxcad.openWebFile(...args);
  }
);
