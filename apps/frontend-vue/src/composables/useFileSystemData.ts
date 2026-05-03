import { ref, computed, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { projectsApi, type FileSystemNodeDto } from '@/services/projectsApi';
import { filesApi } from '@/services/filesApi';
import { trashApi } from '@/services/trashApi';

export interface FileSystemNode extends FileSystemNodeDto {
  extension?: string;
  originalName?: string;
  deletedAt?: string;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
  isRoot: boolean;
  isFolder?: boolean;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UseFileSystemDataOptions {
  mode?: 'project' | 'personal-space';
  personalSpaceId?: string | null;
  projectFilter?: 'all' | 'owned' | 'joined';
}

export function useFileSystemData(options: UseFileSystemDataOptions = {}) {
  const mode = options.mode || 'project';
  const personalSpaceId = options.personalSpaceId;
  const projectFilter = options.projectFilter || 'all';

  const route = useRoute();
  const router = useRouter();

  const nodes = ref<FileSystemNode[]>([]);
  const currentNode = ref<FileSystemNode | null>(null);
  const breadcrumbs = ref<BreadcrumbItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const paginationMeta = ref<PaginationMeta | null>(null);

  const isTrashView = ref(false);
  const isProjectTrashView = ref(false);

  const pagination = ref({ page: 1, limit: 20 });
  const searchQuery = ref('');

  const urlProjectId = computed(() => {
    if (mode === 'personal-space') {
      return personalSpaceId || '';
    }
    const match = route.path.match(/\/projects\/([^/]+)/);
    return match ? match[1] : '';
  });

  const urlNodeId = computed(() => {
    if (mode === 'personal-space') {
      const match = route.path.match(/\/personal-space\/([^/]+)/);
      return match ? match[1] : undefined;
    }
    const match = route.path.match(/\/projects\/[^/]+\/files\/([^/]+)/);
    return match ? match[1] : undefined;
  });

  const isProjectRootMode = computed(() => mode === 'project' && !urlProjectId.value);
  const isFolderMode = computed(() => !!urlProjectId.value);
  const isPersonalSpaceMode = computed(() => mode === 'personal-space');

  function getFileExtension(filename: string | undefined): string | undefined {
    if (!filename) return undefined;
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === 0) return undefined;
    return filename.slice(lastDot).toLowerCase();
  }

  function toFileSystemNode(dto: FileSystemNodeDto): FileSystemNode {
    return {
      ...dto,
      extension: getFileExtension(dto.name),
      originalName: dto.name,
    };
  }

  function projectToNode(project: FileSystemNodeDto): FileSystemNode {
    return {
      ...project,
      isFolder: true,
      isRoot: true,
      extension: undefined,
      originalName: project.name,
    };
  }

  async function buildBreadcrumbsFromNode(node: FileSystemNode, signal?: AbortSignal): Promise<void> {
    const crumbs: BreadcrumbItem[] = [];
    const visited = new Set<string>();
    let traversalNode: FileSystemNode | null = node;

    try {
      while (traversalNode && !visited.has(traversalNode.id)) {
        if (signal?.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }

        visited.add(traversalNode.id);
        crumbs.unshift({
          id: traversalNode.id,
          name: traversalNode.name,
          isRoot: traversalNode.isRoot || false,
        });

        if (traversalNode.parentId) {
          try {
            const parentResponse = await projectsApi.getNode(traversalNode.parentId, { signal });
            traversalNode = toFileSystemNode(parentResponse.data);
          } catch {
            console.warn('获取父节点失败，停止构建面包屑');
            break;
          }
        } else {
          break;
        }
      }

      breadcrumbs.value = crumbs;
    } catch {
      breadcrumbs.value = [{
        id: node.id,
        name: node.name,
        isRoot: node.isRoot || false,
      }];
    }
  }

  let abortController: AbortController | null = null;

  async function loadData(): Promise<void> {
    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();

    loading.value = true;
    error.value = null;

    try {
      const params: Record<string, unknown> = {
        page: pagination.value.page,
        limit: pagination.value.limit,
      };

      if (searchQuery.value) {
        params.search = searchQuery.value;
      }

      if (searchQuery.value) {
        let searchScope: 'project' | 'project_files' = 'project_files';
        let searchFilter: 'all' | 'owned' | 'joined' = 'all';
        let searchProjectId: string | undefined;

        if (isProjectRootMode.value) {
          searchScope = 'project';
          searchFilter = projectFilter;
        } else if (isPersonalSpaceMode.value || urlProjectId.value) {
          searchScope = 'project_files';
          searchProjectId = isPersonalSpaceMode.value
            ? (urlNodeId.value || urlProjectId.value || '')
            : urlProjectId.value;
        }

        const searchResponse = await projectsApi.search(
          searchQuery.value,
          {
            scope: searchScope,
            filter: searchFilter,
            projectId: searchProjectId,
            page: pagination.value.page,
            limit: pagination.value.limit,
          },
          { signal: abortController.signal }
        );

        const searchData = searchResponse.data;
        if (searchData?.nodes) {
          const searchNodes = searchData.nodes.map(toFileSystemNode);
          nodes.value = searchNodes;
          paginationMeta.value = {
            total: searchData.total,
            page: searchData.page,
            limit: searchData.limit,
            totalPages: searchData.totalPages,
          };
        }

        loading.value = false;
        return;
      }

      if (isPersonalSpaceMode.value) {
        const currentNodeId = urlNodeId.value || urlProjectId.value || '';

        if (!currentNodeId) {
          return;
        }

        if (isTrashView.value) {
          const trashResponse = await projectsApi.getProjectTrash(currentNodeId, {
            page: pagination.value.page,
            limit: pagination.value.limit,
          });

          const trashData = trashResponse.data;
          const trashNodes = (trashData?.nodes || []).map(toFileSystemNode);
          nodes.value = trashNodes;

          if (trashData?.total !== undefined) {
            paginationMeta.value = {
              total: trashData.total,
              page: trashData.page,
              limit: trashData.limit,
              totalPages: trashData.totalPages,
            };
          } else {
            paginationMeta.value = {
              total: trashNodes.length,
              page: pagination.value.page,
              limit: pagination.value.limit,
              totalPages: Math.ceil(trashNodes.length / pagination.value.limit),
            };
          }

          breadcrumbs.value = [
            { id: currentNodeId, name: '我的图纸', isRoot: true, isFolder: true },
            { id: 'trash', name: '回收站', isRoot: false, isFolder: true },
          ];

          try {
            const nodeResponse = await projectsApi.getNode(currentNodeId, { signal: abortController.signal });
            currentNode.value = toFileSystemNode(nodeResponse.data);
          } catch {
            // 忽略错误
          }

          loading.value = false;
          return;
        }

        const [nodeResponse, childrenResponse] = await Promise.all([
          projectsApi.getNode(currentNodeId, { signal: abortController.signal }),
          projectsApi.getChildren(currentNodeId, {
            page: pagination.value.page,
            limit: pagination.value.limit,
            search: searchQuery.value || undefined,
          }, { signal: abortController.signal }),
        ]);

        const nodeData = toFileSystemNode(nodeResponse.data);
        const childrenData = (childrenResponse.data?.nodes || []).map(toFileSystemNode);
        nodes.value = childrenData;

        const childrenMeta = childrenResponse.data;
        if (childrenMeta?.total !== undefined) {
          paginationMeta.value = {
            total: childrenMeta.total,
            page: childrenMeta.page,
            limit: childrenMeta.limit,
            totalPages: childrenMeta.totalPages,
          };
        } else {
          paginationMeta.value = {
            total: childrenData.length,
            page: pagination.value.page,
            limit: pagination.value.limit,
            totalPages: Math.ceil(childrenData.length / pagination.value.limit),
          };
        }

        currentNode.value = nodeData;
        await buildBreadcrumbsFromNode(nodeData, abortController.signal);
        loading.value = false;
        return;
      }

      if (isProjectRootMode.value) {
        let response;

        if (isProjectTrashView.value) {
          response = await projectsApi.getDeleted({
            page: pagination.value.page,
            limit: pagination.value.limit,
          }, { signal: abortController.signal });
        } else {
          response = await projectsApi.list(projectFilter, {
            page: pagination.value.page,
            limit: pagination.value.limit,
          }, { signal: abortController.signal });
        }

        const projectData = response.data;
        if (projectData?.nodes) {
          const projectNodes = projectData.nodes.map(projectToNode);
          nodes.value = projectNodes;
          paginationMeta.value = {
            total: projectData.total,
            page: projectData.page,
            limit: projectData.limit,
            totalPages: projectData.totalPages,
          };
        } else {
          nodes.value = [];
          paginationMeta.value = {
            total: 0,
            page: pagination.value.page,
            limit: pagination.value.limit,
            totalPages: 1,
          };
        }

        currentNode.value = null;
        breadcrumbs.value = [];
      } else {
        const currentNodeId = urlNodeId.value || urlProjectId.value || '';

        if (isTrashView.value) {
          if (!urlProjectId.value) {
            throw new Error('项目ID不存在，无法加载项目回收站');
          }

          const trashResponse = await projectsApi.getProjectTrash(urlProjectId.value, {
            page: pagination.value.page,
            limit: pagination.value.limit,
          });

          const trashData = trashResponse.data;
          const trashNodes = (trashData?.nodes || []).map(toFileSystemNode);
          nodes.value = trashNodes;

          if (trashData?.total !== undefined) {
            paginationMeta.value = {
              total: trashData.total,
              page: trashData.page,
              limit: trashData.limit,
              totalPages: trashData.totalPages,
            };
          } else {
            paginationMeta.value = {
              total: trashNodes.length,
              page: pagination.value.page,
              limit: pagination.value.limit,
              totalPages: Math.ceil(trashNodes.length / pagination.value.limit),
            };
          }

          const projectResponse = await projectsApi.getNode(urlProjectId.value, { signal: abortController.signal });
          currentNode.value = toFileSystemNode(projectResponse.data);

          const projectData = projectResponse.data;
          breadcrumbs.value = [
            {
              id: projectData.id,
              name: projectData.name,
              isRoot: true,
              isFolder: true,
            },
            {
              id: 'trash',
              name: '回收站',
              isRoot: false,
              isFolder: true,
            },
          ];
        } else {
          const [nodeResponse, childrenResponse] = await Promise.all([
            projectsApi.getNode(currentNodeId, { signal: abortController.signal }),
            projectsApi.getChildren(currentNodeId, {
              page: pagination.value.page,
              limit: pagination.value.limit,
              search: searchQuery.value || undefined,
            }, { signal: abortController.signal }),
          ]);

          const nodeData = toFileSystemNode(nodeResponse.data);

          if (!isPersonalSpaceMode.value && nodeData.personalSpaceKey) {
            router.push('/personal-space');
            loading.value = false;
            return;
          }

          const childrenData = childrenResponse.data?.nodes || [];
          nodes.value = childrenData;

          const childrenMeta = childrenResponse.data;
          if (childrenMeta?.total !== undefined) {
            paginationMeta.value = {
              total: childrenMeta.total,
              page: childrenMeta.page,
              limit: childrenMeta.limit,
              totalPages: childrenMeta.totalPages,
            };
          } else {
            paginationMeta.value = {
              total: childrenData.length,
              page: pagination.value.page,
              limit: pagination.value.limit,
              totalPages: Math.ceil(childrenData.length / pagination.value.limit),
            };
          }

          currentNode.value = nodeData;
          await buildBreadcrumbsFromNode(nodeData, abortController.signal);
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : '加载数据失败';
      error.value = errorMessage;
      loading.value = false;
    } finally {
      loading.value = false;
    }
  }

  function setSearch(query: string): void {
    searchQuery.value = query;
    pagination.value.page = 1;
  }

  function setPage(page: number): void {
    pagination.value.page = page;
  }

  function setPageSize(limit: number): void {
    pagination.value.limit = limit;
    pagination.value.page = 1;
  }

  function handlePageChange(page: number): void {
    pagination.value.page = page;
    loadData();
  }

  function handlePageSizeChange(limit: number): void {
    pagination.value.limit = limit;
    pagination.value.page = 1;
    loadData();
  }

  function setTrashView(value: boolean): void {
    isTrashView.value = value;
    pagination.value.page = 1;
    searchQuery.value = '';
    loadData();
  }

  function setProjectTrashView(value: boolean): void {
    isProjectTrashView.value = value;
    pagination.value.page = 1;
    searchQuery.value = '';
    loadData();
  }

  onUnmounted(() => {
    if (abortController) {
      abortController.abort();
    }
  });

  return {
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
    paginationMeta,
    isTrashView,
    isProjectTrashView,
    pagination,
    searchQuery,
    urlProjectId,
    urlNodeId,
    isProjectRootMode,
    isFolderMode,
    isPersonalSpaceMode,
    loadData,
    setSearch,
    setPage,
    setPageSize,
    handlePageChange,
    handlePageSizeChange,
    setTrashView,
    setProjectTrashView,
    buildBreadcrumbsFromNode,
  };
}
