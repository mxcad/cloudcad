<template>
  <div class="min-h-screen p-6">
    <!-- 顶部导航栏 -->
    <div class="max-w-7xl mx-auto mb-6">
      <v-card variant="outlined" class="p-4" style="border-radius: 16px;">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <h1 class="text-2xl font-bold" style="background: linear-gradient(135deg, #3b82f6, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
              公共资源库
            </h1>
            <!-- 库类型切换 -->
            <v-tabs v-model="libraryType" bg-color="transparent" density="compact">
              <v-tab value="drawing" :title="'图纸库'" />
              <v-tab value="block" :title="'图块库'" />
            </v-tabs>
            <!-- 存储配额按钮 -->
            <v-btn v-if="canManage" variant="tonal" @click="openQuotaModal" :title="'配置存储配额'">
              <v-icon class="mr-1">mdi-harddisk</v-icon>
              存储配额
            </v-btn>
          </div>

          <!-- 管理员操作按钮：只有管理员才显示 -->
          <div v-if="canManage" class="flex items-center gap-2">
            <v-btn variant="outlined" @click="openCreateFolderModal">
              <v-icon class="mr-1">mdi-folder-plus</v-icon>
              新建文件夹
            </v-btn>
            <v-btn variant="outlined" @click="showDirectoryImport = true">
              <v-icon class="mr-1">mdi-folder-plus</v-icon>
              批量导入
            </v-btn>
            <!-- 上传按钮 -->
            <v-btn color="primary" @click="showUploader = true">
              <v-icon class="mr-1">mdi-upload</v-icon>
              上传文件
            </v-btn>
          </div>
        </div>
      </v-card>
    </div>

    <!-- 主内容区 -->
    <div class="max-w-7xl mx-auto">
      <v-card variant="outlined" class="p-4" style="border-radius: 16px;">
        <!-- 面包屑和工具栏 -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <!-- 面包屑导航 -->
          <div class="flex-1 min-w-0">
            <v-breadcrumbs :items="breadcrumbItems" :divider="'/'" />
          </div>

          <!-- 工具栏 -->
          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- 搜索框 -->
            <v-text-field
              v-model="searchTerm"
              prepend-icon="mdi-magnify"
              :placeholder="'搜索文件...'"
              variant="outlined"
              density="compact"
              clearable
              @keydown.enter="handleSearchSubmit"
              style="width: 200px;"
            />

            <!-- 视图切换 -->
            <v-btn-toggle v-model="viewMode" density="compact" variant="tonal">
              <v-btn value="grid">
                <v-icon>mdi-view-grid</v-icon>
              </v-btn>
              <v-btn value="list">
                <v-icon>mdi-view-list</v-icon>
              </v-btn>
            </v-btn-toggle>

            <!-- 刷新按钮 -->
            <v-btn icon="mdi-refresh" @click="refresh" :loading="loading" />

            <!-- 多选模式切换按钮 -->
            <v-btn
              :icon="isMultiSelectMode ? 'mdi-checkbox-blank' : 'mdi-checkbox-marked'"
              @click="toggleMultiSelectMode"
              :color="isMultiSelectMode ? 'primary' : ''"
              :variant="isMultiSelectMode ? 'tonal' : 'text'"
            />

            <!-- 全选按钮 - 仅在多选模式下显示 -->
            <v-btn
              v-if="isMultiSelectMode && nodes.length > 0"
              :icon="selectedNodes.size === nodes.length ? 'mdi-checkbox-multiple-marked' : 'mdi-checkbox-multiple-marked-outline'"
              @click="handleSelectAll"
            />
          </div>
        </div>

        <!-- 错误提示 -->
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          closable
          @close:click="clearError"
        >
          {{ error }}
        </v-alert>

        <!-- 文件列表 -->
        <div v-if="loading" class="flex items-center justify-center py-16">
          <v-progress-circular indeterminate color="primary" size="48" />
        </div>
        <div v-else-if="nodes.length === 0" class="flex flex-col items-center justify-center py-16">
          <v-icon size="80" color="medium-emphasis" class="mb-6">mdi-folder-open</v-icon>
          <h3 class="text-xl font-bold mb-2">
            {{ isFolderMode ? '文件夹是空的' : '资源库暂无内容' }}
          </h3>
          <p class="text-medium-emphasis text-sm mb-6">
            {{ canManage ? '上传文件或创建文件夹开始使用' : '资源库暂无内容，请稍后再来' }}
          </p>
          <v-btn v-if="canManage" variant="outlined" @click="openCreateFolderModal">
            创建文件夹
          </v-btn>
        </div>
        <div v-else>
          <!-- 网格视图 -->
          <div v-if="viewMode === 'grid'" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-2">
            <div
              v-for="node in nodes"
              :key="node.id"
              class="p-3 border rounded-xl cursor-pointer transition-all hover:bg-[var(--bg-tertiary)] hover:border-[var(--primary-300)]"
              :class="{
                'border-primary': isSelected(node.id),
              }"
              @click="handleNodeClick(node)"
              @dblclick="handleNodeDoubleClick(node)"
            >
              <div class="flex items-start justify-between mb-2">
                <v-icon size="32">
                  {{ getNodeIcon(node) }}
                </v-icon>
                <v-checkbox
                  v-if="isMultiSelectMode"
                  v-model="nodeSelections"
                  :value="node.id"
                  size="small"
                  @click.stop
                />
              </div>
              <div class="text-sm font-medium truncate">{{ node.name }}</div>
              <div v-if="!node.isFolder" class="text-xs text-medium-emphasis">{{ formatFileSize(node.size) }}</div>
              
              <!-- 操作菜单 -->
              <v-menu v-if="canManage" location="bottom end">
                <template v-slot:activator="{ props }">
                  <v-btn v-bind="props" icon="mdi-dots-vertical" variant="text" density="compact" @click.stop />
                </template>
                <v-list density="compact">
                  <v-list-item v-if="!node.isFolder" @click="handleOpenInEditor(node)" title="在编辑器中打开" />
                  <v-list-item v-if="!node.isFolder" @click="handleDownload(node)" title="下载" />
                  <v-list-item @click="handleRename(node)" title="重命名" />
                  <v-list-item @click="handleMove(node)" title="移动" />
                  <v-list-item @click="handleCopy(node)" title="复制" />
                  <v-divider />
                  <v-list-item color="error" @click="handleDeleteConfirm(node)" title="删除" />
                </v-list>
              </v-menu>
            </div>
          </div>
          
          <!-- 列表视图 -->
          <v-data-table
            v-else
            :headers="listHeaders"
            :items="nodes"
            :loading="loading"
            hide-default-footer
            class="user-table"
          >
            <template v-slot:item="{ item }">
              <tr class="cursor-pointer" :class="{ 'bg-primary-lighten-4': isSelected(item.id) }" @click="handleNodeClick(item)">
                <td class="py-3 px-2">
                  <v-checkbox v-if="isMultiSelectMode" v-model="nodeSelections" :value="item.id" size="small" @click.stop />
                </td>
                <td class="py-3 px-2">
                  <div class="flex items-center gap-2">
                    <v-icon>{{ getNodeIcon(item) }}</v-icon>
                    <span class="font-medium">{{ item.name }}</span>
                  </div>
                </td>
                <td class="py-3 px-2 text-medium-emphasis">{{ !item.isFolder ? formatFileSize(item.size) : '-' }}</td>
                <td class="py-3 px-2 text-medium-emphasis">{{ formatDate(item.updatedAt) }}</td>
                <td class="py-3 px-2 text-right" @click.stop>
                  <v-menu v-if="canManage" location="bottom end">
                    <template v-slot:activator="{ props }">
                      <v-btn v-bind="props" icon="mdi-dots-vertical" variant="text" density="compact" />
                    </template>
                    <v-list density="compact">
                      <v-list-item v-if="!item.isFolder" @click="handleOpenInEditor(item)" title="在编辑器中打开" />
                      <v-list-item v-if="!item.isFolder" @click="handleDownload(item)" title="下载" />
                      <v-list-item @click="handleRename(item)" title="重命名" />
                      <v-list-item @click="handleMove(item)" title="移动" />
                      <v-list-item @click="handleCopy(item)" title="复制" />
                      <v-divider />
                      <v-list-item color="error" @click="handleDeleteConfirm(item)" title="删除" />
                    </v-list>
                  </v-menu>
                </td>
              </tr>
            </template>
          </v-data-table>
        </div>

        <!-- 分页 -->
        <div class="mt-6 flex justify-center">
          <v-pagination
            v-model="currentPage"
            :length="totalPages"
            :total-visible="5"
          />
        </div>
      </v-card>

      <!-- 批量操作栏 -->
      <div v-if="isMultiSelectMode && selectedNodes.size > 0" class="fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl flex items-center gap-4" style="background: rgba(var(--v-theme-surface)); border: 1px solid rgba(var(--v-theme-border)); z-index: 100;">
        <span class="text-sm font-semibold">已选中 {{ selectedNodes.size }} 项</span>
        <v-divider vertical inset style="height: 1.5rem;" />
        <template v-if="canManage">
          <v-btn variant="text" @click="handleBatchMove">移动</v-btn>
          <v-btn variant="text" @click="handleBatchCopy">复制</v-btn>
          <v-btn variant="text" color="error" @click="handleBatchDelete">批量删除</v-btn>
        </template>
        <v-btn variant="text" @click="clearSelection">取消选择</v-btn>
      </div>
    </div>

    <!-- 创建文件夹弹窗 -->
    <v-dialog v-model="isCreateFolderModalOpen" max-width="500">
      <v-card>
        <v-card-title>新建文件夹</v-card-title>
        <v-card-text>
          <v-form ref="folderForm">
            <v-text-field
              v-model="folderName"
              label="文件夹名称"
              variant="outlined"
              required
            />
          </v-form>
        </v-card-text>
        <v-card-actions class="justify-end gap-2">
          <v-btn variant="text" @click="isCreateFolderModalOpen = false">取消</v-btn>
          <v-btn color="primary" @click="handleCreateFolder">创建</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 重命名模态框 -->
    <v-dialog v-model="isRenameModalOpen" max-width="500">
      <v-card>
        <v-card-title>重命名</v-card-title>
        <v-card-text>
          <v-form ref="renameForm">
            <v-text-field
              v-model="renameName"
              label="新名称"
              variant="outlined"
              required
            />
          </v-form>
        </v-card-text>
        <v-card-actions class="justify-end gap-2">
          <v-btn variant="text" @click="closeRenameModal">取消</v-btn>
          <v-btn color="primary" @click="handleRenameSubmit">重命名</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 选择文件夹弹窗（移动/复制） -->
    <v-dialog v-model="showSelectFolderModal" max-width="600">
      <v-card>
        <v-card-title>
          {{ moveSourceNode ? '选择目标文件夹' : '选择目标文件夹' }}
        </v-card-title>
        <v-card-text>
          <!-- 简单的文件夹选择器，这里简化处理 -->
          <v-alert type="info" variant="tonal">
            文件夹选择功能开发中...
          </v-alert>
        </v-card-text>
        <v-card-actions class="justify-end gap-2">
          <v-btn variant="text" @click="closeSelectFolderModal">取消</v-btn>
          <v-btn color="primary" @click="handleSelectFolderConfirm">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 下载格式选择弹窗 -->
    <v-dialog v-model="showDownloadFormatModal" max-width="500">
      <v-card>
        <v-card-title>下载格式</v-card-title>
        <v-card-text>
          <p class="mb-4">选择下载格式：{{ downloadingFileName }}</p>
          <v-list density="compact">
            <v-list-item v-for="format in downloadFormats" :key="format" @click="handleDownloadWithFormat(format)">
              <template v-slot:prepend>
                <v-icon>{{ getFormatIcon(format) }}</v-icon>
              </template>
              <v-list-item-title>{{ getFormatLabel(format) }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions class="justify-end gap-2">
          <v-btn variant="text" @click="closeDownloadFormatModal">取消</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 确认对话框 -->
    <v-dialog v-model="confirmDialog.open" max-width="500">
      <v-card>
        <v-card-title>{{ confirmDialog.title }}</v-card-title>
        <v-card-text>{{ confirmDialog.message }}</v-card-text>
        <v-card-actions class="justify-end gap-2">
          <v-btn variant="text" @click="confirmDialog.open = false">取消</v-btn>
          <v-btn color="primary" @click="handleConfirm">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 批量导入对话框 -->
    <v-dialog v-model="showDirectoryImport" max-width="600">
      <v-card>
        <v-card-title>批量导入</v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal">
            批量导入功能开发中...
          </v-alert>
        </v-card-text>
        <v-card-actions class="justify-end gap-2">
          <v-btn variant="text" @click="showDirectoryImport = false">取消</v-btn>
          <v-btn color="primary">导入</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 上传对话框 -->
    <v-dialog v-model="showUploader" max-width="600">
      <v-card>
        <v-card-title>上传文件</v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal">
            上传功能开发中...
          </v-alert>
        </v-card-text>
        <v-card-actions class="justify-end gap-2">
          <v-btn variant="text" @click="showUploader = false">取消</v-btn>
          <v-btn color="primary">上传</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 存储配额配置模态框 -->
    <v-dialog v-model="quotaModalOpen" max-width="500">
      <v-card>
        <v-card-title>配置公共资源库存储配额</v-card-title>
        <v-card-text>
          <div class="mb-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="rounded-full p-3" style="background: rgba(var(--v-theme-primary), 0.1);">
                <v-icon size="24">mdi-harddisk</v-icon>
              </div>
              <div>
                <p class="font-medium">{{ libraryType === 'drawing' ? '图纸库' : '图块库' }}</p>
                <p class="text-sm text-medium-emphasis">公共资源库</p>
              </div>
            </div>
            
            <div>
              <label class="text-sm font-medium mb-2 block">
                <v-icon size="16" class="mr-1">mdi-harddisk</v-icon>
                库存储配额
              </label>
              <v-text-field
                v-model.number="libraryQuota"
                type="number"
                suffix="GB"
                variant="outlined"
                min="0"
                step="1"
              />
              <p class="text-sm text-medium-emphasis mt-2">默认配额：{{ defaultLibraryQuota }} GB</p>
              
              <div v-if="libraryStorageInfo" class="mt-4">
                <v-progress-linear
                  :model-value="Math.min(libraryStorageInfo.usagePercent || 0, 100)"
                  :color="getQuotaColor(libraryStorageInfo.usagePercent)"
                  height="8"
                  rounded
                />
                <p class="text-sm text-medium-emphasis mt-2">
                  已使用：{{ formatFileSize(libraryStorageInfo.used) }} / {{ formatFileSize(libraryStorageInfo.total) }} ({{ (libraryStorageInfo.usagePercent || 0).toFixed(1) }}%)
                </p>
              </div>
            </div>
          </div>
        </v-card-text>
        <v-card-actions class="justify-end gap-2">
          <v-btn variant="text" @click="quotaModalOpen = false" :disabled="quotaLoading">取消</v-btn>
          <v-btn color="primary" @click="saveLibraryQuota" :loading="quotaLoading">
            <template v-slot:prepend-icon v-if="quotaLoading">
              <v-icon class="mr-1">mdi-loading</v-icon>
            </template>
            <v-icon v-else class="mr-1">mdi-content-save</v-icon>
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { usePermission } from '@/composables/usePermission';
import { libraryApi, projectsApi, runtimeConfigApi } from '@/services/api';
import { SystemPermission } from '@/constants/permissions';
import { formatFileSize } from '@/utils/fileUtils';

const route = useRoute();
const router = useRouter();

// 库类型
const libraryType = ref<'drawing' | 'block'>((route.params.libraryType as 'drawing' | 'block') || 'drawing');

// 设置文档标题
const documentTitle = computed(() => libraryType.value === 'drawing' ? '图纸库' : '图块库');
useDocumentTitle(documentTitle);

// 分页状态
const currentPage = ref(1);
const pageSize = ref(20);
const totalPages = ref(1);
const total = ref(0);

// 核心状态
const libraryId = ref<string>('');
const nodes = ref<any[]>([]);
const currentNode = ref<any>(null);
const breadcrumbs = ref<any[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const searchTerm = ref('');
const viewMode = ref<'grid' | 'list'>('grid');
const isFolderMode = ref(false);

// 权限检查
const { hasPermission } = usePermission();
const canManage = computed(() => {
  return libraryType.value === 'drawing'
    ? hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE)
    : hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE);
});

