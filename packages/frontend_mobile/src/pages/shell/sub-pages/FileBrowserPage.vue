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
 * 点击个人空间文件 → 编辑器打开（useShellFileOpen → useFileLoader.loadByNodeId）
 * FAB 上下文敏感：项目 Tab → 新建项目；个人空间 → 新建文件夹/上传
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showLoadingToast, closeToast, showFailToast } from 'vant'
import type { ActionSheetAction } from 'vant'
import {
  projectControllerGetProjects,
  projectControllerCreateProject,
  projectControllerGetPersonalSpace,
} from '@cloudcad/api-sdk/sdk.gen'
import { loadProjectPermissions, invalidateProjectPermissions } from '@/services/permissionService'
import { t } from '@/languages'
import { unwrap } from '@/utils/apiError'
import { useCreateDrawing } from '@/composables/useCreateDrawing'
import type { ProjectListResponseDto, FileSystemNodeDto, ProjectFilterType } from '@cloudcad/api-sdk/types.gen'
import { useUnifiedFileList } from '@/composables/useUnifiedFileList'
import { useViewMode } from '@/composables/useViewMode'
import { useProjectActions } from '@/composables/useProjectActions'
import { useProjectSearch } from '@/composables/useProjectSearch'
import { useLongPress } from '@/composables/useLongPress'
import { formatNodeAsItems, formatTime } from '@/composables/useNodeFormatter'
import type { FileListItem } from '@/composables/useNodeFormatter'
import { useShellFileOpen } from '@/composables/useShellFileOpen'
import { useShellStack } from '@/stores/shellStack'
import { vibrate } from '@/utils/vibrate'
import { useFormatDownload } from '@/composables/useFormatDownload'
import UnifiedFileList from '../components/UnifiedFileList.vue'
import TrashView from '../components/TrashView.vue'
import NodeFolderPicker from '../components/NodeFolderPicker.vue'
import { useClipboardPaste } from '@/composables/useClipboardPaste'
import { useUndoSnackbar } from '@/composables/useUndoSnackbar'
import { useFileNodeOps, type FabActionKey } from '@/composables/useFileNodeOps'
import { isCadFileName } from '@/utils/cadFile'
import { getFileNodeMenuActions, getProjectMenuActions, type ProjectMenuAction } from '@/utils/projectPermissions'
import { isNearScrollBottom } from '@/utils/scroll'
import { backOrFallback } from '@/utils/backNavigation'
import { useNodeDownload } from '@/composables/useNodeDownload'
import UndoSnackbar from '@/components/UndoSnackbar.vue'
import RenameNodePopup from '../components/RenameNodePopup.vue'
import ProjectEditPopup from '../components/ProjectEditPopup.vue'
import DownloadFormatPopup from '../components/DownloadFormatPopup.vue'
import BatchDownloadPanel from '../components/BatchDownloadPanel.vue'
import { ProjectIcon, FolderIcon } from '../../../components/FileIcons'
import { useLoginPrompt } from '@/composables/useLoginPrompt'
import ShareCurrentPopup from '@/pages/home/components/ShareCurrentPopup.vue'
import VersionHistoryPopup from '@/pages/home/components/VersionHistoryPopup.vue'
import FileFilterPopup from '@/pages/shell/components/FileFilterPopup.vue'

const router = useRouter()
const route = useRoute()
// 0=我的项目 1=个人空间。回收站不再是独立 tab：对齐 PC 概念，回收站是「当前上下文」的
// 视图——nav bar 右侧入口按当前 tab 定 scope（项目列表 tab → 全局回收站，个人空间 tab →
// 个人回收站），打开后替换 tab 内容（TrashView），左箭头返回文件列表。
// ?domain=personal 是 PC /personal-space 落地时的语义标记（映射表固定注入），首次直接停在个人空间。
// 初始 Tab 的数据由 useLoginPrompt 的 immediate watch 按 activeTab 分流加载。
const activeTab = ref(route.query.domain === 'personal' ? 1 : 0)
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
  description: string
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
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
    })
    unwrap(res)
    const data = (res.data ?? {}) as ProjectListResponseDto
    const cards = (data.nodes ?? []).map((n: FileSystemNodeDto) => ({
      id: n.id,
      name: n.name,
      description: n.description ?? '',
      files: n.childrenCount ?? 0,
      updated: formatTime(n.updatedAt),
    }))
    projects.value = append ? [...projects.value, ...cards] : cards
    projectTotalPages.value = data.totalPages ?? 1
  } catch (e) {
    projectError.value = t('加载项目失败')
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
  if (isNearScrollBottom(el)) loadMoreProjects()
}

