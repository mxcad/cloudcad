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
 * UI 组件导出索引
 *
 * 统一导出所有 UI 组件，方便从单个文件导入
 */

export {
  TruncateText,
  FileNameText,
  PathText,
  DescriptionText,
} from './TruncateText';
export type { TruncateTextProps, TruncateMode } from './TruncateText';

export { Button } from './Button';
export { Modal } from './Modal';
export { Toast } from './Toast';
export { ConfirmDialog } from './ConfirmDialog';
export { Pagination } from './Pagination';
export { Tooltip, SimpleTooltip } from './Tooltip';
export type { TooltipProps, TooltipPosition, TooltipTrigger, SimpleTooltipProps } from './Tooltip';
