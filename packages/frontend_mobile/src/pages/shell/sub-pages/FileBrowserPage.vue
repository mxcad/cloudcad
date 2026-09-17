<script setup lang="ts">
/**
 * 子页：文件浏览器 —— 项目卡片网格 + 个人空间统一列表。
 *
 * 真实数据：
 *   - 项目 Tab：projectControllerGetProjects（含搜索/分页）
 *   - 个人空间 Tab：projectControllerGetPersonalSpace → nodeControllerGetChildren
 *   - UnifiedFileList(domain='personal')
 *
 * 点击项目卡片 → router.push('/shell/file/project/:id')
 * 点击个人空间文件夹 → 进入文件夹
 * 点击个人空间文件 → 编辑器打开（openMxWeb）
 * FAB 上下文敏感：项目 Tab → 新建项目；个人空间 → 新建文件夹/上传
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showLoadingToast, closeToast, showDialog, showSuccessToast, showFailToast } from 'vant'
import type { PopoverAction } from 'vant'
import {
  projectControllerGetProjects,
  projectControllerCreateProject,
  projectControllerGetPersonalSpace,
  nodeControllerCreateFolder,
  nodeControllerBatchDeleteNodes,
  nodeControllerUpdateNode,
  nodeControllerMoveNode,
  nodeControllerCopyNode,
  nodeControllerBatchMoveNodes,
  nodeControllerBatchCopyNodes,
} from '@cloudcad/api-sdk/sdk.gen'
import { t } from '@/languages'
import { useCreateDrawing } from '@/composables/useCreateDrawing'
import type { ProjectListResponseDto, FileSystemNodeDto, ProjectFilterType } from '@cloudcad/api-sdk/types.gen'
import { useUnifiedFileList } from '@/composables/useUnifiedFileList'
import { useViewMode } from '@/composables/useViewMode'
import { formatNodeAsItems, formatTime } from '@/composables/useNodeFormatter'
import { openMxWeb } from '@/plugins/mxcad/openMxWeb'
import { useEditorState } from '@/composables/useEditorState'
import { calculateFileHash } from '@/utils/hashUtils'
import { uploadFile } from '@/services/mobileUploadService'
import { validateName } from '@/utils/validateName'
import { downloadControllerDownloadNodeWithFormat } from '@cloudcad/api-sdk/sdk.gen'
import { useBatchDownload } from '@/composables/useBatchDownload'
import UnifiedFileList from '../components/UnifiedFileList.vue'
import NodeFolderPicker from '../components/NodeFolderPicker.vue'
import RenameNodePopup from '../components/RenameNodePopup.vue'
import DownloadFormatPopup from '../components/DownloadFormatPopup.vue'
import BatchDownloadPanel from '../components/BatchDownloadPanel.vue'
import type { DownloadFormatPayload } from '../components/DownloadFormatPopup.vue'
import { ProjectIcon } from '../../../components/FileIcons'
import { useLoginPrompt } from '@/composables/useLoginPrompt'

const router = useRouter()
const activeTab = ref(0)
const keyword = ref('')

// A-11 项目筛选（对齐 PC ProjectFilterTabs：all/owned/joined，后端 QueryProjectsDto.filter）
const projectFilter = ref<ProjectFilterType>('all')
const projectFilterOptions: Array<{ value: ProjectFilterType; label: string }> = [
  { value: 'all', label: t('全部') },
  { value: 'owned', label: t('我创建的') },
  { value: 'joined', label: t('我加入的') },
]

interface ProjectCard {
  id: string
  name: string
  files: number
  updated: string
}

const projects = ref<ProjectCard[]>([])
const projectLoading = ref(false)
const projectError = ref('')
const projectPage = ref(1)
const projectTotalPages = ref(1)
const projectHasMore = computed(() => projectPage.value < projectTotalPages.value)

/** 项目卡片列表（真实分页：page/limit/totalPages，滚动到底加载更多） */
async function loadProjects(append = false) {
  projectLoading.value = true
  projectError.value = ''
  try {
    const res = await projectControllerGetProjects({
      query: {
        page: projectPage.value,
        limit: 20,
        filter: projectFilter.value,
        ...(keyword.value ? { search: keyword.value } : {}),
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
    })
    if (res.error) throw new Error(String(res.error))
    const data = (res.data ?? {}) as ProjectListResponseDto
    const cards = (data.nodes ?? []).map((n: FileSystemNodeDto) => ({
      id: n.id,
      name: n.name,
      files: n.childrenCount ?? 0,
      updated: formatTime(n.updatedAt),
    }))
    projects.value = append ? [...projects.value, ...cards] : cards
    projectTotalPages.value = data.totalPages ?? 1
  } catch (e) {
    projectError.value = '加载项目失败'
  } finally {
    projectLoading.value = false
  }
}

function loadMoreProjects() {
  if (projectLoading.value || !projectHasMore.value) return
  projectPage.value++
  loadProjects(true)
}

function onProjectScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) loadMoreProjects()
}

