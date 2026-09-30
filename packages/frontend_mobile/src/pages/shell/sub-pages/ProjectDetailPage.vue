<script setup lang="ts">
/**
 * 子页：项目详情 —— Tab：文件 / 成员。
 *
 *   文件 Tab：useUnifiedFileList('project') 数据层 + UnifiedFileList 展示（与个人空间同一套）
 *   成员 Tab：memberControllerGetProjectMembers
 *
 * projectId 从路由参数获取。
 */
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showDialog, showConfirmDialog, showToast, showLoadingToast, closeToast, showSuccessToast, showFailToast } from 'vant'
import { t } from '@/languages'
import { nodeControllerCreateFolder } from '@cloudcad/api-sdk/sdk.gen'
import { nodeControllerBatchDeleteNodes } from '@cloudcad/api-sdk/sdk.gen'
import { nodeControllerGetParentContext } from '@cloudcad/api-sdk/sdk.gen'
import ProjectAuditLogPopup from '@/pages/shell/components/ProjectAuditLogPopup.vue'
import type { AuditLogItem } from '@/composables/useProjectAuditLog'
import type { ActionSheetAction } from 'vant'
import { useCreateDrawing } from '@/composables/useCreateDrawing'
import { useViewMode } from '@/composables/useViewMode'
import { useUnifiedFileList } from '@/composables/useUnifiedFileList'
import { projectControllerGetProject, projectControllerGetProjectQuota, projectControllerGetPersonalSpace } from '@cloudcad/api-sdk/sdk.gen'
import {
  memberControllerGetProjectMembers,
  memberControllerAddProjectMember,
  memberControllerRemoveProjectMember,
  memberControllerUpdateProjectMember,
  memberControllerGetUserProjectPermissions,
  nodeControllerUpdateNode,
  nodeControllerMoveNode,
  nodeControllerCopyNode,
  nodeControllerBatchMoveNodes,
  nodeControllerBatchCopyNodes,
} from '@cloudcad/api-sdk/sdk.gen'
import { useUser } from '@/composables/useUser'
import { rolesControllerGetProjectRolesByProject } from '@cloudcad/api-sdk/sdk.gen'
import { usersControllerSearchUsers } from '@cloudcad/api-sdk/sdk.gen'
import { formatNodeAsItems, formatSize } from '@/composables/useNodeFormatter'
import { useShellFileOpen } from '@/composables/useShellFileOpen'
import { useShellStack } from '@/stores/shellStack'
import ShareCurrentPopup from '@/pages/home/components/ShareCurrentPopup.vue'
import VersionHistoryPopup from '@/pages/home/components/VersionHistoryPopup.vue'
import FileFilterPopup from '@/pages/shell/components/FileFilterPopup.vue'
import type { FileListFilters } from '@/composables/useUnifiedFileList'
import { runUploadPool } from '@/utils/uploadPool'
import { calculateFileHash } from '@/utils/hashUtils'
import { cachedApiUrl } from '@/utils/apiConfig'
import { uploadFile } from '@/services/mobileUploadService'
import { validateName } from '@/utils/validateName'
import { ProjectPermission, getProjectRoleDisplayName } from '@/utils/projectPermissions'
import { downloadControllerDownloadNodeWithFormat } from '@cloudcad/api-sdk/sdk.gen'
import { useBatchDownload } from '@/composables/useBatchDownload'
import UnifiedFileList from '../components/UnifiedFileList.vue'
import type { SelectionActionKey } from '../components/UnifiedFileList.vue'
import NodeFolderPicker from '../components/NodeFolderPicker.vue'
import { useTransferTargets } from '@/composables/useTransferTargets'
import { useCrossProjectTransfer } from '@/composables/useCrossProjectTransfer'
import { useFileSystemClipboard } from '@/stores/fileSystemClipboard'
import RenameNodePopup from '../components/RenameNodePopup.vue'
import DownloadFormatPopup from '../components/DownloadFormatPopup.vue'
import BatchDownloadPanel from '../components/BatchDownloadPanel.vue'
import type { DownloadFormatPayload } from '../components/DownloadFormatPopup.vue'
import ProjectEditPopup from '../components/ProjectEditPopup.vue'
import ProjectTransferSettingsPopup from '../components/ProjectTransferSettingsPopup.vue'
import { useProjectActions } from '@/composables/useProjectActions'
import type { ProjectDto, BatchOperationResponseDto } from '@cloudcad/api-sdk/types.gen'

const route = useRoute()
const router = useRouter()
// 路由参数名与 @cloudcad/platform 映射表共用（router/index.ts）
const projectId = computed(() => (route.params.projectId as string) ?? '')

const activeTab = ref(0)
const projectName = ref('项目')

// 文件列表数据层统一走 useUnifiedFileList（与个人空间同一套加载/分页/排序/搜索/面包屑逻辑），
// 项目页只保留本页特有的编排：项目根初始化、返回还原、配额条、权限门控
const fileList = useUnifiedFileList('project')
// A-16 视图模式（网格/清单）持久化，与个人空间各自记住
const fileMode = useViewMode('project')

const members = ref<any[]>([])
const memberLoading = ref(false)
const memberError = ref('')

const shellStack = useShellStack()
const { openFromList } = useShellFileOpen()

// 缩略图地址按节点 id 派生（网格模式占位）
const projectFiles = computed(() =>
  formatNodeAsItems(fileList.nodes.value).map((item) => ({
    ...item,
    thumb: fileList.getThumbnailUrl(item.id),
  }))
)