// ── 全局递归搜索（keyword 非空 → scope=global：项目命中 + 文件/文件夹命中混合结果）──
const projectSearch = useProjectSearch()
const searchItems = computed(() => formatNodeAsItems(projectSearch.results.value))

function onSearchResultScroll(e: Event) {
  const el = e.target as HTMLElement
  if (isNearScrollBottom(el)) projectSearch.loadMore()
}

// 全局搜索结果交互：项目命中→进入项目；文件夹命中→进入该文件夹（A-29b，URL 带
// ?folderId= 由项目详情页定位到该文件夹，不再只跳项目根丢失位置）；文件命中→打开
function onSearchResultClick(item: FileListItem) {
  if (item.nodeType === 'PROJECT') {
    router.push(`/shell/file/project/${item.id}`)
    return
  }
  const node = projectSearch.results.value.find((n) => n.id === item.id)
  if (item.isFolder) {
    if (node?.projectId) {
      router.push({ path: `/shell/file/project/${node.projectId}`, query: { folderId: item.id } })
    } else activeTab.value = 1
    return
  }
  // H1：同 onPersonalItemClick——非 CAD 文件命中直接原格式下载
  if (!isCadFileName(item.name)) {
    void downloadOriginal(item.id, item.name)
    return
  }
  void openFromList(item.id, { path: '/shell/file', tab: 0 })
}

// A-29b 搜索结果行长按 →「打开所在位置」（定位父文件夹，对齐 PC open_file_location）。
// 与项目卡片同套 500ms 手势（唯一出口 useLongPress）；触发后抑制随后的 click。
const showSearchRowMenu = ref(false)
const searchRowMenuTarget = ref<FileListItem | null>(null)
const searchRowLongPress = useLongPress<FileListItem>({
  onTrigger: (item) => {
    searchRowMenuTarget.value = item
    showSearchRowMenu.value = true
    vibrate()
  },
})

// 长按守卫：只抑制长按后紧随的合成 click（消费后复位），否则菜单关闭后首次点行被吞
function onSearchRowTap(item: FileListItem) {
  if (searchRowLongPress.shouldSuppressTap()) return
  onSearchResultClick(item)
}

function onSearchRowMenuSelect() {
  showSearchRowMenu.value = false
  const item = searchRowMenuTarget.value
  if (!item) return
  const node = projectSearch.results.value.find((n) => n.id === item.id)
  if (!node?.projectId || !node.parentId) return
  // 定位父文件夹（ancestorPath 无 id 无法还原面包屑，breadcrumbs 留空，列表定位到父文件夹）
  router.push({ path: `/shell/file/project/${node.projectId}`, query: { folderId: node.parentId } })
}

// 搜索防抖：300ms 后 keyword 非空切全局递归搜索，清空回正常项目列表
let projectSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(keyword, () => {
  if (activeTab.value !== 0) return
  if (projectSearchTimer) clearTimeout(projectSearchTimer)
  projectSearchTimer = setTimeout(() => {
    if (keyword.value) {
      projectSearch.searchFromFirstPage(keyword.value, projectFilter.value)
    } else {
      projectSearch.clear()
    }
  }, 300)
})

