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
import { showToast, showLoadingToast, closeToast, showDialog, showConfirmDialog, showSuccessToast, showFailToast } from 'vant'
import type { ActionSheetAction } from 'vant'
import {
  projectControllerGetProjects,
  projectControllerCreateProject,
  projectControllerGetPersonalSpace,
  nodeControllerCreateFolder,
  nodeControllerDeleteNode,
  nodeControllerBatchDeleteNodes,
  nodeControllerUpdateNode,
  nodeControllerMoveNode,
  nodeControllerCopyNode,
  nodeControllerBatchMoveNodes,
  nodeControllerBatchCopyNodes,
  memberControllerGetUserProjectPermissions,
  trashControllerRestoreTrashItems,
} from '@cloudcad/api-sdk/sdk.gen'
import { t } from '@/languages'
import { useCreateDrawing } from '@/composables/useCreateDrawing'
import type { ProjectListResponseDto, FileSystemNodeDto, ProjectFilterType, BatchOperationResponseDto } from '@cloudcad/api-sdk/types.gen'
import { useUnifiedFileList } from '@/composables/useUnifiedFileList'
import { useViewMode } from '@/composables/useViewMode'
import { useProjectActions } from '@/composables/useProjectActions'
import { useProjectSearch } from '@/composables/useProjectSearch'
import { formatNodeAsItems, formatTime } from '@/composables/useNodeFormatter'
import type { FileListItem } from '@/composables/useNodeFormatter'
import { useShellFileOpen } from '@/composables/useShellFileOpen'
import { useShellStack } from '@/stores/shellStack'
import { calculateFileHash } from '@/utils/hashUtils'
import { cachedApiUrl } from '@/utils/apiConfig'
import { uploadFile } from '@/services/mobileUploadService'
import { validateName } from '@/utils/validateName'
import { vibrate } from '@/utils/vibrate'
import { downloadControllerDownloadNodeWithFormat } from '@cloudcad/api-sdk/sdk.gen'
import { useBatchDownload } from '@/composables/useBatchDownload'
import UnifiedFileList from '../components/UnifiedFileList.vue'
import type { SelectionActionKey } from '../components/UnifiedFileList.vue'
import TrashView from '../components/TrashView.vue'
import NodeFolderPicker from '../components/NodeFolderPicker.vue'
import { useTransferTargets } from '@/composables/useTransferTargets'
import { useCrossProjectTransfer } from '@/composables/useCrossProjectTransfer'
import { useFileSystemClipboard } from '@/stores/fileSystemClipboard'
import { useClipboardWrite } from '@/composables/useClipboardWrite'
import { useClipboardPaste } from '@/composables/useClipboardPaste'
import { useUndoSnackbar } from '@/composables/useUndoSnackbar'
import { extractMoveCopyUndoIds } from '@/utils/moveCopyUndo'
import { filterPasteCycleItems } from '@/utils/pasteCycleGuard'
import { isCadFileName } from '@/utils/cadFile'
import { useNodeDownload } from '@/composables/useNodeDownload'
import { getNodeInfo } from '@/services/fileService'
import { warmupHistoricalVersion } from '@/services/versionWarmup'
import { showExternalReferenceManagePopup } from '@/plugins/vant/components/popup/showExternalReferenceManagePopup'
import UndoSnackbar from '@/components/UndoSnackbar.vue'
import RenameNodePopup from '../components/RenameNodePopup.vue'
import ProjectEditPopup from '../components/ProjectEditPopup.vue'
import DownloadFormatPopup from '../components/DownloadFormatPopup.vue'
import BatchDownloadPanel from '../components/BatchDownloadPanel.vue'
import type { DownloadFormatPayload } from '../components/DownloadFormatPopup.vue'
import { ProjectIcon, FolderIcon } from '../../../components/FileIcons'
import { useLoginPrompt } from '@/composables/useLoginPrompt'
import ShareCurrentPopup from '@/pages/home/components/ShareCurrentPopup.vue'
import VersionHistoryPopup from '@/pages/home/components/VersionHistoryPopup.vue'
import FileFilterPopup from '@/pages/shell/components/FileFilterPopup.vue'
import type { FileListFilters } from '@/composables/useUnifiedFileList'
import { runUploadPool } from '@/utils/uploadPool'

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
    if (res.error) throw new Error(String(res.error))
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
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) loadMoreProjects()
}

// ── 全局递归搜索（keyword 非空 → scope=global：项目命中 + 文件/文件夹命中混合结果）──
const projectSearch = useProjectSearch()
const searchItems = computed(() => formatNodeAsItems(projectSearch.results.value))

function onSearchResultScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) projectSearch.loadMore()
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
// 与项目卡片同套 500ms 手势；触发后抑制随后的 click。
const searchRowLongPressTriggered = ref(false)
let searchRowLongPressTimer: ReturnType<typeof setTimeout> | null = null
const showSearchRowMenu = ref(false)
const searchRowMenuTarget = ref<FileListItem | null>(null)

function onSearchRowTouchStart(item: FileListItem) {
  searchRowLongPressTriggered.value = false
  searchRowLongPressTimer = setTimeout(() => {
    searchRowLongPressTriggered.value = true
    searchRowMenuTarget.value = item
    showSearchRowMenu.value = true
    vibrate()
  }, 500)
}

function cancelSearchRowLongPress() {
  if (searchRowLongPressTimer) {
    clearTimeout(searchRowLongPressTimer)
    searchRowLongPressTimer = null
  }
}

// 长按守卫：只抑制长按后紧随的合成 click（消费后复位），否则菜单关闭后首次点行被吞
function onSearchRowTap(item: FileListItem) {
  if (searchRowLongPressTriggered.value) {
    searchRowLongPressTriggered.value = false
    return
  }
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
  if (res.error) throw new Error(String(res.error))
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

type ProjectMenuKey = 'edit' | 'members' | 'roles' | 'transfer' | 'history' | 'delete'
type ProjectMenuItem = { name: string; key: ProjectMenuKey; color?: string }

const projectMenuActions = computed<ProjectMenuItem[]>(() => {
  const perms = projectPermissions.value
  const actions: ProjectMenuItem[] = []
  if (perms.includes('PROJECT_UPDATE')) actions.push({ name: t('编辑项目'), key: 'edit' })
  actions.push({ name: t('成员'), key: 'members' })
  if (perms.includes('PROJECT_ROLE_MANAGE')) actions.push({ name: t('角色管理'), key: 'roles' })
  if (perms.includes('PROJECT_TRANSFER_MANAGE')) actions.push({ name: t('跨项目转移'), key: 'transfer' })
  actions.push({ name: t('操作历史'), key: 'history' })
  if (perms.includes('PROJECT_DELETE')) actions.push({ name: t('删除项目'), key: 'delete', color: '#ee0a24' })
  return actions
})

const showProjectEdit = ref(false)

// 长按检测（与 UnifiedFileList 文件项同套 500ms 手势）：触发后抑制随后的 click
const projectLongPressTriggered = ref(false)
let projectLongPressTimer: ReturnType<typeof setTimeout> | null = null

/** 打开项目操作菜单：先拉该项目的权限（门控菜单项），再弹菜单；拉取失败回退为仅基础项 */
async function openProjectMenu(project: ProjectCard) {
  projectMenuTarget.value = project
  try {
    const res = await memberControllerGetUserProjectPermissions({ path: { projectId: project.id } })
    projectPermissions.value = (res.data?.permissions as string[] | undefined) ?? []
  } catch {
    projectPermissions.value = []
  }
  showProjectMenuSheet.value = true
}

function onProjectTouchStart(project: ProjectCard) {
  projectLongPressTriggered.value = false
  projectLongPressTimer = setTimeout(() => {
    projectLongPressTriggered.value = true
    void openProjectMenu(project)
    vibrate()
  }, 500)
}

function cancelProjectLongPress() {
  if (projectLongPressTimer) {
    clearTimeout(projectLongPressTimer)
    projectLongPressTimer = null
  }
}

// 长按守卫：只抑制长按后紧随的合成 click（消费后复位），否则菜单关闭后首次点卡片被吞
function onProjectCardTap(project: ProjectCard) {
  if (projectLongPressTriggered.value) {
    projectLongPressTriggered.value = false
    return
  }
  onProjectClick(project)
}

function onProjectMenuAction(action: ProjectMenuItem) {
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

// ── 多选操作（B-03/B-17：move 接线；Bug6：复制/剪切写剪贴板）──
function onPersonalSelectionAction(action: SelectionActionKey, items: Array<{ id: string; name: string }>) {
  if (action === 'delete') {
    batchDelete(items)
  } else if (action === 'copy' || action === 'cut') {
    // 剪贴板（Bug6）：源根=个人空间；粘贴条由 UnifiedFileList 读取全局剪贴板展示
    // 个人空间无出向策略字段，write 内部跳过快照（恒允许跨出，由目标入向策略 + 归属权限兜底）
    clipboardWrite.write(items.map((i) => i.id), action, personalSpaceId.value ?? '', 'personalSpace', personalFileList.currentFolderId.value ?? '')
    showSuccessToast(
      action === 'cut'
        ? t('已剪切 {count} 项', { count: String(items.length) })
        : t('已复制 {count} 项', { count: String(items.length) })
    )
  } else if (action === 'move') {
    openFolderPicker('move', items)
  } else if (action === 'download') {
    void downloadSelection(items)
  }
}

async function batchDelete(items: Array<{ id: string; name: string }>) {
  try {
    await showDialog({
      title: t('确认删除'),
      message: t('确定删除 {count} 个文件/文件夹？', { count: String(items.length) }),
      showCancelButton: true,
      className: 'dialog-danger',
    })
  } catch { return }

  showLoadingToast({ message: t('删除中...'), forbidClick: true })
  try {
    const res = await nodeControllerBatchDeleteNodes({
      body: { nodeIds: items.map((i) => i.id), permanently: false },
    })
    closeToast()
    if (res.error) throw new Error(String(res.error))
    // 批量操作部分成功：透传成功/失败计数（对齐 PC「成功删除 N 项，M 项失败」）
    const data = res.data as BatchOperationResponseDto | undefined
    const failed = items.length > 1 ? (data?.failedCount ?? 0) : 0
    if (failed > 0) {
      showFailToast(t('成功删除 {n} 项，{m} 项失败', { n: String(data?.successCount ?? 0), m: String(failed) }))
    } else {
      showSuccessToast(t('删除成功'))
    }
    await personalFileList.loadNodes()
    // 撤销：trash 恢复这批节点 + 刷新文件列表（单步撤销，顶替既有 snackbar）
    undo.trackUndo(t('已删除 {count} 个文件', { count: String(items.length) }), async () => {
      const r = await trashControllerRestoreTrashItems({ body: { itemIds: items.map((i) => i.id) } })
      if (r.error) throw new Error(String(r.error))
      showSuccessToast(t('已恢复'))
      await personalFileList.loadNodes()
    })
  } catch (e) {
    closeToast()
    showFailToast(t('删除失败'))
  }
}

// ── 单条目操作菜单（A-03）+ 重命名（A-04）+ 移动/复制（A-05）+ 格式下载（A-06）+ 文件夹下载（A-08）──
const menuTarget = ref<{ id: string; name: string; isFolder?: boolean; path?: string; projectId?: string } | null>(null)
const showMenuSheet = ref(false)
const menuActions = computed(() => {
  const isFolder = !!menuTarget.value?.isFolder
  // CAD 图纸 → 外部参照管理（对齐 PC isCadFile visibilityCheck；个人空间=所有者恒可管理）
  const isCad = !isFolder && menuTarget.value ? isCadFileName(menuTarget.value.name) : false
  const actions: Array<{ name: string; color?: string }> = [
    { name: t('打开') },
    // 文件 → 下载（M9：CAD 弹格式选择、非 CAD 原格式直下，对齐 PC 单一「下载」项）；文件夹 → 打包下载（A-08）
    isFolder ? { name: t('打包下载') } : { name: t('下载') },
    // 文件 → 分享链接（阶段 5：ShareCurrentPopup 解耦入参 fileId+name）
    ...(isFolder ? [] : [{ name: t('分享') }]),
    ...(isCad ? [{ name: t('外部参照管理') }] : []),
    // 文件 → 版本历史（二期 h：VersionHistoryPopup 显式 target，无需先打开编辑器）
    ...(isFolder ? [] : [{ name: t('版本历史') }]),
    { name: t('重命名') },
    // A-29a：文件夹操作（移动到…/复制到…）与剪贴板操作（复制到剪贴板/剪切）对齐 PC 语义区分
    { name: t('移动到...') },
    { name: t('复制到...') },
    { name: t('复制到剪贴板') },
    { name: t('剪切') },
    { name: t('删除'), color: '#ee0a24' },
  ]
  return actions
})

function onItemMenu(item: { id: string; name: string; isFolder?: boolean; path?: string; projectId?: string }) {
  menuTarget.value = item
  showMenuSheet.value = true
}

function onMenuAction(action: { name: string }) {
  showMenuSheet.value = false
  const target = menuTarget.value
  if (!target) return
  if (action.name === t('打开')) {
    onPersonalItemClick(target)
  } else if (action.name === t('下载')) {
    // M9：CAD → 格式选择弹窗（转换下载）；非 CAD → 原格式直下（对齐 PC handleDownload 分流）
    if (isCadFileName(target.name)) openFormatDownload(target)
    else void downloadOriginal(target.id, target.name)
  } else if (action.name === t('打包下载')) {
    void downloadFolder(target)
  } else if (action.name === t('分享')) {
    openShare(target)
  } else if (action.name === t('外部参照管理')) {
    void openExternalRefManage(target)
  } else if (action.name === t('版本历史')) {
    openVersionHistory(target)
  } else if (action.name === t('重命名')) {
    renameTarget.value = target
    showRename.value = true
  } else if (action.name === t('移动到...') || action.name === t('复制到...')) {
    openFolderPicker(action.name === t('移动到...') ? 'move' : 'copy', [target])
  } else if (action.name === t('复制到剪贴板') || action.name === t('剪切')) {
    // A-29a：单条目剪贴板（对齐 PC copy_clipboard/cut；粘贴条由 UnifiedFileList 读取全局剪贴板展示）
    const mode = action.name === t('剪切') ? 'cut' : 'copy'
    clipboardWrite.write([target.id], mode, personalSpaceId.value ?? '', 'personalSpace', personalFileList.currentFolderId.value ?? '')
    showSuccessToast(mode === 'cut' ? t('已剪切') : t('已复制'))
  } else if (action.name === t('删除')) {
    batchDelete([target])
  }
}

/** 外部参照管理（列表直达，无需先打开编辑器）：按节点拉参照列表开管理面板（查看/下载/替换/上传+刷新）；
 *  比 PC 更正确——PC 列表菜单该项实际绑定当前编辑器上下文（checkMissingReferences(undefined)），移动端对点选文件生效 */
async function openExternalRefManage(target: { id: string }) {
  await showExternalReferenceManagePopup({
    ctx: { identifier: target.id, isPublic: false },
    canManage: true,
  })
}

// ── 列表内分享入口（阶段 5）：文件项菜单 → ShareCurrentPopup（有效期/二维码/已有分享/撤销）──
const showSharePopup = ref(false)
const shareTarget = ref<{ id: string; name: string } | null>(null)

function openShare(target: { id: string; name: string }) {
  shareTarget.value = target
  showSharePopup.value = true
}

// ── 列表内版本历史（二期 h）：VersionHistoryPopup 显式 target（projectId+path 取自节点）──
const showVersionPopup = ref(false)
const versionTarget = ref<{ projectId: string; filePath: string; fileId?: string } | null>(null)

function openVersionHistory(target: { id: string; path?: string; projectId?: string }) {
  if (!target.path) {
    showToast(t('该文件没有版本信息'))
    return
  }
  versionTarget.value = {
    projectId: target.projectId ?? personalFileList.rootId.value ?? '',
    filePath: target.path,
    fileId: target.id,
  }
  showVersionPopup.value = true
}

/** 选中历史版本：先预热（H3，对齐 PC）——冷路径「分片下载 + bin→mxweb 转换」可能耗时数十秒，
 *  直接打开会被编辑器 60s 打开超时拖爆；预热完成（202→204）后才走统一打开入口（URL 带 ?v=） */
async function onOpenHistoricalVersion(payload: { nodeId: string; revision: number }) {
  showLoadingToast({ message: t('正在准备历史版本文件，请稍候...'), forbidClick: false })
  try {
    const nodeInfo = await getNodeInfo(payload.nodeId)
    if (!nodeInfo.path) throw new Error(t('文件不存在或已被删除'))
    await warmupHistoricalVersion(nodeInfo.path, payload.revision)
  } catch (e) {
    showFailToast(e instanceof Error ? e.message : t('历史版本文件准备失败，请重试'))
    return
  }
  closeToast()
  const url = new URL(window.location.href)
  url.searchParams.set('v', String(payload.revision))
  history.replaceState(history.state, '', url.toString())
  void openFromList(payload.nodeId, {
    path: '/shell/file',
    tab: 1,
    folderId: personalFileList.currentFolderId.value,
    breadcrumbs: personalFileList.breadcrumbs.value,
  })
}

// ── 高级筛选（二期 d）：确认后交 composable 统一织入 getChildren/search 请求 ──
const showFilterPopup = ref(false)

function onFilterApply(filters: FileListFilters) {
  personalFileList.setFilters(filters)
}

// ── A-07 批量下载任务面板（zip 打包 + 单文件格式转换共用，3s 轮询）──
const { createZipTask, createFolderZipTask, createSingleFormatTask } = useBatchDownload()
const showBatchPanel = ref(false)

// ── 多选「下载」（对齐 PC 批量下载）：单文件直接下（可靠），多项/含文件夹走 zip 任务队列 ──
// 旧实现循环 <a> 点击触发多文件下载，浏览器会拦截后续下载（只下第一个），故收敛到任务队列
async function downloadSelection(items: Array<{ id: string; name: string; isFolder?: boolean }>) {
  // 多选含 CAD 图纸或文件夹 → 弹格式选择（对齐 PC 批量下载）：
  // - 顶层 CAD 文件：所选格式直接转换；
  // - 文件夹：格式由后端 expandFolderItems 递归传播到内部文件（对齐 PC 文件夹级格式）；
  // - 顶层非 CAD 文件：保持原格式。
  // 单条目菜单的 CAD 下载同样可转格式，故多选下载也须支持，避免「单选能转、多选不能转」的不一致。
  const cadFiles = items.filter((i) => !i.isFolder && isCadFileName(i.name))
  const hasFolders = items.some((i) => i.isFolder)
  if (cadFiles.length > 0 || hasFolders) {
    // 单个 CAD 文件（无文件夹）：复用单文件格式流程（mxweb 原格式直下 / 转格式走异步任务）
    if (items.length === 1 && !items[0].isFolder) openFormatDownload(items[0])
    else openBatchFormatDownload(items)
    return
  }
  if (items.length === 1 && !items[0].isFolder) {
    const a = document.createElement('a')
    a.href = cachedApiUrl(`/file-system/nodes/${items[0].id}/download`)
    a.download = items[0].name
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    showSuccessToast(t('开始下载 {count} 个文件', { count: '1' }))
    return
  }
  showLoadingToast({ message: t('正在创建打包任务...'), forbidClick: true })
  try {
    const fileList = items.map((i) => ({ nodeId: i.id, fileName: i.name, isFolder: i.isFolder }))
    await createZipTask(fileList, { name: t('下载') })
    closeToast()
    showSuccessToast(t('打包任务已创建'))
    showBatchPanel.value = true
  } catch (e) {
    closeToast()
    showFailToast(t('打包任务创建失败'))
  }
}

// ── A-06 格式转换下载（底部弹窗选格式）──
// 转换格式（dwg/dxf/pdf）走异步单文件任务队列（对齐 PC）：同步 download-with-format
// 对慢转换会挂起至超时；mxweb/original 无转换开销，保持同步直下
const showFormatPopup = ref(false)
const formatTarget = ref<{ id: string; name: string } | null>(null)
// 批量下载格式模式（多选含 CAD）：所选格式应用于全部选中图纸，zip 任务逐文件格式（对齐 PC 批量下载）
const formatDownloadMode = ref<'single' | 'batch'>('single')
const batchDownloadItems = ref<Array<{ id: string; name: string; isFolder?: boolean }>>([])
// 批量下载弹窗计数=选中项总数（含文件夹）；文件夹内图纸由后端递归转换
const batchConvertCount = ref(0)

function openFormatDownload(target: { id: string; name: string }) {
  formatDownloadMode.value = 'single'
  formatTarget.value = target
  showFormatPopup.value = true
}

function openBatchFormatDownload(items: Array<{ id: string; name: string; isFolder?: boolean }>) {
  batchDownloadItems.value = items
  batchConvertCount.value = items.length
  formatDownloadMode.value = 'batch'
  showFormatPopup.value = true
}

async function onFormatDownloadConfirm(payload: DownloadFormatPayload) {
  if (formatDownloadMode.value === 'batch') {
    await confirmBatchFormatDownload(payload)
    return
  }
  const target = formatTarget.value
  if (!target) return

  if (payload.format !== 'mxweb') {
    showLoadingToast({ message: t('创建下载任务...'), forbidClick: true })
    try {
      await createSingleFormatTask(target.id, target.name, payload.format, {
        dwgVersion: payload.dwgOptions?.dwgVersion,
        width: payload.pdfOptions?.width,
        height: payload.pdfOptions?.height,
        colorPolicy: payload.pdfOptions?.colorPolicy,
      })
      closeToast()
      showSuccessToast(t('已加入下载队列'))
      showBatchPanel.value = true
    } catch (e) {
      closeToast()
      showFailToast(t('创建下载任务失败'))
    }
    return
  }

  showLoadingToast({ message: t('下载中...'), forbidClick: true })
  try {
    const res = await downloadControllerDownloadNodeWithFormat({
      path: { nodeId: target.id },
      query: { format: payload.format },
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

// 批量下载格式确认：所选格式应用于全部选中 CAD 图纸（zip 任务逐文件格式）；
// 非 CAD 文件与文件夹保持原格式（文件夹按原样打包，移动端不做文件夹内逐文件转换）
async function confirmBatchFormatDownload(payload: DownloadFormatPayload) {
  const items = batchDownloadItems.value
  const format = payload.format
  showLoadingToast({ message: t('正在创建打包任务...'), forbidClick: true })
  try {
    const fileList = items.map((i) => {
      // CAD 文件或文件夹都套用所选格式：文件夹的格式由后端 expandFolderItems 递归传播到内部文件
      //（对齐 PC 文件夹级格式）；顶层非 CAD 文件保持原格式（单个非图纸文件无转换意义）
      const apply = format !== 'mxweb' && (i.isFolder || isCadFileName(i.name))
      return {
        nodeId: i.id,
        fileName: i.name,
        isFolder: i.isFolder,
        formats: apply ? [format] : [],
        ...(apply && (format === 'dwg' || format === 'dxf') ? { dwgVersion: payload.dwgOptions?.dwgVersion } : {}),
        ...(apply && format === 'pdf'
          ? { width: payload.pdfOptions?.width, height: payload.pdfOptions?.height, colorPolicy: payload.pdfOptions?.colorPolicy }
          : {}),
      }
    })
    await createZipTask(fileList, { name: t('下载') })
    closeToast()
    showSuccessToast(t('打包任务已创建'))
    showBatchPanel.value = true
  } catch (e) {
    closeToast()
    showFailToast(t('打包任务创建失败'))
  }
}

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
    })
    closeToast()
    if (res.error) throw new Error(String(res.error))
    showSuccessToast(t('重命名成功'))
    await personalFileList.loadNodes()
    // 撤销：回写原名（对齐 PC rename undo rollback）
    undo.trackUndo(t('已重命名'), async () => {
      const r = await nodeControllerUpdateNode({ path: { nodeId: target.id }, body: { name: target.name } })
      if (r.error) throw new Error(String(r.error))
      showSuccessToast(t('已撤销'))
      await personalFileList.loadNodes()
    })
  } catch (e) {
    closeToast()
    showFailToast(t('重命名失败'))
  }
}

const showFolderPicker = ref(false)
const folderPickerOp = ref<'move' | 'copy' | null>(null)
const folderPickerItems = ref<Array<{ id: string; name: string }>>([])

// ── 二期 g 跨项目移动/复制：目标根=个人空间+我的项目，切根实时预判六域矩阵 ──
const transferTargets = useTransferTargets()
const crossTransfer = useCrossProjectTransfer()

// ── Bug6 剪贴板粘贴：把剪贴板内容粘贴到当前文件夹（cut→move 成功后清空）──
const clipboard = useFileSystemClipboard()
// 复制/剪切写入 + 源项目 6 域出向策略快照（跨项目粘贴预判前置数据）
const clipboardWrite = useClipboardWrite()
// 粘贴预判：目标=当前个人空间；策略禁止跨项目转移 → 禁用粘贴 + 原因（对齐 PC）
const pastePolicy = useClipboardPaste(() => ({
  id: personalSpaceId.value ?? '',
  domain: 'personalSpace',
}))

// 删除/复制/移动撤销：操作成功后浮出撤销条，限时内点「撤销」回滚；回滚失败经 onError 弹「撤销失败」
const undo = useUndoSnackbar(5000, () => showFailToast(t('撤销失败')))

function onClearPaste() {
  clipboard.clearClipboard()
}

async function onPaste() {
  if (!clipboard.hasItems || !clipboard.mode) return
  // 跨项目粘贴被源/目标策略禁止：粘贴条已禁用，这里兜底拦截（对齐 PC canPaste 门控）
  if (!pastePolicy.canPaste.value) {
    showFailToast(pastePolicy.pasteDisabledReason.value || t('当前策略不允许粘贴'))
    return
  }
  const mode = clipboard.mode
  const targetId = personalFileList.currentFolderId.value ?? personalSpaceId.value
  if (!targetId) {
    showFailToast(t('无法确定粘贴位置'))
    return
  }
  const op = mode === 'cut' ? 'move' : 'copy'
  // 跨根剪切（源项目→个人空间等）：文件将从源移走，二次确认（对齐 PC）
  if (mode === 'cut' && clipboard.sourceRootId && clipboard.sourceRootId !== (personalSpaceId.value ?? '')) {
    try {
      await showConfirmDialog({
        title: t('跨项目移动'),
        message: t('将把 {count} 个项目移动到当前文件夹，源项目的文件将被移走，确定？', { count: String(clipboard.itemIds.length) }),
        confirmButtonText: t('确定'),
        cancelButtonText: t('取消'),
      })
    } catch {
      return
    }
  }
  // 环防护（对齐 PC D2）：剔除子树包含粘贴目标的剪贴板项（移入/复制到自身后代后端恒拒，先剔除避免批量部分失败）
  const pasteIds = filterPasteCycleItems(clipboard.itemIds, [
    ...personalFileList.breadcrumbs.value.map((b) => b.id),
    targetId,
  ])
  if (pasteIds.length === 0) {
    showFailToast(t('没有可粘贴的项目'))
    return
  }
  const items = pasteIds.map((id) => ({ id, name: '' }))
  void doMoveOrCopy({ id: targetId, name: '' }, op, items, true)
}

async function openFolderPicker(op: 'move' | 'copy', items: Array<{ id: string; name: string }>) {
  if (!personalSpaceId.value) {
    showFailToast(t('文件夹未就绪，请稍后再试'))
    return
  }
  folderPickerOp.value = op
  folderPickerItems.value = items
  // 拉目标根（含个人空间）+ 源设置（源=个人空间，无项目转移设置）；初始根=个人空间根（对齐 PC 从根下钻）
  await transferTargets.load(personalSpaceId.value)
  await crossTransfer.init({ id: personalSpaceId.value, name: t('个人空间'), domain: 'personalSpace' }, op)
  showFolderPicker.value = true
}

async function onPickerRootChange(rootId: string) {
  await crossTransfer.onRootChange(rootId, transferTargets.roots.value)
}

/** 后端错误透传：403 策略被拒/权限/配额 等文案直接展示，不吞成通用「移动失败」 */
function transferErrorMessage(e: unknown, op: 'move' | 'copy'): string {
  const msg = e instanceof Error ? e.message : ''
  if (msg) return msg
  return op === 'move' ? t('移动失败') : t('复制失败')
}

async function doMoveOrCopy(folder: { id: string; name: string }, op: 'move' | 'copy', items: Array<{ id: string; name: string }>, isClipboardPaste = false) {
  showLoadingToast({ message: isClipboardPaste ? t('粘贴中...') : op === 'move' ? t('移动中...') : t('复制中...'), forbidClick: true })
  try {
    const res = items.length === 1
      ? op === 'move'
        ? await nodeControllerMoveNode({ path: { nodeId: items[0].id }, body: { targetParentId: folder.id } })
        : await nodeControllerCopyNode({ path: { nodeId: items[0].id }, body: { targetParentId: folder.id } })
      : op === 'move'
        ? await nodeControllerBatchMoveNodes({ body: { nodeIds: items.map((i) => i.id), targetParentId: folder.id } })
        : await nodeControllerBatchCopyNodes({ body: { nodeIds: items.map((i) => i.id), targetParentId: folder.id } })
    closeToast()
    if (res.error) throw new Error(String(res.error))
    // 批量操作部分成功：透传成功/失败计数（对齐 PC「成功移动 N 项，M 项失败」）
    const data = res.data as BatchOperationResponseDto | undefined
    const failed = items.length > 1 ? (data?.failedCount ?? 0) : 0
    if (failed > 0) {
      const n = String(data?.successCount ?? 0)
      const m = String(failed)
      showFailToast(op === 'move' ? t('成功移动 {n} 项，{m} 项失败', { n, m }) : t('成功复制 {n} 项，{m} 项失败', { n, m }))
    } else {
      showSuccessToast(isClipboardPaste ? t('粘贴成功') : op === 'move' ? t('移动成功') : t('复制成功'))
    }
    // ── 撤销（须在剪切+粘贴清空剪贴板前捕获源文件夹）──
    // 回滚目标=仅实际变化的项（move=successIds、copy=createdIds）；部分成功只回滚成功项（对齐 PC）
    const undoIds = extractMoveCopyUndoIds({
      op,
      isSingle: items.length === 1,
      singleResultId: (res.data as { id?: string } | undefined)?.id,
      batchData: data,
      originalIds: items.map((i) => i.id),
    })
    if (op === 'copy') {
      // 复制撤销：删除新建副本
      if (undoIds.length > 0) {
        undo.trackUndo(t('已复制 {count} 个文件', { count: String(undoIds.length) }), async () => {
          const r = await nodeControllerBatchDeleteNodes({ body: { nodeIds: undoIds, permanently: true } })
          if (r.error) throw new Error(String(r.error))
          showSuccessToast(t('已撤销'))
          await personalFileList.loadNodes()
        })
      }
    } else {
      // 移动撤销：把成功移动的节点移回源文件夹（剪切+粘贴=剪贴板源文件夹；直接移动=当前浏览文件夹）
      const sourceFolder = isClipboardPaste
        ? clipboard.sourceFolderId
        : (personalFileList.currentFolderId.value ?? '')
      if (undoIds.length > 0 && sourceFolder) {
        undo.trackUndo(t('已移动 {count} 个文件', { count: String(undoIds.length) }), async () => {
          const r = await nodeControllerBatchMoveNodes({ body: { nodeIds: undoIds, targetParentId: sourceFolder } })
          if (r.error) throw new Error(String(r.error))
          showSuccessToast(t('已撤销'))
          await personalFileList.loadNodes()
        })
      }
    }
    // 剪切粘贴：只要有项成功就清空剪贴板（对齐 PC movedIds.length>0；全失败保留可重试；复制粘贴保留）
    if (isClipboardPaste && op === 'move') {
      const moved = items.length === 1 ? 1 : (data?.successCount ?? 0)
      if (moved > 0) clipboard.clearClipboard()
    }
    await personalFileList.loadNodes()
  } catch (e) {
    closeToast()
    showFailToast(transferErrorMessage(e, op))
  }
}

async function onFolderPickerSelect(folder: { id: string; name: string; rootId: string }) {
  const op = folderPickerOp.value
  const items = folderPickerItems.value
  if (!op) return
  showFolderPicker.value = false
  // 跨项目 move：个人空间文件将被移走，二次确认（对齐 PC）
  if (op === 'move' && crossTransfer.isCrossProject.value) {
    try {
      await showConfirmDialog({
        title: t('跨项目移动'),
        message: t('将把 {count} 个项目移动到目标项目，源项目的文件将被移走，确定？', { count: String(items.length) }),
        confirmButtonText: t('确定'),
        cancelButtonText: t('取消'),
      })
    } catch {
      return // 取消
    }
  }
  void doMoveOrCopy(folder, op, items)
}

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
    if (res.error) throw new Error(String(res.error))
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

// ── 新建文件夹弹窗 ──
const showCreateFolderDialog = ref(false)
const folderNameInput = ref('')
const showFabSheet = ref(false)

// van-action-sheet 用 name 字段（van-popover 用 text）；key 作跨语言稳定判别符
type FabActionKey = 'createFolder' | 'createDrawing' | 'uploadFile' | 'downloadTasks'
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

function openCreateFolderDialog() {
  showCreateFolderDialog.value = true
  folderNameInput.value = ''
}

function onFabSheetSelect(action: FabAction) {
  showFabSheet.value = false
  switch (action.key) {
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
  showLoadingToast({ message: t('创建中...'), forbidClick: true })
  try {
    const res = await nodeControllerCreateFolder({
      path: { parentId },
      body: { name },
    })
    closeToast()
    if (res.error) throw new Error(String(res.error))
    showToast(t('文件夹创建成功'))
    await personalFileList.loadNodes()
    // 撤销：彻底删除新建文件夹（对齐 PC createFolder undo rollback）
    const createdId = (res.data as { id?: string } | undefined)?.id
    if (createdId) {
      undo.trackUndo(t('已创建文件夹'), async () => {
        const r = await nodeControllerDeleteNode({ path: { nodeId: createdId }, query: { permanently: true } })
        if (r.error) throw new Error(String(r.error))
        showSuccessToast(t('已撤销'))
        await personalFileList.loadNodes()
      })
    }
  } catch (e) {
    closeToast()
    showToast(t('创建失败，请重试'))
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
  // 撤销：彻底删除新建图纸（对齐 PC createDrawing undo rollback）
  (createdId) => {
    undo.trackUndo(t('已创建图纸'), async () => {
      const r = await nodeControllerDeleteNode({ path: { nodeId: createdId }, query: { permanently: true } })
      if (r.error) throw new Error(String(r.error))
      showSuccessToast(t('已撤销'))
      await personalFileList.loadNodes()
    })
  },
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
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return

  const parentId = personalFileList.currentFolderId.value
  if (!parentId) return

  // 多文件上传（阶段 5）：并发 2，逐文件独立成功/失败 toast，全部结束后统一重载一次
  showLoadingToast({ message: t('上传中...'), forbidClick: true, duration: 0 })
  try {
    await runUploadPool(
      files,
      async (file) => {
        const hash = await calculateFileHash(file)
        await uploadFile({ file, hash, nodeId: parentId })
      },
      (_file, ok) => {
        showToast(ok ? t('上传成功') : t('上传失败，请重试'))
      },
    )
  } finally {
    closeToast()
    await personalFileList.loadNodes()
  }
}
</script>

<template>
  <div class="subpage">
    <!-- 回收站打开时：标题变「回收站」，左箭头返回文件列表（对齐 PC 回收站 toggle）；
         未打开时右侧「回收站」入口按当前 tab 定 scope（项目列表 tab→全局，个人空间 tab→个人） -->
    <van-nav-bar
      :title="trashContext ? t('回收站') : t('文件')"
      left-arrow
      @click-left="trashContext ? closeTrash() : router.back()"
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
                @touchstart.passive="onSearchRowTouchStart(item)"
                @touchend="cancelSearchRowLongPress"
                @touchmove="cancelSearchRowLongPress"
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
            @touchstart.passive="onProjectTouchStart(p)"
            @touchend="cancelProjectLongPress"
            @touchmove="cancelProjectLongPress"
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
          @selection-action="onPersonalSelectionAction"
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

    <van-popup v-model:show="showCreateProjectDialog" position="bottom" round :style="{ height: '48%' }">
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

    <van-popup v-model:show="showCreateFolderDialog" position="bottom" round :style="{ height: '40%' }">
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