// 模板读取包装（fileList 是普通对象，非 ref，模板不会自动解包）
const fileLoading = computed(() => fileList.loading.value)
const fileError = computed(() => fileList.error.value)
const fileBreadcrumbs = computed(() => fileList.breadcrumbs.value)
const fileSearch = computed(() => fileList.searchText.value)
const fileHasMore = computed(() => fileList.hasMore.value)
const fileLoadMoreFailed = computed(() => fileList.loadMoreFailed.value)
const fileSortBy = computed(() => fileList.sortBy.value)
const fileSortOrder = computed(() => fileList.sortOrder.value)

/**
 * 初始化文件列表：以项目 id 为根加载第一层（loadRootNode 记录 rootId，
 * 供 project_files 搜索 scope 与位置持久化 key 使用）。
 * 打开图纸返回 → 用返回前的 folderId/面包屑覆盖根态（仍只发一次请求）。
 */
function initFileList() {
  if (!projectId.value) return
  const target = shellStack.returnTarget
  shellStack.clearReturnTarget()
  const override =
    target?.folderId && target.breadcrumbs?.length
      ? { folderId: target.folderId, breadcrumbs: target.breadcrumbs }
      : undefined
  void fileList.loadRootNode(projectId.value, override)
}

/** A-15 下拉刷新 → 回到第一页整页重查（顺带刷新配额用量） */
function refreshFiles() {
  fileList.refresh()
  loadProjectQuota()
}

// 完整 ProjectDto（name/description + 6 个转移设置字段）：编辑弹窗与转移设置弹窗的数据源
const projectInfo = ref<ProjectDto | null>(null)

async function loadProjectInfo() {
  if (!projectId.value) return
  try {
    const res = await projectControllerGetProject({
      path: { projectId: projectId.value },
    } as any)
    if (!res.error) {
      const data = res.data as ProjectDto | undefined
      if (data) {
        projectInfo.value = data
        projectName.value = data.name ?? '项目'
      }
    }
  } catch (e) {
    projectName.value = `项目 ${projectId.value.slice(0, 6)}`
  }
}

// B-15 项目上传配额（对齐 PC FileSystemHeader：used/limit 进度条 + 90%/超限阈值配色）
const projectQuota = ref<{ used: number; limit: number } | null>(null)

const quotaPercent = computed(() => {
  const q = projectQuota.value
  if (!q || q.limit <= 0) return 0
  return Math.min((q.used / q.limit) * 100, 100)
})

const quotaColor = computed(() => {
  const q = projectQuota.value
  if (!q) return 'var(--accent)'
  if (q.used > q.limit) return 'var(--error)'
  if (q.used > q.limit * 0.9) return 'var(--warning)'
  return 'var(--accent)'
})

const quotaText = computed(() => {
  const q = projectQuota.value
  if (!q || q.limit <= 0) return ''
  return `${formatSize(q.used)} / ${formatSize(q.limit)}`
})

async function loadProjectQuota() {
  if (!projectId.value) return
  try {
    const res = await projectControllerGetProjectQuota({
      path: { projectId: projectId.value },
    } as any)
    if (res.error) return
    const data = res.data as { used?: number; limit?: number } | undefined
    if (data && typeof data.limit === 'number') {
      projectQuota.value = { used: data.used ?? 0, limit: data.limit }
    }
  } catch (e) {
    // 配额是展示性信息，加载失败不阻断文件列表
  }
}

async function loadMembers() {
  memberLoading.value = true
  memberError.value = ''
  try {
    const res = await memberControllerGetProjectMembers({
      path: { projectId: projectId.value },
    } as any)
    if (res.error) throw new Error(String(res.error))
    members.value = (res.data as any[]) ?? []
  } catch (e) {
    memberError.value = '加载成员失败'
  } finally {
    memberLoading.value = false
  }
}

// ── 成员管理 ──
const roles = ref<any[]>([])
const showAddMember = ref(false)
const searchKeyword = ref('')
const searchResults = ref<any[]>([])
const selectedUser = ref<any>(null)
const selectedRoleId = ref<string>('')
const memberSearchTimer = ref<ReturnType<typeof setTimeout> | null>(null)

async function loadRoles() {
  try {
    const res = await rolesControllerGetProjectRolesByProject({
      path: { projectId: projectId.value },
    } as any)
    if (!res.error) {
      roles.value = (res.data as any[]) ?? []
    }
  } catch (e) {
    console.error('loadRoles error:', e)
  }
}

function onMemberSearchInput(val: string) {
  searchKeyword.value = val
  if (memberSearchTimer.value) clearTimeout(memberSearchTimer.value)
  memberSearchTimer.value = setTimeout(async () => {
    if (!val.trim()) {
      searchResults.value = []
      return
    }
    try {
      const res = await usersControllerSearchUsers({
        query: { search: val, limit: 10 } as any,
      } as any)
      if (!res.error) {
        // Filter out existing members
        const existingIds = new Set(members.value.map((m: any) => m.id))
        searchResults.value = ((res.data as any)?.users ?? []).filter((u: any) => !existingIds.has(u.id))
      }
    } catch (e) {
      console.error('searchUsers error:', e)
    }
  }, 300)
}

