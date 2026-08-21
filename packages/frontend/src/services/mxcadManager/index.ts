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
 * MxCAD Manager — 组装层
 *
 * 此模块作为 mxcadManager 的统一入口，从各子模块重新导出所有公共 API，
 * 并将命令注册到 CommandRegistry 和 MxFun。
 */

// ==================== 从子模块重新导出 ====================

export { escapeHtml } from '@/utils/sanitize';

export {
  type CurrentFileInfo,
  type PendingImage,
  type UploadTargetInfo,
  type FileReadyInfo,
  CSS_CLASSES,
  DEFAULT_MESSAGES,
  FILE_UPLOAD_CONFIG,
  FILE_OPEN_RETRY_CONFIG,
  THUMBNAIL_CONFIG,
} from './mxcadTypes';

export { saveMxwebToNode, showSaveConfirmDialog } from './saveFile';
export type { SaveMxwebParams } from './saveFile';

export {
  checkThumbnail,
  uploadThumbnail,
  dataURLtoBlob,
  generateThumbnail,
} from './mxcadThumbnail';

export {
  uploadExtReferenceImage,
  checkExtReferenceImages,
  resolveExtReferenceUrl,
} from './mxcadExtRef';
export type { ExtRefUploadParams, ExtRefUploadResult } from './mxcadExtRef';

export { checkDuplicateFile, showDuplicateFileDialog } from './mxcadCheck';
export type { DuplicateCheckResult } from './mxcadCheck';

export {
  getFileInfo,
  formatEditorFileName,
  refreshFileName,
  setEditorFileName,
  restoreEditorTitle,
} from './mxcadHelpers';

export {
  mxcadManager,
  setNavigateFunction,
  setOpenedBackInfo,
  clearOpenedBackInfo,
} from './mxcadManager';

export { returnToCloudMapManagement } from './mxcadNavigation';

export {
  initThemeSync,
  initMxCADConfig,
} from './initMxCAD';

export {
  checkAndConfirmUnsavedChanges,
  confirmExitCollaborationIfNeeded,
  exitCurrentCollaboration,
  getCooperate,
} from './mxcadCollaboration';

export {
  openUploadedFile,
  waitForFileReady,
  openLibraryDrawing,
  openLibraryBlock,
  handlePublicUpload,
} from './mxcadOpenFile';

// ==================== 外部依赖 ====================

import 'mxcad-app/style';
import { MxFun } from 'mxdraw';
import { MxCpp } from 'mxcad';
import { useCADEditorStore } from '../../stores/useCADEditorStore';
import { useFileSystemStore } from '../../stores/fileSystemStore';
import { getFileInfo } from './mxcadHelpers';
import { exitCollaborationIfNeeded } from './mxcadCollaboration';
import { saveCurrentDrawingToBlob } from './mxcadHelpers';
import { getModified } from '../drawingSession';
import { bridgeEngineExportFileEvent } from './engineEventBridge';
import { CommandRegistry } from './cmd/types';
import {
  saveCurrentFile,
  createDefaultSaveDeps,
} from './saveFile';
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

// ==================== 私人空间 ID ====================

export function setPersonalSpaceId(personalSpaceId: string | null) {
  useFileSystemStore.getState().setPersonalSpaceId(personalSpaceId);
}

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
