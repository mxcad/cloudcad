import { useState, useCallback } from 'react';
import { projectsApi } from '../../services/apiService';
import { FileSystemNode } from '../../types/filesystem';
import { logger } from '../../utils/logger';
import { handleError } from '../../utils/errorHandler';

interface UseFileSystemCRUDProps {
  urlProjectId: string;
  currentNode: FileSystemNode | null;
  loadData: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  showConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning' | 'info') => void;
  selectedNodes: Set<string>;
  nodes: FileSystemNode[];
  clearSelection: () => void;
}

const validateFolderName = (name: string): { valid: boolean; error?: string } => {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return { valid: false, error: '名称不能为空' };
  }

  if (trimmedName.length > 255) {
    return { valid: false, error: '名称长度不能超过 255 个字符' };
  }

  const illegalChars = /[<>:"|?*\/\\]/;
  if (illegalChars.test(trimmedName)) {
    return { valid: false, error: '名称包含非法字符：< > : " | ? * / \\' };
  }

  if (/[\x00-\x1F\x7F]/u.test(trimmedName)) {
    return { valid: false, error: '名称包含非法字符' };
  }

  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedNames.test(trimmedName)) {
    return { valid: false, error: '该名称为系统保留名称' };
  }

  if (trimmedName.startsWith('.') || trimmedName.endsWith('.')) {
    return { valid: false, error: '名称不能以点开头或结尾' };
  }

  return { valid: true };
};