function selectUser(user: any) {
  selectedUser.value = user
  // Auto-select first non-owner role
  if (roles.value.length > 0) {
    const firstRole = roles.value.find((r: any) => !r.isOwnerRole)
    selectedRoleId.value = firstRole?.id ?? roles.value[0]?.id ?? ''
  }
}

// 每次打开都从「选用户」第一步重来：清掉上次的搜索词/结果/已选用户/角色，
// 同时重拉角色（首次拉取失败时角色列表为空，确认按钮会永久禁用）
function openAddMemberDialog() {
  if (memberSearchTimer.value) {
    clearTimeout(memberSearchTimer.value)
    memberSearchTimer.value = null
  }
  searchKeyword.value = ''
  searchResults.value = []
  selectedUser.value = null
  selectedRoleId.value = ''
  showAddMember.value = true
  loadRoles()
}

async function onAddMemberConfirm() {
  if (!selectedUser.value || !selectedRoleId.value) {
    showFailToast(t('请选择用户和角色'))
    return
  }
  showLoadingToast({ message: '添加中...', forbidClick: true })
  try {
    const res = await memberControllerAddProjectMember({
      path: { projectId: projectId.value } as any,
      body: {
        userId: selectedUser.value.id,
        projectRoleId: selectedRoleId.value,
      } as any,
    } as any)
    if (res.error) throw new Error(String(res.error))
    closeToast()
    showSuccessToast(t('成员添加成功'))
    showAddMember.value = false
    selectedUser.value = null
    await loadMembers()
  } catch (e: any) {
    closeToast()
    showFailToast(e?.message || '添加失败')
  }
}

async function onRemoveMember(member: any) {
  try {
    await showDialog({
      title: '移除成员',
      message: `确定移除成员 ${member.nickname ?? member.username ?? member.email ?? '未知'} 吗？`,
      showCancelButton: true,
    })
    showLoadingToast({ message: '移除中...', forbidClick: true })
    const res = await memberControllerRemoveProjectMember({
      path: { projectId: projectId.value, userId: member.id } as any,
    } as any)
    if (res.error) throw new Error(String(res.error))
    closeToast()
    showSuccessToast(t('成员已移除'))
    await loadMembers()
  } catch (e: any) {
    if (e !== 'cancel') {
      closeToast()
      showFailToast(e?.message || '移除失败')
    }
  }
}

async function onUpdateMemberRole(member: any, roleId: string) {
  if (roleId === member.projectRoleId) return
  try {
    const res = await memberControllerUpdateProjectMember({
      path: { projectId: projectId.value, userId: member.id } as any,
      body: { projectRoleId: roleId } as any,
    } as any)
    if (res.error) throw new Error(String(res.error))
    showSuccessToast('角色已更新')
    await loadMembers()
  } catch (e: any) {
    showFailToast(e?.message || '更新失败')
  }
}

const ownerRoleId = computed(() => roles.value.find((r: any) => r.isOwnerRole)?.id)

// 角色下拉选项必须是稳定引用：DropdownMenu 的渲染 effect 会在 item.renderTitle()
// 里读到该 prop，模板内联 filter/map 每次渲染都是新数组 → 触发自身重渲染死循环
// （Maximum recursive updates exceeded in component <van-dropdown-menu>）
const memberRoleOptions = computed(() =>
  roles.value
    .filter((r: any) => !r.isOwnerRole)
    .map((r: any) => ({ text: getProjectRoleDisplayName(r.name), value: r.id }))
)

function isOwner(member: any): boolean {
  return member.projectRoleId === ownerRoleId.value
}

// 成员自我保护（B-04）+ 权限门控（B-05）：对齐 PC MembersModal，
// 管理入口可见性由后端返回的 PROJECT_MEMBER_MANAGE 权限决定，操作对象排除自己
const { user: currentUser } = useUser()
const currentUserId = computed(() => currentUser.value?.id ?? '')

function isSelf(member: any): boolean {
  return !!member.id && member.id === currentUserId.value
}

const projectPermissions = ref<string[]>([])

async function loadProjectPermissions() {
  try {
    const res = await memberControllerGetUserProjectPermissions({
      path: { projectId: projectId.value },
    } as any)
    if (res.error) return
    projectPermissions.value = res.data?.permissions ?? []
  } catch {
    projectPermissions.value = []
  }
}

const canManageMembers = computed(() =>
  projectPermissions.value.includes('PROJECT_MEMBER_MANAGE')
)

// 角色管理入口（对齐 PC ProjectListView 的 canManageRoles 门控：PROJECT_ROLE_MANAGE）
const canManageRoles = computed(() =>
  projectPermissions.value.includes(ProjectPermission.PROJECT_ROLE_MANAGE)
)

// 项目管理菜单权限门控（对齐 PC 逐项目权限拉取；加载期悲观隐藏）
const canUpdateProject = computed(() =>
  projectPermissions.value.includes(ProjectPermission.PROJECT_UPDATE)
)
const canDeleteProject = computed(() =>
  projectPermissions.value.includes(ProjectPermission.PROJECT_DELETE)
)
const canManageTransfer = computed(() =>
  projectPermissions.value.includes(ProjectPermission.PROJECT_TRANSFER_MANAGE)
)

function goRoleManagement() {
  router.push(`/shell/file/project/${projectId.value}/roles`)
}

function getRoleName(id: string): string {
  const role = roles.value.find((r: any) => r.id === id)
  if (!role) return t('未知角色')
  return getProjectRoleDisplayName(role.name)
}