// UI 状态
const isCreateFolderModalOpen = ref(false);
const isRenameModalOpen = ref(false);
const renamingNode = ref<any>(null);
const renameName = ref('');
const folderName = ref('');
const showSelectFolderModal = ref(false);
const moveSourceNode = ref<any>(null);
const copySourceNode = ref<any>(null);
const showUploader = ref(false);
const showDirectoryImport = ref(false);

// 下载格式选择
const showDownloadFormatModal = ref(false);
const downloadingNodeId = ref<string | null>(null);
const downloadingFileName = ref<string | null>(null);
const downloadFormats = ['dwg', 'dxf', 'mxweb', 'pdf'];

// 存储配额状态
const quotaModalOpen = ref(false);
const quotaLoading = ref(false);
const libraryQuota = ref(100);
const defaultLibraryQuota = ref(100);
const libraryStorageInfo = ref<any>(null);

// 多选模式
const isMultiSelectMode = ref(false);
const nodeSelections = ref<string[]>([]);
const selectedNodes = computed(() => new Set(nodeSelections.value));

// 确认对话框
const confirmDialog = ref({
  open: false,
  title: '',
  message: '',
  onConfirm: () => {},
});

// 列表视图表头
const listHeaders = [
  { key: 'select', title: '', width: '48px' },
  { key: 'name', title: '名称' },
  { key: 'size', title: '大小', width: '120px' },
  { key: 'updatedAt', title: '更新时间', width: '160px' },
  { key: 'actions', title: '', width: '64px' },
];

