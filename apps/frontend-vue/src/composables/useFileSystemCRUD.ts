import { ref, computed, watch, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { projectsApi } from '@/services/projectsApi';
import { trashApi } from '@/services/trashApi';
import type { FileSystemNode } from './useFileSystemData';

export interface UseFileSystemCRUDOptions {
  urlProjectId?: string;
  currentNode: FileSystemNode | null;
  loadData: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
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
  isProjectTrashViewRef: { value: boolean };
  mode?: 'project' | 'personal-space';
}

function validateFolderName(name: string): { valid: boolean; error?: string } {
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
}

export function useFileSystemCRUD(options: UseFileSystemCRUDOptions) {
  const router = useRouter();

  const showCreateFolderModal = ref(false);
  const showRenameModal = ref(false);
  const editingNode = ref<FileSystemNode | null>(null);
  const folderName = ref('');
  const isDeleting = ref(false);

  const handleCreateFolder = async (): Promise<FileSystemNode | null> => {
    const urlProjectId = options.urlProjectId;

    if (!urlProjectId) {
      options.showToast('项目 ID 不能为空', 'error');
      return null;
    }

    const validation = validateFolderName(folderName.value);
    if (!validation.valid) {
      options.showToast(validation.error || '文件夹名称无效', 'error');
      return null;
    }

    const parentNodeId = options.currentNode?.id || urlProjectId;

    try {
      const response = await projectsApi.createFolder(parentNodeId, {
        name: folderName.value.trim(),
      });
      const newFolder = response.data;
      options.showToast('文件夹创建成功', 'success');
      folderName.value = '';
      showCreateFolderModal.value = false;
      options.loadData();
      return newFolder;
    } catch (error) {
      const errorMessage = (error as Error).message || '创建文件夹失败';
      options.showToast(errorMessage, 'error');
      return null;
    }
  };

  const handleRename = async (): Promise<void> => {
    const urlProjectId = options.urlProjectId;

    if (!editingNode.value || !urlProjectId) {
      options.showToast('参数错误', 'error');
      return;
    }

    const validation = validateFolderName(folderName.value);
    if (!validation.valid) {
      options.showToast(validation.error || '名称无效', 'error');
      return;
    }

    try {
      let finalName = folderName.value.trim();

      if (!editingNode.value.isFolder && editingNode.value.name) {
        const lastDotIndex = editingNode.value.name.lastIndexOf('.');
        if (lastDotIndex !== -1) {
          const originalExtension = editingNode.value.name.substring(lastDotIndex);
          finalName = `${finalName}${originalExtension}`;
        }
      }

      await projectsApi.updateNode(editingNode.value.id, { name: finalName });
      options.showToast('重命名成功', 'success');
      folderName.value = '';
      showRenameModal.value = false;
      editingNode.value = null;
      options.loadData();
    } catch (error) {
      const errorMessage = (error as Error).message || '重命名失败';
      options.showToast(errorMessage, 'error');
    }
  };

  const handleDelete = (node: FileSystemNode, permanently: boolean = false): void => {
    if (isDeleting.value) {
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

    options.showConfirm(
      permanently ? '确认彻底删除' : '确认删除',
      deleteMessage,
      async () => {
        try {
          isDeleting.value = true;

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

          options.showToast(permanently ? '已彻底删除' : '已移到回收站', 'success');

          if (options.isProjectTrashViewRef.value && permanently) {
            options.loadData();
          } else if (permanently && node.isRoot) {
            router.push(options.mode === 'personal-space' ? '/personal-space' : '/projects');
          } else {
            options.loadData();
          }
        } catch (error) {
          let errorMessage = '删除失败';
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          options.showToast(errorMessage, 'error');
        } finally {
          isDeleting.value = false;
        }
      },
      permanently ? 'danger' : 'warning',
      permanently ? '彻底删除' : '删除'
    );
  };

  const handleBatchDelete = (permanently: boolean = false): void => {
    if (options.selectedNodes.size === 0) {
      options.showToast('请先选择要删除的项目', 'error');
      return;
    }

    const message = permanently
      ? `确定要彻底删除选中的 ${options.selectedNodes.size} 个项目吗？此操作不可恢复。`
      : `确定要将选中的 ${options.selectedNodes.size} 个项目移到回收站吗？`;

    options.showConfirm(
      permanently ? '确认彻底删除' : '批量删除',
      message,
      async () => {
        try {
          await Promise.all(
            Array.from(options.selectedNodes).map((nodeId: string) => {
              const node = options.nodes.find((n) => n.id === nodeId);
              if (node?.isRoot) {
                return projectsApi.delete(node.id, permanently);
              }
              return projectsApi.deleteNode(nodeId, permanently);
            })
          );
          options.showToast(permanently ? '已彻底删除' : '已移到回收站', 'success');
          options.clearSelection();

          if (options.isProjectTrashViewRef.value && permanently) {
            options.loadData();
          } else if (
            permanently &&
            Array.from(options.selectedNodes).some((nodeId) => {
              const node = options.nodes.find((n) => n.id === nodeId);
              return node?.isRoot;
            })
          ) {
            router.push(options.mode === 'personal-space' ? '/personal-space' : '/projects');
          } else {
            options.loadData();
          }
        } catch (error) {
          let errorMessage = '批量删除失败';
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          options.showToast(errorMessage, 'error');
        }
      },
      permanently ? 'danger' : 'warning',
      permanently ? '彻底删除' : '删除'
    );
  };

  const handleBatchRestore = (): void => {
    if (options.selectedNodes.size === 0) {
      options.showToast('请先选择要恢复的项目', 'error');
      return;
    }

    options.showConfirm(
      '批量恢复',
      `确定要恢复选中的 ${options.selectedNodes.size} 个项目吗？`,
      async () => {
        try {
          await trashApi.restoreItems(Array.from(options.selectedNodes));
          options.showToast(`已恢复 ${options.selectedNodes.size} 个项目`, 'success');
          options.clearSelection();
          options.loadData();
        } catch (error) {
          let errorMessage = '批量恢复失败';
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          options.showToast(errorMessage, 'error');
        }
      },
      'warning',
      '恢复'
    );
  };

  const handleOpenRename = (node: FileSystemNode): void => {
    editingNode.value = node;

    if (!node.isFolder && node.name) {
      const lastDotIndex = node.name.lastIndexOf('.');
      const nameWithoutExtension =
        lastDotIndex !== -1 ? node.name.substring(0, lastDotIndex) : node.name;
      folderName.value = nameWithoutExtension;
    } else {
      folderName.value = node.name;
    }

    showRenameModal.value = true;
  };

  const handleCreateProject = async (name: string, description?: string): Promise<void> => {
    try {
      await projectsApi.create({
        name: name.trim(),
        description: description?.trim(),
      });
      options.showToast('项目创建成功', 'success');
      options.loadData();
    } catch (error) {
      let errorMessage = '创建项目失败';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      options.showToast(errorMessage, 'error');
      throw error;
    }
  };

  const handleUpdateProject = async (id: string, data: { name?: string; description?: string }): Promise<void> => {
    try {
      await projectsApi.updateNode(id, data);
      options.showToast('项目更新成功', 'success');
      options.loadData();
    } catch (error) {
      let errorMessage = '更新项目失败';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      options.showToast(errorMessage, 'error');
      throw error;
    }
  };

  const handleDeleteProject = async (id: string, name: string): Promise<void> => {
    const node: FileSystemNode = {
      id,
      name,
      isRoot: true,
      isFolder: true,
      parentId: undefined,
      ownerId: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    handleDelete(node, false);
  };

  const handlePermanentlyDeleteProject = async (id: string, name: string): Promise<void> => {
    const node: FileSystemNode = {
      id,
      name,
      isRoot: true,
      isFolder: true,
      parentId: undefined,
      ownerId: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    handleDelete(node, true);
  };

  const handlePermanentlyDelete = (node: FileSystemNode): void => {
    handleDelete(node, true);
  };

  const handleRestoreNode = (node: FileSystemNode): void => {
    options.showConfirm(
      '确认恢复',
      `确定要恢复 "${node.name}" 吗？`,
      async () => {
        try {
          if (node.isRoot) {
            await projectsApi.restoreProject(node.id);
          } else {
            await projectsApi.restoreNode(node.id);
          }
          options.showToast(`已恢复 "${node.name}"`, 'success');
          options.loadData();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '恢复节点失败';
          options.showToast(errorMessage, 'error');
        }
      },
      'warning'
    );
  };

  const handleClearProjectTrash = (): void => {
    if (!options.urlProjectId) {
      options.showToast('未选择项目', 'error');
      return;
    }

    options.showConfirm(
      '确认清空回收站',
      '确定要清空项目回收站吗？此操作将彻底删除所有已删除的文件和文件夹，且不可恢复。',
      async () => {
        try {
          await projectsApi.clearProjectTrash(options.urlProjectId!);
          options.showToast('项目回收站已清空', 'success');
          options.loadData();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '清空回收站失败';
          options.showToast(errorMessage, 'error');
        }
      },
      'danger'
    );
  };

  const handleClearTrash = (): void => {
    options.showConfirm(
      '确认清空回收站',
      '确定要清空回收站吗？此操作将彻底删除所有已删除的项目，且不可恢复。',
      async () => {
        try {
          await trashApi.clear();
          options.showToast('回收站已清空', 'success');
          options.loadData();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '清空回收站失败';
          options.showToast(errorMessage, 'error');
        }
      },
      'danger'
    );
  };

  return {
    showCreateFolderModal,
    showRenameModal,
    editingNode,
    folderName,
    setFolderName: (name: string) => { folderName.value = name; },
    setShowCreateFolderModal: (show: boolean) => { showCreateFolderModal.value = show; },
    setShowRenameModal: (show: boolean) => { showRenameModal.value = show; },
    setEditingNode: (node: FileSystemNode | null) => { editingNode.value = node; },
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
}