/** 文件夹下钻 + 图纸打开（打开走 useShellFileOpen，补齐文件上下文与缓存） */
function enterFolder(item: any) {
  if (item.isFolder) {
    const raw = fileList.nodes.value.find((n) => n.id === item.id)
    if (raw) fileList.enterFolder(raw)
    return
  }

  void openFromList(item.id, {
    path: `/shell/file/project/${projectId.value}`,
    folderId: fileList.currentFolderId.value,
    breadcrumbs: fileList.breadcrumbs.value,
  })
}

function onModeChange(m: 'grid' | 'list') {
  fileMode.value = m
}

// van-action-sheet 用 name 字段（van-popover 用 text）；key 作跨语言稳定判别符
type FabActionKey = 'createFolder' | 'createDrawing' | 'uploadFile' | 'downloadTasks'
type FabAction = ActionSheetAction & { key: FabActionKey }

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

// ── 多选操作（B-03/B-17：move/copy 接线）──
function onSelectionAction(action: SelectionActionKey, items: Array<{ id: string; name: string }>) {
  if (action === 'delete') {
    batchDelete(items)
  } else if (action === 'copy' || action === 'cut') {
    // 剪贴板（Bug6）：源根=当前项目
    clipboard.setClipboard(items.map((i) => i.id), action, projectId.value, 'project')
    showSuccessToast(
      action === 'cut'
        ? t('已剪切 {count} 项', { count: String(items.length) })
        : t('已复制 {count} 项', { count: String(items.length) })
    )
  } else if (action === 'move') {
    openFolderPicker('move', items)
  } else if (action === 'download') {
    for (const item of items) {
      const a = document.createElement('a')
      a.href = cachedApiUrl(`/file-system/nodes/${item.id}/download`)
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
    fileList.refresh()
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
  const actions: Array<{ name: string; color?: string }> = [
    { name: t('打开') },
    // 文件 → 格式转换下载（A-06）；文件夹 → 打包下载（A-08）
    isFolder ? { name: t('打包下载') } : { name: t('格式转换下载') },
    // 文件 → 分享链接（阶段 5：ShareCurrentPopup 解耦入参 fileId+name）
    ...(isFolder ? [] : [{ name: t('分享') }]),
    // 文件 → 版本历史（二期 h：VersionHistoryPopup 显式 target，无需先打开编辑器）
    ...(isFolder ? [] : [{ name: t('版本历史') }]),
    { name: t('重命名') },
    { name: t('移动') },
    { name: t('复制') },
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
    enterFolder(target)
  } else if (action.name === t('格式转换下载')) {
    openFormatDownload(target)
  } else if (action.name === t('打包下载')) {
    void downloadFolder(target)
  } else if (action.name === t('分享')) {
    openShare(target)
  } else if (action.name === t('版本历史')) {
    openVersionHistory(target)
  } else if (action.name === t('重命名')) {
    renameTarget.value = target
    showRename.value = true
  } else if (action.name === t('移动') || action.name === t('复制')) {
    openFolderPicker(action.name === t('移动') ? 'move' : 'copy', [target])
  } else if (action.name === t('删除')) {
    batchDelete([target])
  }
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
    projectId: target.projectId ?? projectId.value,
    filePath: target.path,
    fileId: target.id,
  }
  showVersionPopup.value = true
}

/** 选中历史版本：URL 带 ?v= 版本号（loadByNodeId 从 URL 读取加载历史版本），
 *  走统一打开入口；打开成功后 router.replace('/shell') 会清掉 query，不影响下次正常打开 */
function onOpenHistoricalVersion(payload: { nodeId: string; revision: number }) {
  const url = new URL(window.location.href)
  url.searchParams.set('v', String(payload.revision))
  history.replaceState(history.state, '', url.toString())
  void openFromList(payload.nodeId, {
    path: `/shell/file/project/${projectId.value}`,
    folderId: fileList.currentFolderId.value,
    breadcrumbs: fileList.breadcrumbs.value,
  })
}

// ── 高级筛选（二期 d）：确认后交 composable 统一织入 getChildren/search 请求 ──
const showFilterPopup = ref(false)

function onFilterApply(filters: FileListFilters) {
  fileList.setFilters(filters)
}

// ── 操作历史（二期 b）：nav-bar 入口 → ProjectAuditLogPopup；定位=文件打开图纸/文件夹跳父目录 ──
const showAuditPopup = ref(false)

async function onAuditLocate(log: AuditLogItem) {
  const nodeId = log.resourceId
  if (!nodeId) return
  if (log.resourceType === 'FOLDER') {
    // 文件夹 → 取父目录后把文件列表定位过去（loadRootNode override 优先于持久化存档）
    try {
      const res = await nodeControllerGetParentContext({ path: { nodeId } })
      if (res.error) throw new Error(String(res.error))
      const parentId = (res.data as { parentId?: string } | undefined)?.parentId
      if (parentId) {
        await fileList.loadRootNode(projectId.value, { folderId: parentId, breadcrumbs: [] })
      }
    } catch {
      showToast(t('定位失败，节点可能已移动或删除'))
    }
    return
  }
  // 文件 → 走统一打开入口
  void openFromList(nodeId, {
    path: `/shell/file/project/${projectId.value}`,
    folderId: fileList.currentFolderId.value,
    breadcrumbs: fileList.breadcrumbs.value,
  })
}

// ── 项目管理菜单（nav-bar「更多」：编辑/成员/角色/转移设置/历史/删除，对齐 PC 项目卡片菜单）──
const showManageSheet = ref(false)
const showEditPopup = ref(false)
const showTransferSettings = ref(false)

type ManageActionKey = 'edit' | 'members' | 'roles' | 'transferSettings' | 'history' | 'delete'
type ManageAction = ActionSheetAction & { key: ManageActionKey }

const manageActions = computed<ManageAction[]>(() => {
  const actions: ManageAction[] = []
  if (canUpdateProject.value) actions.push({ key: 'edit', name: t('编辑项目') })
  actions.push({ key: 'members', name: t('成员') })
  if (canManageRoles.value) actions.push({ key: 'roles', name: t('角色管理') })
  if (canManageTransfer.value) actions.push({ key: 'transferSettings', name: t('跨项目转移') })
  actions.push({ key: 'history', name: t('操作历史') })
  if (canDeleteProject.value) actions.push({ key: 'delete', name: t('删除项目'), color: '#ee0a24' })
  return actions
})

function onManageAction(action: ManageAction) {
  showManageSheet.value = false
  switch (action.key) {
    case 'edit':
      showEditPopup.value = true
      break
    case 'members':
      activeTab.value = 1
      break
    case 'roles':
      goRoleManagement()
      break
    case 'transferSettings':
      showTransferSettings.value = true
      break
    case 'history':
      showAuditPopup.value = true
      break
    case 'delete':
      void onManageDelete()
      break
  }
}

// 项目级操作（编辑/删除/转让）集中在 useProjectActions；详情页的统一刷新只刷项目信息
const projectActions = useProjectActions(async () => {
  await loadProjectInfo()
})

/** 删除项目：成功后回退项目列表（文件浏览器） */
async function onManageDelete() {
  const ok = await projectActions.remove(projectId.value, projectName.value)
  if (ok) router.back()
}

/** 编辑项目（名称+描述）：composable 的刷新会更新 projectInfo，名称本地同步 */
async function onEditProjectConfirm(payload: { name: string; description: string }) {
  showEditPopup.value = false
  const ok = await projectActions.update(projectId.value, payload)
  if (ok) projectName.value = payload.name
}

/** 转移设置已保存（选择即保存）：更新本地 ProjectDto 缓存 */
function onTransferSettingsSaved(settings: Partial<ProjectDto>) {
  if (projectInfo.value) {
    projectInfo.value = { ...projectInfo.value, ...settings }
  }
}

/** 转让所有权（成员行按钮）：成功后重载成员+权限（转让后自己的权限会变化） */
async function onTransferOwnership(member: { id: string; name: string }) {
  const ok = await projectActions.transferOwnership(projectId.value, member)
  if (ok) {
    await Promise.all([loadMembers(), loadProjectPermissions()])
  }
}

// ── A-07 批量下载任务面板（zip 打包 + 单文件格式转换共用，3s 轮询）──
const { createFolderZipTask, createSingleFormatTask } = useBatchDownload()
const showBatchPanel = ref(false)

// ── A-06 格式转换下载（底部弹窗选格式）──
// 转换格式（dwg/dxf/pdf）走异步单文件任务队列（对齐 PC）：同步 download-with-format
// 对慢转换会挂起至超时；mxweb/original 无转换开销，保持同步直下
const showFormatPopup = ref(false)
const formatTarget = ref<{ id: string; name: string } | null>(null)

function openFormatDownload(target: { id: string; name: string }) {
  formatTarget.value = target
  showFormatPopup.value = true
}

async function onFormatDownloadConfirm(payload: DownloadFormatPayload) {
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

async function downloadFolder(target: { id: string; name: string; projectId?: string }) {
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
    fileList.refresh()
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

// 个人空间根 id：移动/复制目标含个人空间（对齐 PC），惰性取一次；取不到则回落仅列我的项目
const personalSpaceId = ref<string | null>(null)
async function ensurePersonalSpaceId() {
  if (personalSpaceId.value) return
  const res = await projectControllerGetPersonalSpace()
  if (res.error) return
  const space = res.data as { id?: string } | undefined
  if (space?.id) personalSpaceId.value = space.id
}

// ── Bug6 剪贴板粘贴：把剪贴板内容粘贴到当前文件夹（cut→move 成功后清空）──
const clipboard = useFileSystemClipboard()

function onClearPaste() {
  clipboard.clearClipboard()
}

async function onPaste() {
  if (!clipboard.hasItems || !clipboard.mode) return
  const mode = clipboard.mode
  const targetId = fileList.currentFolderId.value ?? projectId.value
  if (!targetId) {
    showFailToast(t('无法确定粘贴位置'))
    return
  }
  const op = mode === 'cut' ? 'move' : 'copy'
  // 跨根剪切（源=其他项目/个人空间）：文件将从源移走，二次确认（对齐 PC）
  if (mode === 'cut' && clipboard.sourceRootId && clipboard.sourceRootId !== projectId.value) {
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
  const items = clipboard.itemIds.map((id) => ({ id, name: '' }))
  void doMoveOrCopy({ id: targetId, name: '' }, op, items, true)
}

async function openFolderPicker(op: 'move' | 'copy', items: Array<{ id: string; name: string }>) {
  const rootId = fileList.currentFolderId.value ?? projectId.value
  if (!rootId) {
    showFailToast(t('文件夹未就绪，请稍后再试'))
    return
  }
  folderPickerOp.value = op
  folderPickerItems.value = items
  // 拉目标根（含个人空间）+ 源项目转移设置（源=当前项目）
  await ensurePersonalSpaceId()
  await transferTargets.load(personalSpaceId.value)
  await crossTransfer.init({ id: projectId.value, name: projectName.value, domain: 'project' }, op)
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
        ? await nodeControllerMoveNode({ path: { nodeId: items[0].id }, body: { targetParentId: folder.id } } as any)
        : await nodeControllerCopyNode({ path: { nodeId: items[0].id }, body: { targetParentId: folder.id } } as any)
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
    // 剪切粘贴：只要有项成功就清空剪贴板（对齐 PC movedIds.length>0；全失败保留可重试；复制粘贴保留）
    if (isClipboardPaste && op === 'move') {
      const moved = items.length === 1 ? 1 : (data?.successCount ?? 0)
      if (moved > 0) clipboard.clearClipboard()
    }
    fileList.refresh()
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
  // 跨项目 move：源项目文件将被移走，二次确认（对齐 PC）
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

// ── 新建文件夹弹窗 ──
const showCreateFolderDialog = ref(false)
const folderNameInput = ref('')
const showFabSheet = ref(false)

async function onCreateFolderConfirm() {
  const name = folderNameInput.value.trim()
  const validation = validateName(name)
  if (!validation.valid) {
    showToast(validation.error || t('文件夹名称无效'))
    return
  }
  const parentId = fileList.currentFolderId.value ?? projectId.value
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
    showToast(t('文件夹创建成功'))
    fileList.refresh()
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
  () => fileList.currentFolderId.value ?? projectId.value,
  () => fileList.refresh(),
)

// ── 文件上传 ──
const fileInputRef = ref<HTMLInputElement | null>(null)

function triggerFileUpload() {
  fileInputRef.value?.click()
}

/**
 * 上传走 mobileUploadService（SDK 生成函数 + MD5 哈希 + 秒传检查 + 5MB 分片），
 * 与 FileBrowserPage / PC 端上传管线同一套后端契约；禁止原生 fetch/FormData（见 AGENTS.md 三层一致性）。
 */
async function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return

  const parentId = fileList.currentFolderId.value ?? projectId.value
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
    await fileList.refresh()
  }
}

const memberRows = computed(() =>
  members.value.map((m: any) => ({
    id: m.id,
    name: m.nickname ?? m.username ?? m.email ?? '未知',
    role: getProjectRoleDisplayName(m.projectRoleName ?? m.role?.name ?? 'PROJECT_MEMBER'),
    joinedAt: m.joinedAt ?? '',
    projectRoleId: m.projectRoleId,
    email: m.email ?? '',
    username: m.username ?? '',
  }))
)

onMounted(() => {
  loadProjectInfo()
  initFileList()
  loadMembers()
  loadRoles()
  loadProjectPermissions()
  loadProjectQuota()
  // 从项目列表卡片管理菜单深链进入（?manage=members|roles|transfer|history）：直达对应管理区
  const manage = route.query.manage
  if (manage === 'roles') {
    goRoleManagement()
  } else if (manage === 'members') {
    activeTab.value = 1
  } else if (manage === 'history') {
    showAuditPopup.value = true
  } else if (manage === 'transfer') {
    showTransferSettings.value = true
  }
})
</script>

<template>
  <div class="subpage">
    <van-nav-bar :title="projectName" left-arrow @click-left="() => router.back()">
      <!-- 项目管理入口（对齐 PC 项目卡片「…」菜单：编辑/成员/角色/转移设置/历史/删除） -->
      <template #right>
        <van-icon name="ellipsis" size="20" @click="showManageSheet = true" />
      </template>
    </van-nav-bar>

    <van-tabs v-model:active="activeTab" line-width="28" class="detail-tabs">
      <van-tab title="文件">
        <!-- B-15 项目上传配额（对齐 PC FileSystemHeader：进度条 + 90%/超限阈值配色） -->
        <div v-if="projectQuota && projectQuota.limit > 0" class="quota-bar">
          <span class="quota-label">{{ t('上传上限') }}</span>
          <div class="quota-track">
            <div class="quota-fill" :style="{ width: quotaPercent + '%', background: quotaColor }" />
          </div>
          <span class="quota-text">{{ quotaText }}</span>
        </div>
        <div v-if="fileError && projectFiles.length === 0" class="state-box">
          <span class="state-text">{{ fileError }}</span>
          <van-button size="small" round @click="fileList.loadNodes">重试</van-button>
        </div>
        <UnifiedFileList
          v-else
          domain="project"
          :items="projectFiles"
          :loading="fileLoading"
          :breadcrumb="fileBreadcrumbs"
          :mode="fileMode"
          :keyword="fileSearch"
          :has-more="fileHasMore"
          :load-more-failed="fileLoadMoreFailed"
          :sort-by="fileSortBy"
          :sort-order="fileSortOrder"
          :filter-active="fileList.hasActiveFilters.value"
          :enable-paste="true"
          @item-click="enterFolder"
          @item-menu="onItemMenu"
          @breadcrumb-click="fileList.goBackTo"
          @mode-change="onModeChange"
          @selection-action="onSelectionAction"
          @search="fileList.setSearch"
          @load-more="fileList.loadMore"
          @load-more-retry="fileList.retryLoadMore"
          @refresh="refreshFiles"
          @sort-change="fileList.setSort"
          @filter="showFilterPopup = true"
          @fab-click="openCreateFolderDialog"
          @paste="onPaste"
          @clear-paste="onClearPaste"
        />
      </van-tab>

      <van-tab title="成员">
        <div v-if="memberError && members.length === 0" class="state-box">
          <span class="state-text">{{ memberError }}</span>
          <van-button size="small" round @click="loadMembers">重试</van-button>
        </div>
        <div v-else-if="memberLoading && members.length === 0" class="state-box">
          <van-loading size="24" />
        </div>
        <div v-else class="member-list">
          <!-- 0 成员时列表头仍要保留角色管理入口（PC 端按权限恒显示，不依赖成员数） -->
          <div v-if="members.length > 0 || canManageRoles || canManageMembers" class="member-header">
            <span v-if="members.length > 0" class="member-count">{{ members.length }} 人</span>
            <div class="member-header-actions">
              <button v-if="canManageRoles" class="add-member-btn" @click="goRoleManagement">
                <van-icon name="apps-o" size="14" />
                {{ t('角色管理') }}
              </button>
              <button v-if="canManageMembers" class="add-member-btn" @click="openAddMemberDialog">
                <van-icon name="plus" size="14" />
                添加成员
              </button>
            </div>
          </div>
          <div v-if="members.length === 0" class="state-box">
            <span class="state-text">暂无成员</span>
          </div>
          <div
            v-for="m in memberRows"
            :key="m.id"
            class="member-row"
          >
            <div class="member-avatar">
              <van-icon name="user-o" size="20" />
            </div>
            <div class="member-info">
              <span class="member-name">{{ m.name }}</span>
              <span class="member-role">{{ m.role }}</span>
            </div>
            <div v-if="canManageMembers && !isOwner(m) && !isSelf(m)" class="member-actions">
              <van-dropdown-menu class="role-dropdown">
                <van-dropdown-item
                  :options="memberRoleOptions"
                  :model-value="m.projectRoleId"
                  @change="(val: any) => onUpdateMemberRole(m, val)"
                />
              </van-dropdown-menu>
              <!-- 转让所有权（对齐 PC MembersModal 转让按钮；后端要求 PROJECT_TRANSFER） -->
              <button class="member-transfer-btn" @click="onTransferOwnership(m)">
                <van-icon name="exchange" size="16" />
              </button>
              <button class="member-remove-btn" @click="onRemoveMember(m)">
                <van-icon name="delete-o" size="16" />
              </button>
            </div>
          </div>
        </div>
      </van-tab>
    </van-tabs>

    <!-- 成员 Tab 无新建内容语义（添加成员已有列表头按钮），故只在文件 Tab 显示 FAB -->
    <button v-if="activeTab === 0" class="fab" aria-label="新建" @click="showFabSheet = true">
      <van-icon name="plus" />
    </button>
    <van-action-sheet
      v-model:show="showFabSheet"
      :actions="fabActions"
      @select="onFabSheetSelect"
    />

    <van-popup v-model:show="showCreateFolderDialog" position="bottom" round :style="{ height: '40%' }">
      <div class="create-panel">
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
      <div class="create-panel">
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

    <!-- 添加成员弹窗 -->
    <van-popup
      v-model:show="showAddMember"
      position="bottom"
      round
      :style="{ height: '60%' }"
    >
      <div class="add-member-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showAddMember = false">{{ t('取消') }}</button>
          <span class="panel-title">{{ t('添加成员') }}</span>
          <span></span>
        </div>

        <!-- 用户搜索 -->
        <div v-if="!selectedUser" class="search-section">
          <van-search
            v-model="searchKeyword"
            :placeholder="t('搜索用户')"
            shape="round"
            @update:model-value="onMemberSearchInput"
          />
          <div v-if="searchResults.length > 0" class="search-results">
            <div
              v-for="user in searchResults"
              :key="user.id"
              class="search-result-item"
              @click="selectUser(user)"
            >
              <div class="search-result-avatar">
                <van-icon name="user-o" size="24" />
              </div>
              <div class="search-result-info">
                <span class="search-result-name">{{ user.nickname ?? user.username }}</span>
                <span class="search-result-email">{{ user.email }}</span>
              </div>
            </div>
          </div>
          <div v-else-if="searchKeyword && searchResults.length === 0" class="search-empty">
            <span class="state-text">{{ t('未找到用户') }}</span>
          </div>
        </div>

        <!-- 选择角色 -->
        <div v-else class="role-section">
          <div class="selected-user">
            <div class="search-result-avatar">
              <van-icon name="user-o" size="24" />
            </div>
            <div class="search-result-info">
              <span class="search-result-name">{{ selectedUser.nickname ?? selectedUser.username }}</span>
              <span class="search-result-email">{{ selectedUser.email }}</span>
            </div>
            <button class="change-user-btn" @click="selectedUser = null">{{ t('更换') }}</button>
          </div>
          <div class="role-picker">
            <span class="role-label">{{ t('选择角色') }}</span>
            <van-radio-group v-model="selectedRoleId">
              <div
                v-for="role in roles.filter(r => !r.isOwnerRole)"
                :key="role.id"
                class="role-option"
              >
                <van-radio :name="role.id">{{ getProjectRoleDisplayName(role.name) }}</van-radio>
              </div>
            </van-radio-group>
          </div>
        </div>

        <button
          class="panel-confirm add-member-confirm"
          :disabled="!selectedUser || !selectedRoleId"
          @click="onAddMemberConfirm"
        >
          {{ t('确认添加') }}
        </button>
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
      :model-value="fileList.filters.value"
      @apply="onFilterApply"
    />

    <!-- 操作历史（二期 b）：管理菜单「操作历史」打开，定位=文件打开图纸/文件夹跳父目录 -->
    <ProjectAuditLogPopup
      :show="showAuditPopup"
      :project-id="projectId"
      @close="showAuditPopup = false"
      @locate="onAuditLocate"
    />

    <!-- 项目管理菜单（nav-bar「更多」：编辑/成员/角色/转移设置/历史/删除，按权限门控） -->
    <van-action-sheet
      v-model:show="showManageSheet"
      :actions="manageActions"
      @select="onManageAction"
    />
    <!-- 编辑项目（名称+描述，对齐 PC ProjectModal 编辑模式） -->
    <ProjectEditPopup
      v-model:show="showEditPopup"
      :initial-name="projectName"
      :initial-description="projectInfo?.description ?? ''"
      @confirm="onEditProjectConfirm"
    />
    <!-- 跨项目转移设置（6 域 × 四态，选择即保存；PROJECT_TRANSFER_MANAGE 门控） -->
    <ProjectTransferSettingsPopup
      v-model:show="showTransferSettings"
      :project-id="projectId"
      :settings="projectInfo ?? {}"
      @saved="onTransferSettingsSaved"
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
      :root-id="fileList.currentFolderId.value ?? projectId"
      :root-name="projectName"
      :exclude-ids="folderPickerItems.map((i) => i.id)"
      :roots="transferTargets.roots.value"
      :disabled-reason="crossTransfer.disabledReason.value"
      @select="onFolderPickerSelect"
      @root-change="onPickerRootChange"
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

/* B-15 项目上传配额条 */
.quota-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  flex: none;
  border-bottom: 0.5px solid var(--divider);
}

.quota-label {
  font-size: 11px;
  color: var(--text-secondary);
  flex: none;
}

.quota-track {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--bg-tertiary);
}

.quota-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s;
}