// 面包屑项
const breadcrumbItems = computed(() => [
  { title: '公共资源库', to: `/library/${libraryType.value}` },
  ...breadcrumbs.value.map((b) => ({
    title: b.name,
    to: b.id === libraryId.value ? `/library/${libraryType.value}` : `/library/${libraryType.value}/${b.id}`,
  })),
]);

// 初始化
const initialize = async () => {
  await loadLibraryId();
  await loadData();
};

const loadLibraryId = async () => {
  // TODO: 根据库类型获取对应的库 ID
  libraryId.value = 'library_' + libraryType.value;
};

const loadData = async () => {
  loading.value = true;
  error.value = null;
  try {
    const nodeId = route.params.nodeId as string;
    
    // 这里调用实际的 API
    if (libraryType.value === 'drawing') {
      // const response = await libraryApi.getDrawingNodes(nodeId || libraryId.value);
    } else {
      // const response = await libraryApi.getBlockNodes(nodeId || libraryId.value);
    }
    
    // 临时数据
    nodes.value = [
      { id: '1', name: '图纸示例1.dwg', isFolder: false, size: 1024 * 1024, updatedAt: new Date().toISOString() },
      { id: '2', name: '图纸示例2.dxf', isFolder: false, size: 512 * 1024, updatedAt: new Date().toISOString() },
      { id: '3', name: '文件夹示例', isFolder: true, size: 0, updatedAt: new Date().toISOString() },
    ];
    total.value = 3;
    totalPages.value = 1;
    
  } catch (err: any) {
    error.value = err.message || '加载数据失败';
  } finally {
    loading.value = false;
  }
};