// 搜索防抖：300ms 后回到第一页重查（服务端 search 参数）
let projectSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(keyword, () => {
  if (activeTab.value !== 0) return
  if (projectSearchTimer) clearTimeout(projectSearchTimer)
  projectSearchTimer = setTimeout(() => {
    projectPage.value = 1
    loadProjects()
  }, 300)
})

// A-11 切换筛选维度（全部/我创建的/我加入的）→ 回到第一页重查
watch(projectFilter, () => {
  if (activeTab.value !== 0) return
  projectPage.value = 1
  loadProjects()
})

const personalFileList = useUnifiedFileList('personal')
const personalItems = computed(() =>
  formatNodeAsItems(personalFileList.nodes.value).map((item) => ({
    ...item,
    thumb: personalFileList.getThumbnailUrl(item.id),
  }))
)
const personalBreadcrumbs = computed(() => personalFileList.breadcrumbs.value)
const personalLoading = computed(() => personalFileList.loading.value)
const personalHasMore = computed(() => personalFileList.hasMore.value)
const personalError = ref('')
// A-16 视图模式（网格/清单）按域持久化，与项目详情各自记住
const personalMode = useViewMode('personal')
const editorState = useEditorState()

async function loadPersonalSpace() {
  personalError.value = ''
  try {
    const res = await projectControllerGetPersonalSpace()
    if (res.error) throw new Error(String(res.error))
    const space = res.data as { id?: string } | undefined
    if (space?.id) {
      await personalFileList.loadRootNode(space.id)
    }
  } catch (e) {
    personalError.value = '加载个人空间失败'
  }
}

watch(activeTab, (tab) => {
  if (tab === 0) {
    projectPage.value = 1
    loadProjects()
  } else {
    loadPersonalSpace()
  }
})

// 未登录引导：guest/token_expired 态自动跳原生登录页（同 tab 带 redirect 回跳）；
// 登录完成切 authenticated 后重新加载当前 Tab 数据
useLoginPrompt(() => {
  if (activeTab.value === 0) {
    projectPage.value = 1
    loadProjects()
  } else {
    loadPersonalSpace()
  }
})