// A-11 切换筛选维度（全部/我创建的/我加入的）→ 回到第一页重查（keyword 非空时重查全局搜索）
watch(projectFilter, () => {
  if (activeTab.value !== 0) return
  if (keyword.value) {
    projectSearch.searchFromFirstPage(keyword.value, projectFilter.value)
  } else {
    projectPage.value = 1
    loadProjects()
  }
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
const shellStack = useShellStack()
const { openFromList } = useShellFileOpen()
const { downloadOriginal } = useNodeDownload()

// 个人空间根 id：个人空间 tab 与回收站 personal scope 共用，惰性取一次
const personalSpaceId = ref<string | null>(null)

async function ensurePersonalSpaceId() {
  if (personalSpaceId.value) return
  const res = await projectControllerGetPersonalSpace()
  unwrap(res)
  const space = res.data as { id?: string } | undefined
  if (space?.id) personalSpaceId.value = space.id
}

async function loadPersonalSpace() {
  personalError.value = ''
  try {
    await ensurePersonalSpaceId()
    if (personalSpaceId.value) {
      // 打开图纸返回：优先还原打开前所在的文件夹（消费一次）；否则走位置持久化存档。
      // takeReturnTargetForTab 校验归属：项目详情页写入的目标不带 tab，若未校验就把
      // 项目子文件夹还原成个人空间的位置（点个人空间却看到项目里的界面，且该目标被
      // 消费掉后「再切一次」才恢复正常）。
      const target = shellStack.takeReturnTargetForTab(1)
      if (target?.folderId && target.breadcrumbs?.length) {
        await personalFileList.loadRootNode(personalSpaceId.value, {
          folderId: target.folderId,
          breadcrumbs: target.breadcrumbs,
        })
      } else {
        await personalFileList.loadRootNode(personalSpaceId.value)
      }
    }
  } catch (e) {
    personalError.value = t('加载个人空间失败')
  }
}

watch(activeTab, (tab) => {
  if (tab === 0) {
    projectPage.value = 1
    loadProjects()
  } else if (tab === 1) {
    loadPersonalSpace()
  }
})

// 打开图纸返回：先切回个人空间 Tab（watch(activeTab) 触发 loadPersonalSpace 还原文件夹）
onMounted(() => {
  if (shellStack.returnTarget?.tab === 1) {
    activeTab.value = 1
  }
})

// 未登录引导：guest/token_expired 态自动跳原生登录页（同 tab 带 redirect 回跳）；
// 登录完成切 authenticated 后重新加载当前 Tab 数据
useLoginPrompt(() => {
  if (activeTab.value === 0) {
    projectPage.value = 1
    loadProjects()
  } else if (activeTab.value === 1) {
    loadPersonalSpace()
  }
})

function onProjectClick(project: ProjectCard) {
  router.push(`/shell/file/project/${project.id}`)
}

// ── 项目级操作（卡片「更多」/长按/右键：权限门控的管理菜单，对齐 PC 项目卡片菜单 + 详情页管理入口）──
const projectActions = useProjectActions(() => loadProjects())
const projectMenuTarget = ref<ProjectCard | null>(null)
const showProjectMenuSheet = ref(false)
const projectPermissions = ref<string[]>([])

// 门控表 + 装配表收在 getProjectMenuActions（与项目详情页共用），此处只留分派
const projectMenuActions = computed(() => getProjectMenuActions(projectPermissions.value))

const showProjectEdit = ref(false)

// 长按检测（与 UnifiedFileList 文件项同套 500ms 手势，唯一出口 useLongPress）：触发后抑制随后的 click
const projectLongPress = useLongPress<ProjectCard>({
  onTrigger: (project) => {
    void openProjectMenu(project)
    vibrate()
  },
})

/** 打开项目操作菜单：先拉该项目的权限（门控菜单项），再弹菜单；拉取失败回退为仅基础项 */
async function openProjectMenu(project: ProjectCard) {
  projectMenuTarget.value = project
  // 统一走 permissionService（TTL 缓存 + 失败回退旧值）；每次开菜单先失效缓存，保证门控项最新
  invalidateProjectPermissions(project.id)
  projectPermissions.value = await loadProjectPermissions(project.id)
  showProjectMenuSheet.value = true
}

// 长按守卫：只抑制长按后紧随的合成 click（消费后复位），否则菜单关闭后首次点卡片被吞
function onProjectCardTap(project: ProjectCard) {
  if (projectLongPress.shouldSuppressTap()) return
  onProjectClick(project)
}

function onProjectMenuAction(action: ProjectMenuAction) {
  showProjectMenuSheet.value = false
  const target = projectMenuTarget.value
  if (!target) return
  switch (action.key) {
    case 'edit':
      showProjectEdit.value = true
      break
    case 'members':
      router.push(`/shell/file/project/${target.id}?manage=members`)
      break
    case 'roles':
      router.push(`/shell/file/project/${target.id}?manage=roles`)
      break
    case 'transfer':
      router.push(`/shell/file/project/${target.id}?manage=transfer`)
      break
    case 'history':
      router.push(`/shell/file/project/${target.id}?manage=history`)
      break
    case 'delete':
      void projectActions.remove(target.id, target.name)
      break
  }
}

/** 编辑项目（名称+描述）：成功后本地同步卡片，避免列表名与详情不一致 */
async function onProjectEditConfirm(payload: { name: string; description: string }) {
  const target = projectMenuTarget.value
  if (!target) return
  showProjectEdit.value = false
  const ok = await projectActions.update(target.id, payload)
  if (ok) {
    target.name = payload.name
    target.description = payload.description
  }
}

async function onPersonalItemClick(item: { id: string; name: string; isFolder?: boolean; path?: string }) {
  if (item.isFolder) {
    const raw = personalFileList.nodes.value.find(n => n.id === item.id)
    if (raw) personalFileList.enterFolder(raw)
    return
  }
  // H1：非 CAD 文件（图片/PDF/表格等）不走 CAD 编辑器——无 fileHash 会误报「尚未转换完成」。
  // 对齐 PC handleFileOpen：CAD 扩展名走编辑器，其余直接原格式下载。
  if (!isCadFileName(item.name)) {
    void downloadOriginal(item.id, item.name)
    return
  }

  void openFromList(item.id, {
    path: '/shell/file',
    tab: 1,
    folderId: personalFileList.currentFolderId.value,
    breadcrumbs: personalFileList.breadcrumbs.value,
  })
}

// A-16 切换模式时写回持久化 ref（composable 内部 watch 落 localStorage）
function onPersonalModeChange(m: 'grid' | 'list') {
  personalMode.value = m
}

// ── 回收站（对齐 PC 概念：回收站是「当前上下文」的视图，不再是独立 tab + 手动选 scope）──
// nav bar 右侧入口按当前 tab 定 scope：我的项目 tab → 全局回收站（已删项目根 + 全部已删条目），
// 个人空间 tab → 个人回收站。打开后 TrashView 替换 tab 内容，nav bar 左箭头返回文件列表。
const trashContext = ref<null | 'global' | 'personal'>(null)
// 回收站内动作成功（恢复/彻底删除/清空）后置 true；关闭回收站时据此刷新当前 tab 列表
const trashDirty = ref(false)

function openTrash() {
  trashDirty.value = false
  trashContext.value = activeTab.value === 1 ? 'personal' : 'global'
}

function closeTrash() {
  trashContext.value = null
  const dirty = trashDirty.value
  trashDirty.value = false
  if (!dirty) return
  // 动作后背景文件列表可能已变化（恢复项重新出现/删除项消失）→ 刷新当前 tab
  if (activeTab.value === 0) {
    // 搜索态：重跑全局搜索（与 watch(projectFilter) 同模式），否则视图仍显示旧搜索结果
    if (keyword.value) {
      projectSearch.searchFromFirstPage(keyword.value, projectFilter.value)
    } else {
      projectPage.value = 1
      loadProjects()
    }
  } else if (activeTab.value === 1) {
    loadPersonalSpace()
  }
}

function onTrashChanged() {
  trashDirty.value = true
}

// ── 单条目操作菜单（A-03）+ 重命名（A-04）+ 移动/复制（A-05）+ 格式下载（A-06）+ 文件夹下载（A-08）──
// menuTarget/showMenuSheet 等状态与 onItemMenu/onMenuAction 已收敛进 useFileNodeOps（见文件底部 ctx）
const menuActions = computed(() => {
  const isFolder = !!menuTarget.value?.isFolder
  // CAD 图纸 → 外部参照管理（对齐 PC isCadFile visibilityCheck；个人空间=所有者恒可管理）
  const isCad = !isFolder && menuTarget.value ? isCadFileName(menuTarget.value.name) : false
  // 个人空间=所有者，各操作恒可 → 传全 true 的 can，与项目页共用 getFileNodeMenuActions 装配逻辑
  return getFileNodeMenuActions({
    isFolder,
    isCad,
    can: {
      download: true,
      share: true,
      externalRef: true,
      versionHistory: true,
      rename: true,
      move: true,
      copy: true,
      delete: true,
    },
  })
})

// ── A-06/A-07 格式转换下载 + 批量下载任务面板（个人空间：zip 任务不带 projectId）──
// 状态机收敛到 useFormatDownload（与 ProjectDetailPage 共用，唯一差异是 zip 是否带 projectId）
const formatDownload = useFormatDownload()
const {
  showBatchPanel,
  showFormatPopup,
  formatTarget,
  formatDownloadMode,
  batchConvertCount,
  onFormatDownloadConfirm,
} = formatDownload

// 粘贴预判：目标=当前个人空间；策略禁止跨项目转移 → 禁用粘贴 + 原因（对齐 PC）
const pastePolicy = useClipboardPaste(() => ({
  id: personalSpaceId.value ?? '',
  domain: 'personalSpace',
}))

// 删除/复制/移动撤销：操作成功后浮出撤销条，限时内点「撤销」回滚；回滚失败经 onError 弹「撤销失败」
const undo = useUndoSnackbar(5000, () => showFailToast(t('撤销失败')))

// ── 新建项目弹窗 ──
const showCreateProjectDialog = ref(false)
const projectNameInput = ref('')

async function onCreateProjectConfirm() {
  const name = projectNameInput.value.trim()
  if (!name) {
    showToast(t('请输入项目名称'))
    return
  }
  showCreateProjectDialog.value = false
  showLoadingToast({ message: t('创建中...'), forbidClick: true })
  try {
    const res = await projectControllerCreateProject({
      body: { name },
    })
    unwrap(res)
    const data = res.data as { id?: string; name?: string }
    closeToast()
    showToast(t('项目创建成功'))
    if (data?.id) {
      router.push(`/shell/file/project/${data.id}`)
    } else {
      await loadProjects()
    }
  } catch (e) {
    closeToast()
    showToast(t('创建失败，请重试'))
  }
}

// van-action-sheet 用 name 字段（van-popover 用 text）；key 作跨语言稳定判别符
// （showCreateFolderDialog/folderNameInput/showFabSheet 已收敛进 useFileNodeOps，见文件底部 ctx）
type FabAction = ActionSheetAction & { key: FabActionKey }

// 项目 Tab：+ 直接新建项目（唯一动作，无需选择）；个人空间 Tab：+ 弹菜单选新建/上传/下载任务
function onFabClick() {
  if (activeTab.value === 0) {
    showCreateProjectDialog.value = true
    projectNameInput.value = ''
    return
  }
  showFabSheet.value = true
}

const fabActions = computed<FabAction[]>(() => [
  { key: 'createFolder', name: t('新建文件夹'), icon: 'bag-o' },
  { key: 'createDrawing', name: t('新建图纸'), icon: 'description' },
  { key: 'uploadFile', name: t('上传文件'), icon: 'arrow-up' },
  { key: 'downloadTasks', name: t('下载任务'), icon: 'down' },
])

// ── 新建图纸（create-drawing 空白模板，后端自动补 .mxweb 后缀）──
// 撤销决策内聚在 useCreateDrawing（对齐 useFileNodeOps.onCreateFolderConfirm）
const createDrawing = useCreateDrawing(
  () => personalFileList.currentFolderId.value,
  () => personalFileList.loadNodes(),
  undo,
)
const {
  showCreateDrawingDialog,
  drawingNameInput,
  openCreateDrawingDialog,
  onCreateDrawingConfirm,
} = createDrawing

// ── 文件节点操作层（C2：与 ProjectDetailPage 共用 useFileNodeOps，差异收敛进 ctx）──
const {
  menuTarget,
  showMenuSheet,
  showSharePopup,
  shareTarget,
  showVersionPopup,
  versionTarget,
  showFilterPopup,
  showRename,
  renameTarget,
  showFolderPicker,
  showCreateFolderDialog,
  folderNameInput,
  showFabSheet,
  fileInputRef,
  onItemMenu,
  onMenuAction,
  onSelectionAction,
  batchDelete,
  openExternalRefManage,
  openShare,
  openVersionHistory,
  onOpenHistoricalVersion,
  onFilterApply,
  onRenameConfirm,
  onClearPaste,
  onPaste,
  openFolderPicker,
  onPickerRootChange,
  onFolderPickerSelect,
  openCreateFolderDialog,
  onFabSheetSelect,
  onCreateFolderConfirm,
  triggerFileUpload,
  onFileInputChange,
  // 文件夹选择器（NodeFolderPicker 模板绑定）：目标根/策略预判/源项排除
  transferTargets,
  crossTransfer,
  folderPickerItems,
} = useFileNodeOps({
  reloadAfterOp: () => personalFileList.loadNodes(),
  currentFolderId: personalFileList.currentFolderId,
  breadcrumbs: personalFileList.breadcrumbs,
  rootId: personalFileList.rootId,
  setFilters: personalFileList.setFilters,
  spaceId: personalSpaceId,
  personalSpaceId,
  ensurePersonalSpaceId,
  domain: 'personalSpace',
  openItem: onPersonalItemClick,
  openHistoricalVersion: (nodeId) => {
    void openFromList(nodeId, {
      path: '/shell/file',
      tab: 1,
      folderId: personalFileList.currentFolderId.value,
      breadcrumbs: personalFileList.breadcrumbs.value,
    })
  },
  resolveParentId: () => personalFileList.currentFolderId.value,
  folderPickerGuard: () => personalSpaceId.value,
  transferSource: () => ({ id: personalSpaceId.value as string, name: t('个人空间'), domain: 'personalSpace' }),
  pasteGate: pastePolicy.canPaste,
  pasteDisabledReason: pastePolicy.pasteDisabledReason,
  downloadOriginal,
  formatDownload,
  createDrawing,
  undo,
})
</script>

<template>
  <div class="subpage">
    <!-- 回收站打开时：标题变「回收站」，左箭头返回文件列表（对齐 PC 回收站 toggle）；
         未打开时右侧「回收站」入口按当前 tab 定 scope（项目列表 tab→全局，个人空间 tab→个人） -->
    <van-nav-bar
      :title="trashContext ? t('回收站') : t('文件')"
      left-arrow
      @click-left="trashContext ? closeTrash() : backOrFallback(router, '/shell')"
    >
      <template v-if="!trashContext" #right>
        <van-icon name="delete-o" size="20" @click="openTrash" />
      </template>
    </van-nav-bar>

    <van-tabs v-show="!trashContext" v-model:active="activeTab" line-width="28" class="file-tabs">
      <van-tab :title="t('我的项目')">
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
          <van-search v-model="keyword" :placeholder="t('搜索项目或文件')" shape="round" />
        </div>
        <!-- 全局搜索态（keyword 非空）：混合结果 = 项目命中（项目卡片）+ 文件/文件夹命中（文件行 + 来源徽章） -->
        <template v-if="keyword">
          <div v-if="projectSearch.error.value && projectSearch.results.value.length === 0" class="state-box">
            <span class="state-text">{{ projectSearch.error.value }}</span>
            <van-button size="small" round @click="projectSearch.searchFromFirstPage(keyword, projectFilter)">{{ t('重试') }}</van-button>
          </div>
          <div v-else-if="projectSearch.loading.value && projectSearch.results.value.length === 0" class="state-box">
            <van-loading size="24" />
            <span class="state-text">{{ t('加载中...') }}</span>
          </div>
          <div v-else-if="projectSearch.results.value.length === 0" class="state-box">
            <span class="state-text">{{ t('未找到相关项目或文件') }}</span>
          </div>
          <div v-else class="project-grid" @scroll.passive="onSearchResultScroll">
            <template v-for="item in searchItems" :key="item.id">
              <div v-if="item.nodeType === 'PROJECT'" class="project-card" @click="onSearchResultClick(item)">
                <div class="card-header">
                  <span class="card-name">{{ item.name }}</span>
                </div>
                <div class="card-body">
                  <div class="card-thumb">
                    <ProjectIcon size="100%" />
                  </div>
                </div>
                <div class="card-footer">
                  <span class="card-time">{{ item.time }}</span>
                </div>
              </div>
              <div
                v-else
                class="search-row"
                @click="onSearchRowTap(item)"
                @touchstart.passive="searchRowLongPress.start(item)"
                @touchend="searchRowLongPress.cancel"
                @touchmove="searchRowLongPress.cancel"
              >
                <div class="search-row-icon" :class="item.isFolder ? 'search-row-icon--folder' : 'search-row-icon--file'">
                  <FolderIcon v-if="item.isFolder" :size="20" />
                  <van-icon v-else name="description" size="20" />
                </div>
                <div class="search-row-body">
                  <span class="search-row-name">{{ item.name }}</span>
                  <span class="search-row-sub">{{ item.isFolder ? t('文件夹') : `${item.time ?? ''} · ${item.size ?? ''}` }}</span>
                  <span v-if="item.ancestorPath" class="search-row-source">{{ item.ancestorPath }}</span>
                </div>
              </div>
            </template>
            <div v-if="projectSearch.results.value.length > 0" class="grid-footer">
              <van-loading v-if="projectSearch.loading.value" size="20" />
              <span v-else-if="!projectSearch.hasMore.value" class="state-text">{{ t('没有更多了') }}</span>
            </div>
          </div>
        </template>
        <!-- 正常项目列表（keyword 为空） -->
        <template v-else>
        <div v-if="projectError && projects.length === 0" class="state-box">
          <span class="state-text">{{ projectError }}</span>
          <van-button size="small" round @click="loadProjects">{{ t('重试') }}</van-button>
        </div>
        <div v-else-if="projectLoading && projects.length === 0" class="state-box">
          <van-loading size="24" />
          <span class="state-text">{{ t('加载中...') }}</span>
        </div>
        <div v-else-if="projects.length === 0" class="state-box">
          <span class="state-text">{{ t('暂无项目') }}</span>
        </div>
        <div v-else class="project-grid" @scroll.passive="onProjectScroll">
          <div
            v-for="p in projects"
            :key="p.id"
            class="project-card"
            @click="onProjectCardTap(p)"
            @touchstart.passive="projectLongPress.start(p)"
            @touchend="projectLongPress.cancel"
            @touchmove="projectLongPress.cancel"
            @contextmenu.prevent="openProjectMenu(p)"
          >
            <!-- 项目管理入口（对齐 PC 项目卡片菜单；长按手势保留） -->
            <button class="card-more" @click.stop="openProjectMenu(p)" :aria-label="t('更多')">
              <van-icon name="ellipsis" size="16" />
            </button>
            <div class="card-header">
              <span class="card-name">{{ p.name }}</span>
            </div>
            <div class="card-body">
              <div class="card-thumb">
                <ProjectIcon size="100%" />
              </div>
            </div>
            <div class="card-footer">
              <span class="card-files">{{ t('{count} 个文件', { count: p.files }) }}</span>
              <span class="card-time">{{ p.updated }}</span>
            </div>
          </div>
          <div v-if="projects.length > 0" class="grid-footer">
            <van-loading v-if="projectLoading" size="20" />
            <span v-else-if="!projectHasMore" class="state-text">{{ t('没有更多了') }}</span>
          </div>
        </div>
        </template>
      </van-tab>

      <van-tab :title="t('个人空间')">
        <div v-if="personalError && personalItems.length === 0" class="state-box">
          <span class="state-text">{{ personalError }}</span>
          <van-button size="small" round @click="loadPersonalSpace">{{ t('重试') }}</van-button>
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
          :filter-active="personalFileList.hasActiveFilters.value"
          :enable-paste="true"
          :paste-disabled="!pastePolicy.canPaste.value"
          :paste-disabled-reason="pastePolicy.pasteDisabledReason.value"
          @item-click="onPersonalItemClick"
          @item-menu="onItemMenu"
          @breadcrumb-click="personalFileList.goBackTo"
          @mode-change="onPersonalModeChange"
          @selection-action="onSelectionAction"
          @search="personalFileList.setSearch"
          @load-more="personalFileList.loadMore"
          @load-more-retry="personalFileList.retryLoadMore"
          @refresh="personalFileList.refresh"
          @sort-change="personalFileList.setSort"
          @filter="showFilterPopup = true"
          @fab-click="openCreateFolderDialog"
          @paste="onPaste"
          @clear-paste="onClearPaste"
        />
      </van-tab>

    </van-tabs>

    <!-- 回收站视图（对齐 PC：当前上下文的视图，scope 由入口 tab 决定；动作成功后关站刷新列表） -->
    <TrashView
      v-if="trashContext === 'global'"
      @changed="onTrashChanged"
    />
    <TrashView
      v-else-if="trashContext === 'personal'"
      :personal-space-id="personalSpaceId"
      @changed="onTrashChanged"
    />

    <button v-if="!trashContext" class="fab" :aria-label="t('新建')" @click="onFabClick">
      <van-icon name="plus" />
    </button>
    <van-action-sheet
      v-model:show="showFabSheet"
      :actions="fabActions"
      @select="onFabSheetSelect"
    />

    <van-popup v-model:show="showCreateProjectDialog" position="bottom" round :style="{ height: '30%' }">
      <div class="create-project-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showCreateProjectDialog = false">{{ t('取消') }}</button>
          <span class="panel-title">{{ t('新建项目') }}</span>
          <button class="panel-confirm" :disabled="!projectNameInput.trim()" @click="onCreateProjectConfirm">
            {{ projectNameInput.trim() ? t('确定') : t('确认') }}
          </button>
        </div>
        <van-field
          v-model="projectNameInput"
          maxlength="50"
          :placeholder="t('请输入项目名称')"
          autofocus
          clearable
          @keyup.enter="onCreateProjectConfirm"
        />
      </div>
    </van-popup>

    <van-popup v-model:show="showCreateFolderDialog" position="bottom" round :style="{ height: '30%' }">
      <div class="create-project-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showCreateFolderDialog = false">{{ t('取消') }}</button>
          <span class="panel-title">{{ t('新建文件夹') }}</span>
          <button class="panel-confirm" :disabled="!folderNameInput.trim()" @click="onCreateFolderConfirm">
            {{ folderNameInput.trim() ? t('确定') : t('确认') }}
          </button>
        </div>
        <van-field
          v-model="folderNameInput"
          maxlength="50"
          :placeholder="t('请输入文件夹名称')"
          autofocus
          clearable
          @keyup.enter="onCreateFolderConfirm"
        />
      </div>
    </van-popup>

    <van-popup v-model:show="showCreateDrawingDialog" position="bottom" round :style="{ height: '30%' }">
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
      multiple
      accept=".mxweb,.dwg,.dxf,.xlsx,.pdf,.jpg,.png,.zip,.rar,.7z"
      style="display:none"
      @change="onFileInputChange"
    />

    <!-- 列表内分享（阶段 5）：文件项菜单「分享」打开 -->
    <ShareCurrentPopup
      v-model:show="showSharePopup"
      :file-id="shareTarget?.id ?? ''"
      :file-name="shareTarget?.name ?? ''"
    />

    <!-- 列表内版本历史（二期 h）：文件项菜单「版本历史」打开，选中版本走统一打开入口 -->
    <VersionHistoryPopup
      v-if="showVersionPopup"
      :target="versionTarget ?? undefined"
      @open-version="onOpenHistoricalVersion"
      @close="showVersionPopup = false"
    />

    <!-- 高级筛选（二期 d）：工具栏筛选按钮打开，确认后由 composable 统一织入请求 -->
    <FileFilterPopup
      v-model:show="showFilterPopup"
      :model-value="personalFileList.filters.value"
      @apply="onFilterApply"
    />

    <!-- 单条目操作菜单（A-03）+ 重命名（A-04）+ 移动/复制选文件夹（A-05） -->
    <van-action-sheet
      v-model:show="showMenuSheet"
      :actions="menuActions"
      @select="onMenuAction"
      @close="menuTarget = null"
    />
    <!-- 项目卡片管理菜单：编辑/成员/角色/转移/历史/删除（权限门控，对齐 PC）-->
    <van-action-sheet
      v-model:show="showProjectMenuSheet"
      :actions="projectMenuActions"
      @select="onProjectMenuAction"
      @close="projectMenuTarget = null"
    />
    <!-- A-29b 搜索结果行长按菜单：打开所在位置（定位父文件夹，对齐 PC open_file_location）-->
    <van-action-sheet
      v-model:show="showSearchRowMenu"
      :actions="[{ name: t('打开所在位置') }]"
      @select="onSearchRowMenuSelect"
      @close="searchRowMenuTarget = null"
    />
    <!-- 项目编辑弹窗（名称+描述，对齐 PC ProjectModal 编辑模式）-->
    <ProjectEditPopup
      v-model:show="showProjectEdit"
      :initial-name="projectMenuTarget?.name ?? ''"
      :initial-description="projectMenuTarget?.description ?? ''"
      @confirm="onProjectEditConfirm"
    />
    <RenameNodePopup
      v-model:show="showRename"
      :initial-name="renameTarget?.name ?? ''"
      :keep-extension="!renameTarget?.isFolder"
      @confirm="onRenameConfirm"
    />
    <NodeFolderPicker
      v-model:show="showFolderPicker"
      :root-id="personalSpaceId ?? ''"
      :root-name="t('个人空间')"
      :exclude-ids="folderPickerItems.map((i) => i.id)"
      :roots="transferTargets.roots.value"
      :disabled-reason="crossTransfer.disabledReason.value"
      @select="onFolderPickerSelect"
      @root-change="onPickerRootChange"
    />
    <DownloadFormatPopup
      v-model:show="showFormatPopup"
      :file-name="formatTarget?.name ?? ''"
      :batch-count="formatDownloadMode === 'batch' ? batchConvertCount : undefined"
      @confirm="onFormatDownloadConfirm"
    />
    <BatchDownloadPanel v-model:show="showBatchPanel" />
    <UndoSnackbar :visible="undo.visible.value" :message="undo.message.value" @undo="undo.onUndo()" />
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

/* 与 ShareManagePage .filter-btn 同口径：半透明 accent 底 + accent 字（暗色主题下比实心填充更克制） */
.filter-chip {
  flex: none;
  border: none;
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  border-radius: 12px;
  padding: 5px 12px;
  font-size: 12px;

  &.active {
    background: rgba(0, 169, 158, 0.14);
    color: var(--accent);
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

/* flex:1 + 居中：与 UnifiedFileList .empty-state 口径一致（.van-tab__panel 是 flex 列），
   否则空态贴顶 */
.state-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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

/* 卡片菜单角标（对齐 UnifiedFileList grid-more：28px 热区、半透明圆底） */
.card-more {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1;
}

.card-header {
  /* 右侧留出 40px，避免项目名探入「更多」角标热区 */
  padding: 10px 40px 0 12px;
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

// 全局搜索文件/文件夹命中行（跨两列，与项目卡片混排）
.search-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--divider);

  &:active {
    opacity: 0.85;
    transform: scale(0.99);
  }
}

.search-row-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--bg-tertiary);

  &--folder {
    color: var(--accent);
  }

  &--file {
    color: var(--text-secondary);
  }
}

.search-row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.search-row-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-row-sub {
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-row-source {
  font-size: 11px;
  color: var(--text-tertiary);
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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