const refresh = () => {
  loadData();
};

const clearError = () => {
  error.value = null;
};

// 节点操作
const getNodeIcon = (node: any) => {
  if (node.isFolder) return 'mdi-folder';
  if (node.name.endsWith('.dwg')) return 'mdi-file';
  if (node.name.endsWith('.dxf')) return 'mdi-file-code';
  if (node.name.endsWith('.pdf')) return 'mdi-file-pdf';
  return 'mdi-file';
};

const isSelected = (nodeId: string) => {
  return selectedNodes.value.has(nodeId);
};

const handleNodeClick = (node: any) => {
  if (isMultiSelectMode.value) {
    handleNodeSelect(node.id, true, false);
  }
};

const handleNodeDoubleClick = (node: any) => {
  if (node.isFolder) {
    enterNode(node);
  } else {
    handleOpenInEditor(node);
  }
};

const handleNodeSelect = (nodeId: string, isMultiSelect: boolean, isShift: boolean) => {
  if (!isMultiSelect) return;
  
  const index = nodeSelections.value.indexOf(nodeId);
  if (index > -1) {
    nodeSelections.value.splice(index, 1);
  } else {
    nodeSelections.value.push(nodeId);
  }
};

const handleSelectAll = () => {
  if (selectedNodes.value.size === nodes.value.length) {
    nodeSelections.value = [];
  } else {
    nodeSelections.value = nodes.value.map(n => n.id);
  }
};