.quota-text {
  font-size: 11px;
  color: var(--text-tertiary);
  flex: none;
  white-space: nowrap;
}

.detail-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.detail-tabs :deep(.van-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.detail-tabs :deep(.van-tab__panel) {
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

.member-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 14px;
  overflow-y: auto;
}

.member-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 8px;
}

.member-count {
  font-size: 13px;
  color: var(--text-tertiary);
}

.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 0.5px solid var(--divider);
}

.member-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  flex-shrink: 0;
}

.member-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-name {
  font-size: 14px;
  color: var(--text-primary);
}

.member-role {
  font-size: 12px;
  color: var(--text-secondary);
}

.member-joined {
  font-size: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.create-panel {
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

/* ── 成员管理 ── */
.member-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.member-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-member-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  border-radius: 14px;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* 行内角色 chip。vant 自带的 ▼ 是绝对定位（right:-4px），会探出 bar 背景外（即用户看到的
   「右侧图标有一半不在背景内」），改成关掉它、由 item 的流内伪元素画三角，位置不再依赖箭头宽度。
   圆角加在 bar 上而非容器上——容器 overflow:hidden 可能裁掉绝对定位的角色面板。 */
.role-dropdown {
  flex-shrink: 0;

  :deep(.van-dropdown-menu__bar) {
    height: 32px;
    background: var(--bg-secondary);
    box-shadow: none;
    border-radius: 6px;
  }

  :deep(.van-dropdown-menu__item) {
    gap: 6px;
    padding: 0 10px 0 12px;
  }

  :deep(.van-dropdown-menu__title) {
    padding: 0;
    font-size: 13px;
    color: var(--text-secondary);
  }

  :deep(.van-dropdown-menu__title:after) {
    display: none;
  }

  :deep(.van-dropdown-menu__item::after) {
    content: '';
    flex-shrink: 0;
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 5px solid var(--text-tertiary);
  }
}

.member-transfer-btn,
.member-remove-btn {
  border: none;
  background: none;
  color: var(--text-tertiary);
  padding: 4px;
  cursor: pointer;
  border-radius: 4px;

  &:active {
    background: var(--list-hover);
  }
}

/* ── 添加成员弹窗 ── */
.add-member-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
}

.search-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  margin-top: 8px;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-radius: 8px;
  cursor: pointer;

  & + .search-result-item {
    border-top: 0.5px solid var(--divider);
  }

  &:active {
    background: var(--list-hover);
  }
}

.search-result-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.search-result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.search-result-name {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-result-email {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-empty {
  padding: 24px 0;
  text-align: center;
}

/* ── 角色选择 ── */
.role-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.selected-user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 10px;
}

.change-user-btn {
  border: none;
  background: none;
  color: var(--accent);
  font-size: 12px;
  padding: 4px 8px;
  cursor: pointer;
  flex-shrink: 0;
}

.role-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.role-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.role-option {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--bg-secondary);

  :deep(.van-radio__label) {
    font-size: 14px;
    color: var(--text-primary);
  }
}

.add-member-confirm {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  margin-top: 16px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    pointer-events: none;
  }
}

/* ── FAB 按钮 ── */
.fab {
  position: fixed;
  right: 16px;
  bottom: 60px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  z-index: 100;
}
</style>