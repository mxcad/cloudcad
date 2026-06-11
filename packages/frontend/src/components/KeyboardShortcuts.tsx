import { useEffect } from 'react';
import { FileSystemNode } from '../types/filesystem';

interface KeyboardShortcutsProps {
  /** 当前选中的节点 */
  selectedNode?: FileSystemNode | null;
  /** 上传外部参照回调 */
  onUploadExternalReference?: (node: FileSystemNode) => void;
}

/**
 * 键盘快捷键组件（任务009 - 可选功能）
 *
 * 支持的快捷键：
 * - Ctrl/Cmd + U: 上传外部参照（仅当选择了 CAD 文件时生效）
 */
export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({
  selectedNode,
  onUploadExternalReference,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + U: 上传外部参照
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();

        // 检查是否有选中的 CAD 文件
        if (selectedNode && !selectedNode.isFolder && !selectedNode.isRoot) {
          const ext = selectedNode.extension?.toLowerCase();
          if (ext === '.dwg' || ext === '.dxf') {
            onUploadExternalReference?.(selectedNode);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, onUploadExternalReference]);

  return null;
};

export default KeyboardShortcuts;