const clearSelection = () => {
  nodeSelections.value = [];
};

const toggleMultiSelectMode = () => {
  isMultiSelectMode.value = !isMultiSelectMode.value;
  if (!isMultiSelectMode.value) {
    clearSelection();
  }
};

// 文件夹导航
const enterNode = (node: any) => {
  if (node.isFolder) {
    router.push(`/library/${libraryType.value}/${node.id}`);
  }
};

// 文件操作
const handleOpenInEditor = (node: any) => {
  if (node.isFolder) return;
  try {
    const editorUrl = `/cad-editor/${node.id}?library=${libraryType.value}`;
    window.open(editorUrl, '_blank');
    // showToast('正在打开文件');
  } catch (err) {
    console.error('打开文件失败:', err);
    // showToast('打开文件失败', 'error');
  }
};

const handleDownload = (node: any) => {
  if (node.isFolder) return;
  downloadingNodeId.value = node.id;
  downloadingFileName.value = node.name;
  showDownloadFormatModal.value = true;
};

const handleDownloadWithFormat = async (format: string) => {
  if (!downloadingNodeId.value) return;
  
  try {
    // 调用下载 API
    // await libraryOperations.handleDownloadWithFormat(downloadingNodeId.value, downloadingFileName.value, format);
    closeDownloadFormatModal();
    // showToast('下载开始', 'success');
  } catch (err) {
    console.error('下载失败:', err);
  }
};

