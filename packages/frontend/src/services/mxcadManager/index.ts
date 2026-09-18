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
 * MxCAD Manager — 统一入口（纯 re-export 面）
 *
 * 只重新导出被外部消费的公共 API。编辑器启动副作用（命令注册、beforeunload、
 * 全局 Ctrl+S、引擎导出事件桥接、__openWebFile__ 命令）在 ./mxcadBootstrap，
 * 由下方 import 保持「引入 barrel 即启动编辑器」的既有契约。
 *
 * 模块内兄弟文件之间的依赖请直接引叶子模块（如 './mxcadHelpers'）；
 * 外部只需常量/类型的调用方走子路径（如 '@/services/mxcadManager/mxcadTypes'）。
 */

import './mxcadBootstrap';
import { useFileSystemStore } from '../../stores/fileSystemStore';

// ==================== 从子模块重新导出 ====================

export { CSS_CLASSES } from './mxcadTypes';

export { generateThumbnail, uploadThumbnail } from './mxcadThumbnail';

export { refreshFileName } from './mxcadHelpers';

export {
  mxcadManager,
  setNavigateFunction,
  setOpenedBackInfo,
} from './mxcadManager';

export { hasDocumentLoaded } from './mxcadInstanceManager';

export { returnToCloudMapManagement } from './mxcadNavigation';

export { initThemeSync, initMxCADConfig } from './initMxCAD';

export {
  checkAndConfirmUnsavedChanges,
  confirmExitCollaborationIfNeeded,
  exitCurrentCollaboration,
  getCooperate,
} from './mxcadCollaboration';

export {
  openUploadedFile,
  openLibraryDrawing,
  openLibraryBlock,
  waitForFileReady,
  handlePublicUpload,
  guardBeforeOpen,
} from './mxcadOpenFile';

// ==================== 私人空间 ID ====================

export function setPersonalSpaceId(personalSpaceId: string | null) {
  useFileSystemStore.getState().setPersonalSpaceId(personalSpaceId);
}
