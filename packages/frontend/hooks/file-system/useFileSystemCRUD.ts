import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi } from '../../services/projectsApi';
import { trashApi } from '../../services/trashApi';
import { FileSystemNode } from '../../types/filesystem';
import { handleError } from '../../utils/errorHandler';

interface UseFileSystemCRUDProps {
  urlProjectId: string;
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
      const errorMessage = (error as Error).message || '创建文件夹失败';
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
      const errorMessage = (error as Error).message || '重命名失败';
      showToast(errorMessage, 'error');
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

            if (permanently) {
              if (node.isRoot) {
                await projectsApi.delete(node.id, true);
              } else {
                await projectsApi.deleteNode(node.id, true);
              }
            } else {
              if (node.isRoot) {
                await projectsApi.delete(node.id, false);
              } else {
                await projectsApi.deleteNode(node.id, false);
              }
            }

            showToast(permanently ? '已彻底删除' : '已移到回收站', 'success');

            if (isProjectTrashViewRef.current && permanently) {
              loadData();
            } else if (permanently && node.isRoot) {
              navigate('/projects');
            } else {
              loadData();
            }
          } catch (error) {
            let errorMessage = '删除失败';
            if (error instanceof Error) {
              errorMessage = error.message;
            } else if (
              typeof error === 'object' &&
              error !== null &&
              'response' in error
            ) {
              const err = error as {
                response?: { data?: { message?: string } };
              };
              errorMessage = err.response?.data?.message || errorMessage;
            }
            showToast(errorMessage, 'error');
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
                if (node?.isRoot) {
                  return projectsApi.delete(node.id, permanently);
                }
                return projectsApi.deleteNode(nodeId, permanently);
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
              navigate('/projects');
            } else {
              loadData();
            }
          } catch (error) {
            let errorMessage = '批量删除失败';
            if (error instanceof Error) {
              errorMessage = error.message;
            } else if (
              typeof error === 'object' &&
              error !== null &&
              'response' in error
            ) {
              const err = error as {
                response?: { data?: { message?: string } };
              };
              errorMessage = err.response?.data?.message || errorMessage;
            }
            showToast(errorMessage, 'error');
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
          } else if (
            typeof error === 'object' &&
            error !== null &&
            'response' in error
          ) {
            const err = error as {
              response?: { data?: { message?: string } };
            };
            errorMessage = err.response?.data?.message || errorMessage;
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
        await projectsApi.create({
          name: name.trim(),
          description: description?.trim(),
        });
        showToast('项目创建成功', 'success');
        loadData();
      } catch (error) {
        let errorMessage = '创建项目失败';
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (
          typeof error === 'object' &&
          error !== null &&
          'response' in error
        ) {
          const err = error as { response?: { data?: { message?: string } } };
          errorMessage = err.response?.data?.message || errorMessage;
        }
        showToast(errorMessage, 'error');
        throw error;
      }
    },
    [loadData, showToast]
  );

  const handleUpdateProject = useCallback(
    async (id: string, data: { name?: string; description?: string }) => {
      try {
        await projectsApi.update(id, data);
        showToast('项目更新成功', 'success');
        loadData();
      } catch (error) {
        let errorMessage = '更新项目失败';
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (
          typeof error === 'object' &&
          error !== null &&
          'response' in error
        ) {
          const err = error as { response?: { data?: { message?: string } } };
          errorMessage = err.response?.data?.message || errorMessage;
        }
        showToast(errorMessage, 'error');
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
        parentId: null,
        ownerId: '',
        createdAt: new Date(),
        updatedAt: new Date(),
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
        parentId: null,
        ownerId: '',
        createdAt: new Date(),
        updatedAt: new Date(),
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
              await projectsApi.restoreProject(node.id);
            } else {
              await projectsApi.restoreNode(node.id);
            }
            showToast(`已恢复 "${node.name}"`, 'success');
            loadData();
          } catch (error) {
            handleError(error, showToast, '恢复失败');
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
          await projectsApi.clearProjectTrash(urlProjectId);
          showToast('项目回收站已清空', 'success');
          loadData();
        } catch (error) {
          handleError(error, showToast, '清空回收站失败');
        }
      },
      'danger'
    );
  }, [urlProjectId, showConfirm, showToast, loadData]);

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
  };
};