const closeDownloadFormatModal = () => {
  showDownloadFormatModal.value = false;
  downloadingNodeId.value = null;
  downloadingFileName.value = null;
};

const getFormatIcon = (format: string) => {
  const icons: Record<string, string> = {
    dwg: 'mdi-file',
    dxf: 'mdi-file-code',
    mxweb: 'mdi-web',
    pdf: 'mdi-file-pdf',
  };
  return icons[format] || 'mdi-file';
};

const getFormatLabel = (format: string) => {
  const labels: Record<string, string> = {
    dwg: 'DWG 格式',
    dxf: 'DXF 格式',
    mxweb: 'MXWeb 格式',
    pdf: 'PDF 格式',
  };
  return labels[format] || format.toUpperCase();
};

// 文件夹操作
const openCreateFolderModal = () => {
  folderName.value = '';
  isCreateFolderModalOpen.value = true;
};

const handleCreateFolder = async () => {
  if (!folderName.value.trim()) return;
  
  try {
    const parentId = currentNode.value?.id || libraryId.value;
    // await createFolder(folderName.value.trim(), parentId);
    isCreateFolderModalOpen.value = false;
    // showToast('文件夹创建成功', 'success');
    refresh();
  } catch (err) {
    console.error('创建文件夹失败:', err);
  }
};

// 重命名
const handleRename = (node: any) => {
  renamingNode.value = node;
  if (!node.isFolder && node.name) {
    const lastDotIndex = node.name.lastIndexOf('.');
    renameName.value = lastDotIndex !== -1 ? node.name.substring(0, lastDotIndex) : node.name;
  } else {
    renameName.value = node.name;
  }
  isRenameModalOpen.value = true;
};

const closeRenameModal = () => {
  isRenameModalOpen.value = false;
  renamingNode.value = null;
  renameName.value = '';
};

const handleRenameSubmit = async () => {
  if (!renamingNode.value || !renameName.value.trim()) return;
  
  try {
    // await libraryOperations.handleRename(renamingNode.value.id, renameName.value.trim());
    closeRenameModal();
    refresh();
  } catch (err) {
    console.error('重命名失败:', err);
  }
};

// 移动/复制
const handleMove = (node: any) => {
  moveSourceNode.value = node;
  copySourceNode.value = null;
  showSelectFolderModal.value = true;
};

const handleCopy = (node: any) => {
  copySourceNode.value = node;
  moveSourceNode.value = null;
  showSelectFolderModal.value = true;
};

const closeSelectFolderModal = () => {
  showSelectFolderModal.value = false;
  moveSourceNode.value = null;
  copySourceNode.value = null;
};

