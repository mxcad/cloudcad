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

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fileSystemControllerCreateProject,
  fileSystemControllerCreateFolder,
  fileSystemControllerUpdateNode,
  fileSystemControllerDeleteNode,
  fileSystemControllerRestoreNode,
  fileSystemControllerRestoreTrashItems,
  fileSystemControllerClearTrash,
} from '@/api-sdk';
import { trashApi } from '@/services/trashApi';
import { FileSystemNode } from '@/types/filesystem';
import { handleError } from '@/utils/errorHandler';

interface UseFileSystemCRUDProps {
  urlProjectId?: string;
  currentNode: FileSystemNode | null;
  loadData: () => void;
  showToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'danger' | 'warning' | 'info',
    confirmText?: string
  ) => void;
  selectedNodes: Set<string>;
  nodes: FileSystemNode[];
  clearSelection: () => void;
  isProjectTrashViewRef: React.MutableRefObject<boolean>;
  mode?: 'project' | 'personal-space';
}

const validateFolderName = (
  name: string
): { valid: boolean; error?: string } => {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return { valid: false, error: '名称不能为空' };
  }

  if (trimmedName.length > 255) {
    return { valid: false, error: '名称长度不能超过 255 个字符' };
  }

  const illegalChars = /[<>:"|?*/\\]/;
  if (illegalChars.test(trimmedName)) {
    return { valid: false, error: '名称包含非法字符：< > : " | ? * / \\' };
  }

  // eslint-disable-next-line no-control-regex
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
  isProjectTrashViewRef,
  mode = 'project',
}: UseFileSystemCRUDProps) => {
  const navigate = useNavigate();

  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [editingNode, setEditingNode] = useState<FileSystemNode | null>(null);
  const [folderName, setFolderName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

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
      await fileSystemControllerCreateFolder({
        path: { parentId: parentNodeId },
        body: { name: folderName.trim() } as any,
      });
      showToast('文件夹创建成功', 'success');
      setFolderName('');
      setShowCreateFolderModal(false);
      loadData();
      return null;
    } catch (error) {
      const appError = handleError(error, '创建文件夹', 'medium');
      showToast(appError.message, 'error');
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

      // TODO: Replace with SDK when backend adds renameNode endpoint
      await fileSystemControllerUpdateNode({ path: { nodeId: editingNode.id }, body: { name: finalName } as any });
      showToast('重命名成功', 'success');
      setFolderName('');
      setShowRenameModal(false);
      setEditingNode(null);
      loadData();
    } catch (error) {
      const appError = handleError(error, '重命名', 'medium');
      showToast(appError.message, 'error');
    }
  }, [folderName, editingNode, urlProjectId, loadData, showToast]);

  const handleDelete = useCallback(
    (node: FileSystemNode, permanently: boolean = false) => {
      if (isDeleting) {
        return;
      }

      let deleteMessage: string;

      if (permanently) {
        if (node.isRoot) {
          deleteMessage = `确定要彻底删除项目"${node.name}"吗？此操作将同时删除项目内的所有内容，且不可恢复。`;
        } else if (node.isFolder) {
          deleteMessage = `确定要彻底删除文件夹"${node.name}"吗？此操作将同时删除文件夹内的所有内容，且不可恢复。`;
        } else {
          deleteMessage = `确定要彻底删除文件"${node.name}"吗？此操作不可恢复。`;
        }
      } else {
        if (node.isRoot) {
          deleteMessage = `确定要将项目"${node.name}"移到回收站吗？可以在回收站中恢复。`;
        } else if (node.isFolder) {
          deleteMessage = `确定要将文件夹"${node.name}"移到回收站吗？可以在回收站中恢复。`;
        } else {
          deleteMessage = `确定要将文件"${node.name}"移到回收站吗？可以在回收站中恢复。`;
        }
      }

      showConfirm(
      permanently ? '确认彻底删除' : '确认删除',
      deleteMessage,
      async () => {
        try {
          setIsDeleting(true);

          // TODO: Replace with SDK when backend adds deleteProject / deleteNode with permanently param
          if (permanently) {
            if (node.isRoot) {
              await fileSystemControllerDeleteNode({ path: { nodeId: node.id }, query: { permanently: true } });
            } else {
              await fileSystemControllerDeleteNode({ path: { nodeId: node.id }, query: { permanently: true } });
            }
          } else {
            if (node.isRoot) {
              await fileSystemControllerDeleteNode({ path: { nodeId: node.id }, query: { permanently: false } });
            } else {
              await fileSystemControllerDeleteNode({ path: { nodeId: node.id }, query: { permanently: false } });
            }
          }

          showToast(permanently ? '已彻底删除' : '已移到回收站', 'success');

          if (isProjectTrashViewRef.current && permanently) {
            loadData();
          } else if (permanently && node.isRoot) {
            navigate(mode === 'personal-space' ? '/personal-space' : '/projects');
          } else {
            loadData();
          }
        } catch (error) {
          const appError = handleError(error, '删除', 'medium');
          showToast(appError.message, 'error');
        } finally {
          setIsDeleting(false);
        }
      },
      permanently ? 'danger' : 'warning',
      permanently ? '彻底删除' : '删除'
    );
    },
    [
      showConfirm,
      loadData,
      showToast,
      isDeleting,
      navigate,
      isProjectTrashViewRef,
    ]
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
                // TODO: Replace with SDK when backend adds deleteProject
                if (node?.isRoot) {
                  return fileSystemControllerDeleteNode({ path: { nodeId: node.id }, query: { permanently } });
                }
                return fileSystemControllerDeleteNode({ path: { nodeId: nodeId }, query: { permanently } });
              })
            );
            showToast(permanently ? '已彻底删除' : '已移到回收站', 'success');
            clearSelection();

            if (isProjectTrashViewRef.current && permanently) {
              loadData();
            } else if (
              permanently &&
              Array.from(selectedNodes).some((nodeId) => {
                const node = nodes.find((n) => n.id === nodeId);
                return node?.isRoot;
              })
            ) {
              navigate(mode === 'personal-space' ? '/personal-space' : '/projects');
            } else {
              loadData();
            }
          } catch (error) {
            const appError = handleError(error, '批量删除', 'medium');
            showToast(appError.message, 'error');
          }
        },
        permanently ? 'danger' : 'warning',
        permanently ? '彻底删除' : '删除'
      );
    },
    [
      selectedNodes,
      nodes,
      showConfirm,
      loadData,
      showToast,
      clearSelection,
      navigate,
      isProjectTrashViewRef,
    ]
  );

  const handleBatchRestore = useCallback(() => {
    if (selectedNodes.size === 0) {
      showToast('请先选择要恢复的项目', 'error');
      return;
    }

    showConfirm(
      '批量恢复',
      `确定要恢复选中的 ${selectedNodes.size} 个项目吗？`,
      async () => {
        try {
          await trashApi.restoreItems(Array.from(selectedNodes));
          showToast(`已恢复 ${selectedNodes.size} 个项目`, 'success');
          clearSelection();
          loadData();
        } catch (error) {
          let errorMessage = '批量恢复失败';
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          showToast(errorMessage, 'error');
        }
      },
      'warning',
      '恢复'
    );
  }, [selectedNodes, showConfirm, loadData, showToast, clearSelection]);

  const handleOpenRename = useCallback((node: FileSystemNode) => {
    setEditingNode(node);

    if (!node.isFolder && node.name) {
      const lastDotIndex = node.name.lastIndexOf('.');
      const nameWithoutExtension =
        lastDotIndex !== -1 ? node.name.substring(0, lastDotIndex) : node.name;
      setFolderName(nameWithoutExtension);
    } else {
      setFolderName(node.name);
    }

    setShowRenameModal(true);
  }, []);

  // 项目相关操作
  const handleCreateProject = useCallback(
    async (name: string, description?: string) => {
      try {
        await fileSystemControllerCreateProject({
          body: { name: name.trim(), description: description?.trim() } as any,
        });
        showToast('项目创建成功', 'success');
        loadData();
      } catch (error) {
        const appError = handleError(error, '创建项目', 'medium');
        showToast(appError.message, 'error');
        throw error;
      }
    },
    [loadData, showToast]
  );

  const handleUpdateProject = useCallback(
    async (id: string, data: { name?: string; description?: string }) => {
      try {
        // TODO: Replace with SDK when backend adds updateProject endpoint
        await fileSystemControllerUpdateNode({ path: { nodeId: id }, body: data as any });
        showToast('项目更新成功', 'success');
        loadData();
      } catch (error) {
        const appError = handleError(error, '更新项目', 'medium');
        showToast(appError.message, 'error');
        throw error;
      }
    },
    [loadData, showToast]
  );

  const handleDeleteProject = useCallback(
    async (id: string, name: string) => {
      const node: FileSystemNode = {
        id,
        name,
        isRoot: true,
        isFolder: true,
        parentId: void 0,
        ownerId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      handleDelete(node, false);
    },
    [handleDelete]
  );

  const handlePermanentlyDeleteProject = useCallback(
    async (id: string, name: string) => {
      const node: FileSystemNode = {
        id,
        name,
        isRoot: true,
        isFolder: true,
        parentId: void 0,
        ownerId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      handleDelete(node, true);
    },
    [handleDelete]
  );

  const handlePermanentlyDelete = useCallback(
    (node: FileSystemNode) => {
      handleDelete(node, true);
    },
    [handleDelete]
  );

  // 恢复节点
  const handleRestoreNode = useCallback(
    async (node: FileSystemNode) => {
      showConfirm(
        '确认恢复',
        `确定要恢复 "${node.name}" 吗？`,
        async () => {
          try {
            if (node.isRoot) {
              // TODO: Replace with SDK when backend adds restoreProject endpoint
              await fileSystemControllerRestoreTrashItems({ body: { itemIds: [node.id] } as any });
            } else {
              await fileSystemControllerRestoreNode({ path: { nodeId: node.id } });
            }
            showToast(`已恢复 "${node.name}"`, 'success');
            loadData();
          } catch (error) {
            const appError = handleError(error, '恢复节点', 'medium');
            showToast(appError.message, 'error');
          }
        },
        'warning'
      );
    },
    [showConfirm, showToast, loadData]
  );

  // 清空项目回收站
  const handleClearProjectTrash = useCallback(() => {
    if (!urlProjectId) {
      showToast('未选择项目', 'error');
      return;
    }

    showConfirm(
      '确认清空回收站',
      '确定要清空项目回收站吗？此操作将彻底删除所有已删除的文件和文件夹，且不可恢复。',
      async () => {
        try {
          // TODO: clearTrash in SDK has no projectId parameter — revisit filtering
          await fileSystemControllerClearTrash();
          showToast('项目回收站已清空', 'success');
          loadData();
        } catch (error) {
          const appError = handleError(error, '清空回收站', 'medium');
          showToast(appError.message, 'error');
        }
      },
      'danger'
    );
  }, [urlProjectId, showConfirm, showToast, loadData]);

  // 清空项目回收站（项目列表页的回收站）
  const handleClearTrash = useCallback(() => {
    showConfirm(
      '确认清空回收站',
      '确定要清空回收站吗？此操作将彻底删除所有已删除的项目，且不可恢复。',
      async () => {
        try {
          await trashApi.clear();
          showToast('回收站已清空', 'success');
          loadData();
        } catch (error) {
          const appError = handleError(error, '清空回收站', 'medium');
          showToast(appError.message, 'error');
        }
      },
      'danger'
    );
  }, [showConfirm, showToast, loadData]);

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
    handlePermanentlyDelete,
    handleBatchDelete,
    handleBatchRestore,
    handleOpenRename,
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    handlePermanentlyDeleteProject,
    handleRestoreNode,
    handleClearProjectTrash,
    handleClearTrash,
  };
};