function onProjectClick(project: ProjectCard) {
  router.push(`/shell/file/project/${project.id}`)
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function getNodeFileUrl(itemPath: string): string {
  if (!itemPath) return ''
  return `/api/v1/mxcad/filesData/${itemPath}?t=${Date.now()}`
}

async function onPersonalItemClick(item: { id: string; name: string; isFolder?: boolean; path?: string }) {
  if (item.isFolder) {
    const raw = personalFileList.nodes.value.find(n => n.id === item.id)
    if (raw) personalFileList.enterFolder(raw)
    return
  }

  const fileUrl = getNodeFileUrl(item.path || '')
  if (!fileUrl) return

  editorState.reset()
  editorState.setLoading(true)
  const ok = await openMxWeb(fileUrl)
  editorState.setLoading(false)

  if (ok) {
    editorState.setIsActive(true)
    editorState.setFileName(stripExt(item.name))
    router.back()
  } else {
    showFailToast('文件打开失败，请重试')
  }
}

// A-16 切换模式时写回持久化 ref（composable 内部 watch 落 localStorage）
function onPersonalModeChange(m: 'grid' | 'list') {
  personalMode.value = m
}

// ── 多选操作（B-03/B-17：move/copy 接线）──
function onPersonalSelectionAction(action: 'download' | 'delete' | 'move' | 'copy', items: Array<{ id: string; name: string }>) {
  if (action === 'delete') {
    batchDelete(items)
  } else if (action === 'move' || action === 'copy') {
    openFolderPicker(action, items)
  } else if (action === 'download') {
    for (const item of items) {
      const url = `/api/v1/file-system/nodes/${item.id}/download?t=${Date.now()}`
      const a = document.createElement('a')
      a.href = url
      a.download = item.name
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
    showSuccessToast(t('开始下载 {count} 个文件', { count: String(items.length) }))
  }
}

async function batchDelete(items: Array<{ id: string; name: string }>) {
  try {
    await showDialog({
      title: t('确认删除'),
      message: t('确定删除 {count} 个文件/文件夹？', { count: String(items.length) }),
      showCancelButton: true,
      confirmButtonColor: '#ff4444',
    })
  } catch { return }

  showLoadingToast({ message: t('删除中...'), forbidClick: true })
  try {
    const res = await nodeControllerBatchDeleteNodes({
      body: { nodeIds: items.map((i) => i.id), permanently: false },
    })
    closeToast()
    if (res.error) throw new Error(String(res.error))
    showSuccessToast(t('删除成功'))
    await personalFileList.loadNodes()
  } catch (e) {
    closeToast()
    showFailToast(t('删除失败'))
  }
}

// ── 单条目操作菜单（A-03）+ 重命名（A-04）+ 移动/复制（A-05）+ 格式下载（A-06）+ 文件夹下载（A-08）──
const menuTarget = ref<{ id: string; name: string; isFolder?: boolean; path?: string } | null>(null)
const showMenuSheet = ref(false)
const menuActions = computed(() => {
  const isFolder = !!menuTarget.value?.isFolder
  const actions: Array<{ name: string; color?: string }> = [
    { name: t('打开') },
    // 文件 → 格式转换下载（A-06）；文件夹 → 打包下载（A-08）
    isFolder ? { name: t('打包下载') } : { name: t('格式转换下载') },
    { name: t('重命名') },
    { name: t('移动') },
    { name: t('复制') },
    { name: t('删除'), color: '#ee0a24' },
  ]
  return actions
})

function onItemMenu(item: { id: string; name: string; isFolder?: boolean; path?: string }) {
  menuTarget.value = item
  showMenuSheet.value = true
}

function onMenuAction(action: { name: string }) {
  showMenuSheet.value = false
  const target = menuTarget.value
  if (!target) return
  if (action.name === t('打开')) {
    onPersonalItemClick(target)
  } else if (action.name === t('格式转换下载')) {
    openFormatDownload(target)
  } else if (action.name === t('打包下载')) {
    void downloadFolder(target)
  } else if (action.name === t('重命名')) {
    renameTarget.value = target
    showRename.value = true
  } else if (action.name === t('移动') || action.name === t('复制')) {
    openFolderPicker(action.name === t('移动') ? 'move' : 'copy', [target])
  } else if (action.name === t('删除')) {
    batchDelete([target])
  }
}

// ── A-06 格式转换下载（底部弹窗选格式 → downloadControllerDownloadNodeWithFormat blob）──
const showFormatPopup = ref(false)
const formatTarget = ref<{ id: string; name: string } | null>(null)

function openFormatDownload(target: { id: string; name: string }) {
  formatTarget.value = target
  showFormatPopup.value = true
}

async function onFormatDownloadConfirm(payload: DownloadFormatPayload) {
  const target = formatTarget.value
  if (!target) return
  showLoadingToast({ message: t('下载中...'), forbidClick: true })
  try {
    const query: Record<string, unknown> = { format: payload.format }
    if (payload.pdfOptions) {
      query.width = payload.pdfOptions.width
      query.height = payload.pdfOptions.height
      query.colorPolicy = payload.pdfOptions.colorPolicy
    }
    if (payload.dwgOptions) {
      query.dwgVersion = payload.dwgOptions.dwgVersion
    }
    const res = await downloadControllerDownloadNodeWithFormat({
      path: { nodeId: target.id },
      query,
      parseAs: 'blob',
    } as never)
    closeToast()
    if (res.error) throw new Error(String(res.error))
    const blob = res.data as Blob
    const nameWithoutExt = target.name.replace(/\.[^.]+$/, '')
    const finalName = `${nameWithoutExt}.${payload.format}`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = finalName
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showSuccessToast(t('下载成功'))
  } catch (e) {
    closeToast()
    showFailToast(t('下载失败'))
  }
}

// ── A-08 文件夹打包下载 + A-07 批量下载任务面板 ──
const { createFolderZipTask } = useBatchDownload()
const showBatchPanel = ref(false)

async function downloadFolder(target: { id: string; name: string }) {
  showLoadingToast({ message: t('正在创建打包任务...'), forbidClick: true })
  try {
    await createFolderZipTask(target.id, { name: target.name })
    closeToast()
    showSuccessToast(t('打包任务已创建'))
    showBatchPanel.value = true
  } catch (e) {
    closeToast()
    showFailToast(t('打包任务创建失败'))
  }
}

const showRename = ref(false)
const renameTarget = ref<{ id: string; name: string; isFolder?: boolean } | null>(null)

async function onRenameConfirm(name: string) {
  const target = renameTarget.value
  if (!target) return
  showRename.value = false
  showLoadingToast({ message: t('重命名中...'), forbidClick: true })
  try {
    const res = await nodeControllerUpdateNode({
      path: { nodeId: target.id },
      body: { name },
    } as any)
    closeToast()
    if (res.error) throw new Error(String(res.error))
    showSuccessToast(t('重命名成功'))
    await personalFileList.loadNodes()
  } catch (e) {
    closeToast()
    showFailToast(t('重命名失败'))
  }
}

const showFolderPicker = ref(false)
const folderPickerOp = ref<'move' | 'copy' | null>(null)
const folderPickerItems = ref<Array<{ id: string; name: string }>>([])

function openFolderPicker(op: 'move' | 'copy', items: Array<{ id: string; name: string }>) {
  if (!personalFileList.currentFolderId.value) {
    showFailToast(t('文件夹未就绪，请稍后再试'))
    return
  }
  folderPickerOp.value = op
  folderPickerItems.value = items
  showFolderPicker.value = true
}

async function onFolderPickerSelect(folder: { id: string; name: string }) {
  const op = folderPickerOp.value
  const items = folderPickerItems.value
  if (!op) return
  showFolderPicker.value = false
  showLoadingToast({ message: op === 'move' ? t('移动中...') : t('复制中...'), forbidClick: true })
  try {
    const res = items.length === 1
      ? op === 'move'
        ? await nodeControllerMoveNode({ path: { nodeId: items[0].id }, body: { targetParentId: folder.id } } as any)
        : await nodeControllerCopyNode({ path: { nodeId: items[0].id }, body: { targetParentId: folder.id } } as any)
      : op === 'move'
        ? await nodeControllerBatchMoveNodes({ body: { nodeIds: items.map((i) => i.id), targetParentId: folder.id } })
        : await nodeControllerBatchCopyNodes({ body: { nodeIds: items.map((i) => i.id), targetParentId: folder.id } })
    closeToast()
    if (res.error) throw new Error(String(res.error))
    showSuccessToast(op === 'move' ? t('移动成功') : t('复制成功'))
    await personalFileList.loadNodes()
  } catch (e) {
    closeToast()
    showFailToast(op === 'move' ? t('移动失败') : t('复制失败'))
  }
}

// ── 新建项目弹窗 ──
const showCreateProjectDialog = ref(false)
const projectNameInput = ref('')

async function onCreateProjectConfirm() {
  const name = projectNameInput.value.trim()
  if (!name) {
    showToast('请输入项目名称')
    return
  }
  showCreateProjectDialog.value = false
  showLoadingToast({ message: '创建中...', forbidClick: true })
  try {
    const res = await projectControllerCreateProject({
      body: { name },
    })
    if (res.error) throw new Error(String(res.error))
    const data = res.data as { id?: string; name?: string }
    closeToast()
    showToast('项目创建成功')
    if (data?.id) {
      router.push(`/shell/file/project/${data.id}`)
    } else {
      await loadProjects()
    }
  } catch (e) {
    closeToast()
    showToast('创建失败，请重试')
  }
}

// ── 新建文件夹弹窗 ──
const showCreateFolderDialog = ref(false)
const folderNameInput = ref('')
const showFabSheet = ref(false)

const fabActions = computed(() => {
  if (activeTab.value === 0) {
    return [{ key: 'createProject', text: t('新建项目'), icon: 'add-o' }]
  }
  return [
    { key: 'createFolder', text: t('新建文件夹'), icon: 'bag-o' },
    { key: 'createDrawing', text: t('新建图纸'), icon: 'description' },
    { key: 'uploadFile', text: t('上传文件'), icon: 'upload' },
    { key: 'downloadTasks', text: t('下载任务'), icon: 'down' },
  ]
})

function openCreateFolderDialog() {
  showCreateFolderDialog.value = true
  folderNameInput.value = ''
}

function onFabSheetSelect(action: PopoverAction) {
  showFabSheet.value = false
  switch (action.key) {
    case 'createProject':
      showCreateProjectDialog.value = true
      projectNameInput.value = ''
      break
    case 'createFolder':
      openCreateFolderDialog()
      break
    case 'createDrawing':
      openCreateDrawingDialog()
      break
    case 'uploadFile':
      triggerFileUpload()
      break
    case 'downloadTasks':
      showBatchPanel.value = true
      break
  }
}

async function onCreateFolderConfirm() {
  const name = folderNameInput.value.trim()
  const validation = validateName(name)
  if (!validation.valid) {
    showToast(validation.error || t('文件夹名称无效'))
    return
  }
  const parentId = personalFileList.currentFolderId.value
  if (!parentId) return

  showCreateFolderDialog.value = false
  showLoadingToast({ message: '创建中...', forbidClick: true })
  try {
    const res = await nodeControllerCreateFolder({
      path: { parentId },
      body: { name },
    })
    closeToast()
    if (res.error) throw new Error(String(res.error))
    showToast('文件夹创建成功')
    await personalFileList.loadNodes()
  } catch (e) {
    closeToast()
    showToast('创建失败，请重试')
  }
}

// ── 新建图纸（create-drawing 空白模板，后端自动补 .mxweb 后缀）──
const {
  showCreateDrawingDialog,
  drawingNameInput,
  openCreateDrawingDialog,
  onCreateDrawingConfirm,
} = useCreateDrawing(
  () => personalFileList.currentFolderId.value,
  () => personalFileList.loadNodes(),
)

// ── 文件上传 ──
const fileInputRef = ref<HTMLInputElement | null>(null)

function triggerFileUpload() {
  fileInputRef.value?.click()
}

/**
 * 上传走 mobileUploadService（SDK 生成函数 + MD5 哈希 + 秒传检查 + 5MB 分片），
 * 与 PC 端上传管线同一套后端契约；禁止原生 fetch/FormData（见 AGENTS.md 三层一致性）。
 */
async function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const parentId = personalFileList.currentFolderId.value
  if (!parentId) return

  showLoadingToast({ message: t('上传中...'), forbidClick: true, duration: 0 })
  try {
    const hash = await calculateFileHash(file)
    await uploadFile({
      file,
      hash,
      nodeId: parentId,
      onProgress: (pct) => {
        closeToast()
        showLoadingToast({
          message: t('上传中 {pct}%', { pct: String(Math.round(pct)) }),
          forbidClick: true,
          duration: 0,
        })
      },
    })
    closeToast()
    showToast(t('上传成功'))
    await personalFileList.loadNodes()
  } catch (e) {
    closeToast()
    showToast(t('上传失败，请重试'))
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <div class="subpage">
    <van-nav-bar title="文件" left-arrow @click-left="() => router.back()" />

    <van-tabs v-model:active="activeTab" line-width="28" class="file-tabs">
      <van-tab title="项目">
        <!-- A-11 项目筛选（对齐 PC ProjectFilterTabs：全部/我创建的/我加入的） -->
        <div class="project-filter">
          <button
            v-for="opt in projectFilterOptions"
            :key="opt.value"
            :class="['filter-chip', { active: projectFilter === opt.value }]"
            @click="projectFilter = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
        <div class="search-bar">
          <van-search v-model="keyword" placeholder="搜索项目" shape="round" />
        </div>
        <div v-if="projectError && projects.length === 0" class="state-box">
          <span class="state-text">{{ projectError }}</span>
          <van-button size="small" round @click="loadProjects">重试</van-button>
        </div>
        <div v-else-if="projectLoading && projects.length === 0" class="state-box">
          <van-loading size="24" />
          <span class="state-text">加载中...</span>
        </div>
        <div v-else-if="projects.length === 0" class="state-box">
          <span class="state-text">暂无项目</span>
        </div>
        <div v-else class="project-grid" @scroll.passive="onProjectScroll">
          <div
            v-for="p in projects"
            :key="p.id"
            class="project-card"
            @click="onProjectClick(p)"
          >
            <div class="card-header">
              <span class="card-name">{{ p.name }}</span>
            </div>
            <div class="card-body">
              <div class="card-thumb">
                <ProjectIcon size="100%" />
              </div>
            </div>
            <div class="card-footer">
              <span class="card-files">{{ p.files }} 个文件</span>
              <span class="card-time">{{ p.updated }}</span>
            </div>
          </div>
          <div v-if="projects.length > 0" class="grid-footer">
            <van-loading v-if="projectLoading" size="20" />
            <span v-else-if="!projectHasMore" class="state-text">没有更多了</span>
          </div>
        </div>
      </van-tab>

      <van-tab title="个人空间">
        <div v-if="personalError && personalItems.length === 0" class="state-box">
          <span class="state-text">{{ personalError }}</span>
          <van-button size="small" round @click="loadPersonalSpace">重试</van-button>
        </div>
        <UnifiedFileList
          v-else
          domain="personal"
          :items="personalItems"
          :loading="personalLoading"
          :mode="personalMode"
          :breadcrumb="personalBreadcrumbs"
          :has-more="personalHasMore"
          :load-more-failed="personalFileList.loadMoreFailed.value"
          :sort-by="personalFileList.sortBy.value"
          :sort-order="personalFileList.sortOrder.value"
          @item-click="onPersonalItemClick"
          @item-menu="onItemMenu"
          @breadcrumb-click="personalFileList.goBackTo"
          @mode-change="onPersonalModeChange"
          @selection-action="onPersonalSelectionAction"
          @search="personalFileList.setSearch"
          @load-more="personalFileList.loadMore"
          @load-more-retry="personalFileList.retryLoadMore"
          @refresh="personalFileList.refresh"
          @sort-change="personalFileList.setSort"
          @fab-click="openCreateFolderDialog"
        />
      </van-tab>
    </van-tabs>

    <van-popover
      v-model:show="showFabSheet"
      class="fab-popover"
      placement="bottom-end"
      :actions="fabActions"
      @select="onFabSheetSelect"
    >
      <template #reference>
        <button class="fab" aria-label="新建">
          <van-icon name="plus" />
        </button>
      </template>
    </van-popover>

    <van-popup v-model:show="showCreateProjectDialog" position="bottom" round :style="{ height: '48%' }">
      <div class="create-project-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showCreateProjectDialog = false">取消</button>
          <span class="panel-title">新建项目</span>
          <button class="panel-confirm" :disabled="!projectNameInput.trim()" @click="onCreateProjectConfirm">
            {{ projectNameInput.trim() ? '确定' : '确认' }}
          </button>
        </div>
        <van-field
          v-model="projectNameInput"
          maxlength="50"
          placeholder="请输入项目名称"
          autofocus
          clearable
          @keyup.enter="onCreateProjectConfirm"
        />
      </div>
    </van-popup>

    <van-popup v-model:show="showCreateFolderDialog" position="bottom" round :style="{ height: '40%' }">
      <div class="create-project-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showCreateFolderDialog = false">取消</button>
          <span class="panel-title">新建文件夹</span>
          <button class="panel-confirm" :disabled="!folderNameInput.trim()" @click="onCreateFolderConfirm">
            {{ folderNameInput.trim() ? '确定' : '确认' }}
          </button>
        </div>
        <van-field
          v-model="folderNameInput"
          maxlength="50"
          placeholder="请输入文件夹名称"
          autofocus
          clearable
          @keyup.enter="onCreateFolderConfirm"
        />
      </div>
    </van-popup>

    <van-popup v-model:show="showCreateDrawingDialog" position="bottom" round :style="{ height: '40%' }">
      <div class="create-project-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showCreateDrawingDialog = false">{{ t('取消') }}</button>
          <span class="panel-title">{{ t('新建图纸') }}</span>
          <button class="panel-confirm" @click="onCreateDrawingConfirm">{{ t('确定') }}</button>
        </div>
        <div class="drawing-name-row">
          <van-field
            v-model="drawingNameInput"
            maxlength="50"
            :placeholder="t('请输入图纸名称')"
            autofocus
            clearable
            @keyup.enter="onCreateDrawingConfirm"
          />
          <span class="drawing-suffix">.mxweb</span>
        </div>
      </div>
    </van-popup>

    <input
      ref="fileInputRef"
      type="file"
      accept=".mxweb,.dwg,.dxf,.xlsx,.pdf,.jpg,.png,.zip,.rar,.7z"
      style="display:none"
      @change="onFileInputChange"
    />

    <!-- 单条目操作菜单（A-03）+ 重命名（A-04）+ 移动/复制选文件夹（A-05） -->
    <van-action-sheet
      v-model:show="showMenuSheet"
      :actions="menuActions"
      @select="onMenuAction"
      @close="menuTarget = null"
    />
    <RenameNodePopup
      v-model:show="showRename"
      :initial-name="renameTarget?.name ?? ''"
      :keep-extension="!renameTarget?.isFolder"
      @confirm="onRenameConfirm"
    />
    <NodeFolderPicker
      v-model:show="showFolderPicker"
      :root-id="personalFileList.currentFolderId.value ?? ''"
      :root-name="t('个人空间')"
      :exclude-ids="folderPickerItems.map((i) => i.id)"
      @select="onFolderPickerSelect"
    />
    <DownloadFormatPopup
      v-model:show="showFormatPopup"
      :file-name="formatTarget?.name ?? ''"
      @confirm="onFormatDownloadConfirm"
    />
    <BatchDownloadPanel v-model:show="showBatchPanel" />
  </div>
</template>

<style scoped lang="scss">
.subpage {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

.search-bar {
  padding: 8px 14px 0;
  flex: none;
}

/* A-11 项目筛选 chips */
.project-filter {
  display: flex;
  gap: 8px;
  padding: 10px 14px 0;
  flex: none;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.filter-chip {
  flex: none;
  border: 1px solid var(--divider);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 14px;
  padding: 5px 12px;
  font-size: 12px;

  &.active {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
  }
}

.file-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.file-tabs :deep(.van-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.file-tabs :deep(.van-tab__panel) {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
}

.state-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.project-grid {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-content: start;
}

.project-card {
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 120px;
  position: relative;
  background: var(--bg-secondary);
  border: 1px solid var(--divider);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

  &:active {
    opacity: 0.85;
    transform: scale(0.98);
  }
}

.card-header {
  padding: 10px 12px 0;
}

.card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.card-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 0;
}

.card-thumb {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  opacity: 0.9;
}

.card-footer {
  padding: 6px 12px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.card-files {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}

.card-time {
  font-size: 10px;
  color: var(--text-tertiary);
}

.grid-footer {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 0;
}

.fab {
  position: fixed;
  right: 16px;
  bottom: 60px;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 169, 158, 0.4);
  z-index: 100;

  &:active {
    opacity: 0.85;
  }
}

.create-project-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 16px;
  border-bottom: 0.5px solid var(--divider);
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-cancel,
.panel-confirm {
  border: none;
  background: none;
  font-size: 14px;
  padding: 4px 8px;
}

.panel-cancel {
  color: var(--text-tertiary);
}

.panel-confirm {
  color: var(--accent);
  font-weight: 600;
  opacity: 0.5;
  cursor: default;

  &:not(:disabled) {
    opacity: 1;
    cursor: pointer;
  }

  &:disabled {
    pointer-events: none;
  }
}

.drawing-name-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;

  :deep(.van-field) {
    flex: 1;
  }
}

.drawing-suffix {
  font-size: 14px;
  color: var(--text-secondary);
  padding-top: 14px;
  flex-shrink: 0;
}
</style>

<style lang="scss">
/* FAB 弹出菜单（参考 CAD 编辑器风格，非 scoped 以覆盖 Vant 内部元素） */
.fab-popover {
  .van-popover__arrow {
    --van-popover-light-background: var(--accent-secondary);
  }

  .van-popover__content {
    --van-popover-action-width: auto;
    --van-popover-radius: 0;
    border-top: 2px solid var(--accent-secondary);
    border-radius: 0;
  }

  .van-popover__action {
    border-bottom: 2px solid #202020;
    --van-popover-action-height: 30px;
    --van-popover-action-font-size: var(--van-font-size-xs);

    &:active {
      background: #666666;
    }

    .van-hairline--bottom:after {
      border-bottom-width: 0;
    }
  }
}
</style>