const handleSelectFolderConfirm = async () => {
  try {
    // TODO: 实现移动/复制逻辑
    closeSelectFolderModal();
    refresh();
  } catch (err) {
    console.error('移动/复制失败:', err);
  }
};

// 删除
const handleDeleteConfirm = (node: any) => {
  confirmDialog.value = {
    open: true,
    title: '确认删除',
    message: `确定要永久删除 "${node.name}" 吗？删除后无法恢复。`,
    onConfirm: async () => {
      try {
        // await deleteNode(node.id);
        refresh();
        // showToast('删除成功', 'success');
      } catch (err) {
        console.error('删除失败:', err);
      }
    },
  };
};

const handleConfirm = async () => {
  await confirmDialog.value.onConfirm();
  confirmDialog.value.open = false;
};

// 批量操作
const handleBatchMove = () => {
  moveSourceNode.value = { id: 'batch', name: `${selectedNodes.value.size} 个项目` };
  copySourceNode.value = null;
  showSelectFolderModal.value = true;
};

const handleBatchCopy = () => {
  copySourceNode.value = { id: 'batch', name: `${selectedNodes.value.size} 个项目` };
  moveSourceNode.value = null;
  showSelectFolderModal.value = true;
};

const handleBatchDelete = () => {
  const count = selectedNodes.value.size;
  confirmDialog.value = {
    open: true,
    title: '确认删除',
    message: `确定要永久删除这 ${count} 个项目吗？删除后无法恢复。`,
    onConfirm: async () => {
      try {
        const nodeIds = Array.from(selectedNodes.value);
        for (const nodeId of nodeIds) {
          // const apiMethod = libraryType.value === 'drawing' ? libraryApi.deleteDrawingNode : libraryApi.deleteBlockNode;
          // await apiMethod(nodeId, true);
        }
        // showToast(`成功删除 ${count} 个项目`, 'success');
        clearSelection();
        refresh();
      } catch (err) {
        console.error('批量删除失败:', err);
      }
    },
  };
};

// 搜索
const handleSearchSubmit = () => {
  currentPage.value = 1;
  refresh();
};

// 存储配额
const openQuotaModal = async () => {
  quotaModalOpen.value = true;
  quotaLoading.value = true;
  
  try {
    const configResponse = await runtimeConfigApi.getPublicConfigs();
    const configs = configResponse.data as Record<string, any>;
    defaultLibraryQuota.value = configs?.libraryStorageQuota || 100;
    
    if (libraryId.value) {
      const response = await projectsApi.getQuota(libraryId.value);
      const storageInfo = response.data;
      if (storageInfo) {
        libraryStorageInfo.value = storageInfo;
        const totalGB = Math.round((storageInfo.total || defaultLibraryQuota.value * 1024 * 1024 * 1024) / (1024 * 1024 * 1024));
        libraryQuota.value = totalGB;
      } else {
        libraryQuota.value = defaultLibraryQuota.value;
      }
    } else {
      libraryQuota.value = defaultLibraryQuota.value;
    }
  } catch (err) {
    console.error('获取库配额失败:', err);
  } finally {
    quotaLoading.value = false;
  }
};

const saveLibraryQuota = async () => {
  if (!libraryId.value) return;
  
  quotaLoading.value = true;
  try {
    await projectsApi.updateStorageQuota(libraryId.value, libraryQuota.value);
    // showToast(`库配额已更新为 ${libraryQuota.value} GB`, 'success');
    quotaModalOpen.value = false;
    
    const response = await projectsApi.getQuota(libraryId.value);
    if (response.data) {
      libraryStorageInfo.value = response.data;
    }
  } catch (err: any) {
    console.error('保存库配额失败:', err);
  } finally {
    quotaLoading.value = false;
  }
};

const getQuotaColor = (percent: number) => {
  if (percent < 60) return 'success';
  if (percent < 80) return 'warning';
  return 'error';
};

// 工具函数
const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('zh-CN');
};

// 监听库类型变化
watch(libraryType, async (newType) => {
  searchTerm.value = '';
  currentPage.value = 1;
  await router.replace(`/library/${newType}`);
  await loadLibraryId();
  await loadData();
});

// 监听路由变化
watch(() => route.params, async () => {
  await loadData();
});

// 生命周期
onMounted(() => {
  initialize();
});
</script>

<style scoped>
/* 自定义样式 */
</style>
