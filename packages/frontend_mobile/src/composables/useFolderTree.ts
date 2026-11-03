import { ref } from 'vue';
import { t } from '@/languages';
import { showToast } from 'vant';
import { unwrap } from '../utils/apiError';
import {
  nodeControllerGetChildren,
  libraryControllerGetDrawingChildren,
  libraryControllerGetBlockChildren,
  type FileSystemNodeDto,
} from '../api-sdk';
import type { SaveTargetType, LibraryType } from './useSaveAs';

/**
 * 另存为的文件夹浏览树（SaveAsSheet 的「选择文件夹」步骤）。
 *
 * 从 1267 行的 SaveAsSheet.vue 拆出：文件夹路径面包屑、当前目录子节点加载、
 * 进入/返回/回根/面包屑跳转，以及内联在组件里的库/普通子节点 API 调用。
 * 组件只负责表单与弹层骨架，文件夹导航的纯状态与取数全部在这里。
 *
 * 库节点走库专用子节点接口（与 PC LibrarySelectFolderModal 同口径）：
 * 通用接口对库节点会多过一遍 RequireProjectPermission 的库访问判定。
 * 依赖注入（getTargetType / resolveRootId / getCurrentNodeId 等 getter 形态）：
 * 本 composable 不持有另存为的目标类型 / 根节点 / 当前节点状态，由调用方传入——
 * 与 useSortSheet 同一纪律，避免双向绑定回传。
 */
export interface FolderNode {
  id: string;
  name: string;
  isFolder: boolean;
}

export interface FolderPathEntry {
  id: string;
  name: string;
}

export interface FolderTreeDeps {
  /** 当前目标类型（另存为的 personal / project / library） */
  getTargetType: () => SaveTargetType;
  /** 当前库类型（drawing / block，仅 library 目标用） */
  getLibraryType: () => LibraryType;
  /** 解析文件夹浏览的根节点 id（个人空间 / 选中项目 / 资源库根） */
  resolveRootId: () => string;
  /** 排除当前节点（另存为时不能把图纸另存到它自己） */
  getCurrentNodeId: () => string | undefined;
  /** 打开选择器成功后的回调（组件置 step='folder'） */
  onOpenPicker: () => void;
  /** 打开选择器失败（无根节点）后的回调（组件把 step 退回 'form'） */
  onPickerFailed: () => void;
  /** 选中某文件夹的回调（组件写 selectedParentId + 回表单） */
  onSelectFolder: (nodeId: string, path: FolderPathEntry[]) => void;
}

export function useFolderTree(deps: FolderTreeDeps) {
  const folderPath = ref<FolderPathEntry[]>([]);
  const folderNodes = ref<FolderNode[]>([]);
  const folderLoading = ref(false);
  const lastFolderPath = ref<FolderPathEntry[]>([]);

  async function loadFolderChildren(parentId: string): Promise<FolderNode[]> {
    if (!parentId) return [];
    try {
      const apiFn =
        deps.getTargetType() === 'library'
          ? deps.getLibraryType() === 'block'
            ? libraryControllerGetBlockChildren
            : libraryControllerGetDrawingChildren
          : nodeControllerGetChildren;
      const result = await apiFn({
        path: { nodeId: parentId },
        query: { nodeType: 'folder' },
      });
      unwrap(result);
      const data = result.data as unknown as { nodes: FileSystemNodeDto[] };
      return (data?.nodes || [])
        .filter((n) => n.id !== deps.getCurrentNodeId())
        .map((n) => ({
          id: n.id,
          name: n.name,
          isFolder: n.isFolder,
        }));
    } catch {
      return [];
    }
  }

  async function openFolderPicker() {
    folderLoading.value = true;
    deps.onOpenPicker();

    const rootId = deps.resolveRootId();
    if (!rootId) {
      showToast(
        deps.getTargetType() === 'library' ? t('无法加载资源库') : t('请先选择项目')
      );
      deps.onPickerFailed();
      folderLoading.value = false;
      return;
    }

    if (lastFolderPath.value.length > 0) {
      folderPath.value = [...lastFolderPath.value];
      const leaf = folderPath.value[folderPath.value.length - 1];
      folderNodes.value = await loadFolderChildren(leaf.id);
    } else {
      folderPath.value = [];
      folderNodes.value = await loadFolderChildren(rootId);
    }
    folderLoading.value = false;
  }

  async function enterFolder(nodeId: string, nodeName: string) {
    folderPath.value.push({ id: nodeId, name: nodeName });
    folderLoading.value = true;
    folderNodes.value = await loadFolderChildren(nodeId);
    folderLoading.value = false;
  }

  async function goToRoot() {
    folderPath.value = [];
    await loadRootChildren();
  }

  async function navigateToBreadcrumb(index: number) {
    if (index === folderPath.value.length - 1) return;
    const target = folderPath.value[index];
    if (!target) {
      await goToRoot();
      return;
    }
    folderPath.value = folderPath.value.slice(0, index + 1);
    folderLoading.value = true;
    folderNodes.value = await loadFolderChildren(target.id);
    folderLoading.value = false;
  }

  async function loadRootChildren() {
    const rootId = deps.resolveRootId();
    if (rootId) {
      folderLoading.value = true;
      folderNodes.value = await loadFolderChildren(rootId);
      folderLoading.value = false;
    }
  }

  async function goUp() {
    if (folderPath.value.length === 0) return;
    folderPath.value.pop();
    const parentId =
      folderPath.value.length > 0
        ? folderPath.value[folderPath.value.length - 1].id
        : deps.resolveRootId();

    if (parentId) {
      folderLoading.value = true;
      folderNodes.value = await loadFolderChildren(parentId);
      folderLoading.value = false;
    }
  }

  function selectFolder(nodeId: string) {
    lastFolderPath.value = [...folderPath.value];
    deps.onSelectFolder(nodeId, [...folderPath.value]);
  }

  /** 清空浏览位置（切换目标类型时调用，对齐组件 onProjectConfirm 的 folderPath=[]） */
  function clearFolderPath() {
    folderPath.value = [];
  }

  return {
    // 暴露可写 ref：组件里 create-folder / 重置流程会直接改写路径与子节点
    //（与 useSaveAs 暴露 fileName/targetType 等可写 ref 同一风格）
    folderPath,
    folderNodes,
    folderLoading,
    lastFolderPath,
    openFolderPicker,
    loadFolderChildren,
    enterFolder,
    goToRoot,
    navigateToBreadcrumb,
    goUp,
    selectFolder,
    clearFolderPath,
  };
}