export const useFileSystemCRUD = ({
  urlProjectId,
  currentNode,
  loadData,
  showToast,
  showConfirm,
  selectedNodes,
  nodes,
  clearSelection,
}: UseFileSystemCRUDProps) => {
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [editingNode, setEditingNode] = useState<FileSystemNode | null>(null);
  const [folderName, setFolderName] = useState('');

  const handleCreateFolder = useCallback(async () => {
    if (!urlProjectId) {
      showToast('项目 ID 不能为空', 'error');
      return null;
    }

    const validation = validateFolderName(folderName);
    if (!validation.valid) {
      showToast(validation.error || '文件夹名称无效', 'error');
      return null;
    }

    const parentNodeId = currentNode?.id || urlProjectId;

    try {
      const response = await projectsApi.createFolder(parentNodeId, {
        name: folderName.trim(),
      });
      const newFolder = response.data;
      showToast('文件夹创建成功', 'success');
      setFolderName('');
      setShowCreateFolderModal(false);
      loadData();
      return newFolder;
    } catch (error) {
      let errorMessage = '创建文件夹失败';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null && 'response' in error) {
        const err = error as { response?: { data?: { message?: string } } };
        errorMessage = err.response?.data?.message || errorMessage;
      }
      showToast(errorMessage, 'error');
      return null;
    }
  }, [folderName, urlProjectId, currentNode, loadData, showToast]);

  const handleRename = useCallback(async () => {
    if (!editingNode || !urlProjectId) {
      showToast('参数错误', 'error');
      return;
    }

    const validation = validateFolderName(folderName);
    if (!validation.valid) {
      showToast(validation.error || '名称无效', 'error');
      return;
    }

    try {
      let finalName = folderName.trim();

      if (!editingNode.isFolder && editingNode.name) {
        const lastDotIndex = editingNode.name.lastIndexOf('.');
        if (lastDotIndex !== -1) {
          const originalExtension = editingNode.name.substring(lastDotIndex);
          finalName = `${finalName}${originalExtension}`;
        }
      }

      await projectsApi.updateNode(editingNode.id, { name: finalName });
      showToast('重命名成功', 'success');
      setFolderName('');
      setShowRenameModal(false);
      setEditingNode(null);
      loadData();
    } catch (error) {
      let errorMessage = '重命名失败';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null && 'response' in error) {
        const err = error as { response?: { data?: { message?: string } } };
        errorMessage = err.response?.data?.message || errorMessage;
      }
      showToast(errorMessage, 'error');
    }
  }, [folderName, editingNode, urlProjectId, loadData, showToast]);

  const handleDelete = useCallback(
    (node: FileSystemNode, permanently: boolean = false) => {
      let deleteMessage: string;
      let deleteApi: Promise<unknown>;

      if (permanently) {
        if (node.isRoot) {
          deleteMessage = `确定要彻底删除项目"${node.name}"吗？此操作将同时删除项目内的所有内容，且不可恢复。`;
          deleteApi = projectsApi.delete(node.id);
        } else if (node.isFolder) {
          deleteMessage = `确定要彻底删除文件夹"${node.name}"吗？此操作将同时删除文件夹内的所有内容，且不可恢复。`;
          deleteApi = projectsApi.deleteNode(node.id);
        } else {
          deleteMessage = `确定要彻底删除文件"${node.name}"吗？此操作不可恢复。`;
          deleteApi = projectsApi.deleteNode(node.id);
        }
      } else {
        if (node.isRoot) {
          deleteMessage = `确定要将项目"${node.name}"移到回收站吗？可以在回收站中恢复。`;
          deleteApi = projectsApi.delete(node.id);
        } else if (node.isFolder) {
          deleteMessage = `确定要将文件夹"${node.name}"移到回收站吗？可以在回收站中恢复。`;
          deleteApi = projectsApi.deleteNode(node.id);
        } else {
          deleteMessage = `确定要将文件"${node.name}"移到回收站吗？可以在回收站中恢复。`;
          deleteApi = projectsApi.deleteNode(node.id);
        }
      }

      showConfirm(
        permanently ? '确认彻底删除' : '确认删除',
        deleteMessage,
        async () => {
          try {
            await deleteApi;
            showToast(permanently ? '已彻底删除' : '已移到回收站', 'success');
            loadData();
          } catch (error) {
            let errorMessage = '删除失败';
            if (error instanceof Error) {
              errorMessage = error.message;
            } else if (typeof error === 'object' && error !== null && 'response' in error) {
              const err = error as { response?: { data?: { message?: string } } };
              errorMessage = err.response?.data?.message || errorMessage;
            }
            showToast(errorMessage, 'error');
          }
        },
        permanently ? 'danger' : 'warning'
      );
    },
    [showConfirm, loadData, showToast]
  );

  const handleBatchDelete = useCallback(
    (permanently: boolean = false) => {
      if (selectedNodes.size === 0) {
        showToast('请先选择要删除的项目', 'error');
        return;
      }

      const message = permanently
        ? `确定要彻底删除选中的 ${selectedNodes.size} 个项目吗？此操作不可恢复。`
        : `确定要将选中的 ${selectedNodes.size} 个项目移到回收站吗？`;

      showConfirm(
        permanently ? '确认彻底删除' : '批量删除',
        message,
        async () => {
          try {
            await Promise.all(
              Array.from(selectedNodes).map((nodeId: string) => {
                const node = nodes.find((n) => n.id === nodeId);
                if (node?.isRoot) {
                  return projectsApi.delete(node.id);
                }
                return projectsApi.deleteNode(node.id);
              })
            );
            showToast(permanently ? '已彻底删除' : '已移到回收站', 'success');
            clearSelection();
            loadData();
          } catch (error) {
            let errorMessage = '批量删除失败';
            if (error instanceof Error) {
              errorMessage = error.message;
            } else if (typeof error === 'object' && error !== null && 'response' in error) {
              const err = error as { response?: { data?: { message?: string } } };
              errorMessage = err.response?.data?.message || errorMessage;
            }
            showToast(errorMessage, 'error');
          }
        },
        permanently ? 'danger' : 'warning'
      );
    },
    [selectedNodes, nodes, showConfirm, loadData, showToast, clearSelection]
  );

  const handleOpenRename = useCallback((node: FileSystemNode) => {
    setEditingNode(node);

    if (!node.isFolder && node.name) {
      const lastDotIndex = node.name.lastIndexOf('.');
      const nameWithoutExtension = lastDotIndex !== -1 ? node.name.substring(0, lastDotIndex) : node.name;
      setFolderName(nameWithoutExtension);
    } else {
      setFolderName(node.name);
    }

    setShowRenameModal(true);
  }, []);

  return {
    showCreateFolderModal,
    setShowCreateFolderModal,
    showRenameModal,
    setShowRenameModal,
    editingNode,
    setEditingNode,
    folderName,
    setFolderName,
    handleCreateFolder,
    handleRename,
    handleDelete,
    handleBatchDelete,
    handleOpenRename,
  };
};