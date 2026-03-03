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

export { default as Button } from './Button';
export { default as Modal } from './Modal';
export { default as Toast } from './Toast';
export { default as ConfirmDialog } from './ConfirmDialog';
export { default as Pagination } from './Pagination';
