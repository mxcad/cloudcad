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
import { showDialog, showToast, showLoadingToast, closeToast, showSuccessToast, showFailToast } from 'vant'
import { t } from '@/languages'
import { unwrap, errMsg } from '@/utils/apiError'
import { nodeControllerDeleteNode } from '@cloudcad/api-sdk/sdk.gen'
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
} from '@cloudcad/api-sdk/sdk.gen'
import { loadProjectPermissions, invalidateProjectPermissions } from '@/services/permissionService'
import { useUser } from '@/composables/useUser'
import { rolesControllerGetProjectRolesByProject } from '@cloudcad/api-sdk/sdk.gen'
import { usersControllerSearchUsers } from '@cloudcad/api-sdk/sdk.gen'
import { formatNodeAsItems, formatSize } from '@/composables/useNodeFormatter'
import { useShellFileOpen } from '@/composables/useShellFileOpen'
import { useShellStack } from '@/stores/shellStack'
import ShareCurrentPopup from '@/pages/home/components/ShareCurrentPopup.vue'
import VersionHistoryPopup from '@/pages/home/components/VersionHistoryPopup.vue'
import FileFilterPopup from '@/pages/shell/components/FileFilterPopup.vue'
import {
  ProjectPermission,
  getProjectRoleDisplayName,
  getFileNodeMenuActions,
  getProjectMenuActions,
  type ProjectMenuAction,
} from '@/utils/projectPermissions'
import { useFormatDownload } from '@/composables/useFormatDownload'
import UnifiedFileList from '../components/UnifiedFileList.vue'
import type { SelectionActionDef } from '@/types/selection-action'
import TrashView from '../components/TrashView.vue'
import NodeFolderPicker from '../components/NodeFolderPicker.vue'
import { useClipboardPaste } from '@/composables/useClipboardPaste'
import { useUndoSnackbar } from '@/composables/useUndoSnackbar'
import { useFileNodeOps, type FabActionKey } from '@/composables/useFileNodeOps'
import { isCadFileName } from '@/utils/cadFile'
import { useNodeDownload } from '@/composables/useNodeDownload'
import UndoSnackbar from '@/components/UndoSnackbar.vue'
import RenameNodePopup from '../components/RenameNodePopup.vue'
import DownloadFormatPopup from '../components/DownloadFormatPopup.vue'
import BatchDownloadPanel from '../components/BatchDownloadPanel.vue'
import ProjectEditPopup from '../components/ProjectEditPopup.vue'
import ProjectTransferSettingsPopup from '../components/ProjectTransferSettingsPopup.vue'
import { useProjectActions } from '@/composables/useProjectActions'
import type {
  ProjectDto,
  ProjectMemberDto,
  ProjectRoleDto,
  UserResponseDto,
  ProjectQuotaDto,
} from '@cloudcad/api-sdk/types.gen'

const route = useRoute()
const router = useRouter()
// 路由参数名与 @cloudcad/platform 映射表共用（router/index.ts）
const projectId = computed(() => (route.params.projectId as string) ?? '')

const activeTab = ref(0)
const projectName = ref(t('项目'))

// 回收站（对齐 PC 概念：项目详情页的回收站 = 本项目子树的已删条目，nav bar 入口）
const isTrashView = ref(false)
// 回收站内动作成功（恢复/彻底删除/清空）后置 true；关闭回收站时据此刷新文件列表
const trashDirty = ref(false)

function closeTrash() {
  isTrashView.value = false
  const dirty = trashDirty.value
  trashDirty.value = false
  if (dirty) void refreshFiles()
}

// 文件列表数据层统一走 useUnifiedFileList（与个人空间同一套加载/分页/排序/搜索/面包屑逻辑），
// 项目页只保留本页特有的编排：项目根初始化、返回还原、配额条、权限门控
const fileList = useUnifiedFileList('project')
// A-16 视图模式（网格/清单）持久化，与个人空间各自记住
const fileMode = useViewMode('project')

const members = ref<ProjectMemberDto[]>([])
const memberLoading = ref(false)
const memberError = ref('')

const shellStack = useShellStack()
const { openFromList } = useShellFileOpen()
const { downloadOriginal } = useNodeDownload()

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
  // A-29b 搜索结果「进入文件夹 / 打开所在位置」：URL 带 ?folderId= 定位到指定文件夹
  //（ancestorPath 无 id 无法还原面包屑，breadcrumbs 留空，列表定位到该文件夹）
  const queryFolderId = route.query.folderId as string | undefined
  const override =
    target?.folderId && target.breadcrumbs?.length
      ? { folderId: target.folderId, breadcrumbs: target.breadcrumbs }
      : queryFolderId
        ? { folderId: queryFolderId, breadcrumbs: [] }
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
    })
    unwrap(res)
    const data = res.data as ProjectDto | undefined
    if (data) {
      projectInfo.value = data
      projectName.value = data.name ?? t('项目')
    }
  } catch (e) {
    projectName.value = t('项目 {id}', { id: projectId.value.slice(0, 6) })
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
    })
    unwrap(res)
    const data = res.data as ProjectQuotaDto | undefined
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
    })
    unwrap(res)
    members.value = res.data ?? []
  } catch (e) {
    memberError.value = t('加载成员失败')
  } finally {
    memberLoading.value = false
  }
}

// ── 成员管理 ──
const roles = ref<ProjectRoleDto[]>([])
const showAddMember = ref(false)
const searchKeyword = ref('')
const searchResults = ref<UserResponseDto[]>([])
const selectedUser = ref<UserResponseDto | null>(null)
const selectedRoleId = ref<string>('')
const memberSearchTimer = ref<ReturnType<typeof setTimeout> | null>(null)

async function loadRoles() {
  try {
    const res = await rolesControllerGetProjectRolesByProject({
      path: { projectId: projectId.value },
    })
    unwrap(res)
    roles.value = res.data ?? []
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
        query: { search: val, limit: 10 },
      })
      unwrap(res)
      // Filter out existing members
      const existingIds = new Set(members.value.map((m) => m.id))
      searchResults.value = (res.data?.users ?? []).filter((u) => !existingIds.has(u.id))
    } catch (e) {
      console.error('searchUsers error:', e)
    }
  }, 300)
}

function selectUser(user: UserResponseDto) {
  selectedUser.value = user
  // Auto-select first non-owner role
  if (roles.value.length > 0) {
    const firstRole = roles.value.find((r) => !r.isOwnerRole)
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
  showLoadingToast({ message: t('添加中...'), forbidClick: true })
  try {
    const res = await memberControllerAddProjectMember({
      path: { projectId: projectId.value },
      body: {
        userId: selectedUser.value.id,
        projectRoleId: selectedRoleId.value,
      },
    })
    unwrap(res)
    closeToast()
    showSuccessToast(t('成员添加成功'))
    showAddMember.value = false
    selectedUser.value = null
    await loadMembers()
  } catch (e) {
    closeToast()
    showFailToast(errMsg(e, t('添加失败')))
  }
}

async function onRemoveMember(member: { id: string; name: string }) {
  try {
    await showDialog({
      title: t('移除成员'),
      message: t('确定移除成员 {name} 吗？', { name: member.name }),
      showCancelButton: true,
    })
    showLoadingToast({ message: t('移除中...'), forbidClick: true })
    const res = await memberControllerRemoveProjectMember({
      path: { projectId: projectId.value, userId: member.id },
    })
    unwrap(res)
    closeToast()
    showSuccessToast(t('成员已移除'))
    await loadMembers()
  } catch (e) {
    if (e !== 'cancel') {
      closeToast()
      showFailToast(errMsg(e, t('移除失败')))
    }
  }
}

async function onUpdateMemberRole(member: { id: string; projectRoleId: string }, roleId: string) {
  if (roleId === member.projectRoleId) return
  try {
    const res = await memberControllerUpdateProjectMember({
      path: { projectId: projectId.value, userId: member.id },
      body: { projectRoleId: roleId },
    })
    unwrap(res)
    showSuccessToast(t('角色已更新'))
    await loadMembers()
  } catch (e) {
    showFailToast(errMsg(e, t('更新失败')))
  }
}

const ownerRoleId = computed(() => roles.value.find((r) => r.isOwnerRole)?.id)

// 角色下拉选项必须是稳定引用：DropdownMenu 的渲染 effect 会在 item.renderTitle()
// 里读到该 prop，模板内联 filter/map 每次渲染都是新数组 → 触发自身重渲染死循环
// （Maximum recursive updates exceeded in component <van-dropdown-menu>）
const memberRoleOptions = computed(() =>
  roles.value
    .filter((r) => !r.isOwnerRole)
    .map((r) => ({ text: getProjectRoleDisplayName(r.name), value: r.id }))
)

function isOwner(member: { projectRoleId: string }): boolean {
  return member.projectRoleId === ownerRoleId.value
}

// 成员自我保护（B-04）+ 权限门控（B-05）：对齐 PC MembersModal，
// 管理入口可见性由后端返回的 PROJECT_MEMBER_MANAGE 权限决定，操作对象排除自己
const { user: currentUser } = useUser()
const currentUserId = computed(() => currentUser.value?.id ?? '')

function isSelf(member: { id: string }): boolean {
  return !!member.id && member.id === currentUserId.value
}

const projectPermissions = ref<string[]>([])

// 权限拉取统一走 permissionService.loadProjectPermissions（TTL 缓存 + 失败回退旧值）；
// 本壳页进入/变更后先失效缓存再拉取，保证门控菜单项始终反映最新权限
async function refreshProjectPermissions() {
  invalidateProjectPermissions(projectId.value)
  projectPermissions.value = await loadProjectPermissions(projectId.value)
}

const canManageMembers = computed(() =>
  projectPermissions.value.includes('PROJECT_MEMBER_MANAGE')
)

// 角色管理入口（对齐 PC ProjectListView 的 canManageRoles 门控：PROJECT_ROLE_MANAGE）
const canManageRoles = computed(() =>
  projectPermissions.value.includes(ProjectPermission.PROJECT_ROLE_MANAGE)
)

// 多选操作权限门控（对齐 PC canBatchCopy/Move/Delete/Download：按项目 FILE_* 权限；加载期悲观禁用）
const canCopyFile = computed(() => projectPermissions.value.includes(ProjectPermission.FILE_COPY))
const canMoveFile = computed(() => projectPermissions.value.includes(ProjectPermission.FILE_MOVE))
const canDeleteFile = computed(() => projectPermissions.value.includes(ProjectPermission.FILE_DELETE))
const canDownloadFile = computed(() => projectPermissions.value.includes(ProjectPermission.FILE_DOWNLOAD))
const canCreateFile = computed(() => projectPermissions.value.includes(ProjectPermission.FILE_CREATE))
const canUploadFile = computed(() => projectPermissions.value.includes(ProjectPermission.FILE_UPLOAD))

// 多选操作项：注入权限门控（个人空间自持无需门控，沿用 UnifiedFileList 默认四项）
const fileSelectionActions = computed<SelectionActionDef[]>(() => [
  { key: 'copy', label: t('复制'), disabled: !canCopyFile.value },
  { key: 'cut', label: t('剪切'), disabled: !canMoveFile.value },
  // 移动=直达文件夹选择器（移动端便捷入口，比剪切+粘贴少一步；PC 无此按钮）；权限同剪切（FILE_MOVE）
  { key: 'move', label: t('移动'), disabled: !canMoveFile.value },
  { key: 'download', label: t('下载'), disabled: !canDownloadFile.value },
  { key: 'delete', label: t('删除'), danger: true, disabled: !canDeleteFile.value },
])

function goRoleManagement() {
  router.push(`/shell/file/project/${projectId.value}/roles`)
}

function getRoleName(id: string): string {
  const role = roles.value.find((r) => r.id === id)
  if (!role) return t('未知角色')
  return getProjectRoleDisplayName(role.name)
}

/** 文件夹下钻 + 图纸打开（打开走 useShellFileOpen，补齐文件上下文与缓存） */
function enterFolder(item: { id: string; name: string; isFolder?: boolean }) {
  if (item.isFolder) {
    const raw = fileList.nodes.value.find((n) => n.id === item.id)
    if (raw) fileList.enterFolder(raw)
    return
  }
  // H1：非 CAD 文件不走 CAD 编辑器，直接原格式下载（对齐 PC handleFileOpen）
  if (!isCadFileName(item.name)) {
    void downloadOriginal(item.id, item.name)
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
// （showCreateFolderDialog/folderNameInput/showFabSheet 已收敛进 useFileNodeOps，见文件底部 ctx）
type FabAction = ActionSheetAction & { key: FabActionKey }

// M6：FAB 按权限门控（对齐 PC FileSystemHeader canCreate/canUpload 为 false 时隐藏入口）
const fabActions = computed<FabAction[]>(() => {
  const actions: FabAction[] = []
  if (canCreateFile.value) {
    actions.push({ key: 'createFolder', name: t('新建文件夹'), icon: 'bag-o' })
    actions.push({ key: 'createDrawing', name: t('新建图纸'), icon: 'description' })
  }
  if (canUploadFile.value) actions.push({ key: 'uploadFile', name: t('上传文件'), icon: 'arrow-up' })
  actions.push({ key: 'downloadTasks', name: t('下载任务'), icon: 'down' })
  return actions
})

// ── 单条目操作菜单（A-03）+ 重命名（A-04）+ 移动/复制（A-05）+ 格式下载（A-06）+ 文件夹下载（A-08）──
// menuTarget/showMenuSheet 等状态与 onItemMenu/onMenuAction 已收敛进 useFileNodeOps（见文件底部 ctx）
const menuActions = computed(() => {
  const isFolder = !!menuTarget.value?.isFolder
  // CAD 图纸 → 外部参照管理（对齐 PC isCadFile && canManageExternalReference visibilityCheck）
  const isCad = !isFolder && menuTarget.value ? isCadFileName(menuTarget.value.name) : false
  // M5：逐项权限门控（对齐 PC fileActionConfig permissionCheck；个人空间自持无需门控，仅项目页）
  const perms = projectPermissions.value
  return getFileNodeMenuActions({
    isFolder,
    isCad,
    can: {
      download: perms.includes(ProjectPermission.FILE_DOWNLOAD),
      share: perms.includes(ProjectPermission.FILE_SHARE),
      externalRef: perms.includes(ProjectPermission.CAD_EXTERNAL_REFERENCE),
      versionHistory: perms.includes(ProjectPermission.VERSION_READ),
      rename: perms.includes(ProjectPermission.FILE_EDIT),
      move: perms.includes(ProjectPermission.FILE_MOVE),
      copy: perms.includes(ProjectPermission.FILE_COPY),
      delete: perms.includes(ProjectPermission.FILE_DELETE),
    },
  })
})

// ── 操作历史（二期 b）：nav-bar 入口 → ProjectAuditLogPopup；定位=文件打开图纸/文件夹跳父目录 ──
const showAuditPopup = ref(false)

async function onAuditLocate(log: AuditLogItem) {
  const nodeId = log.resourceId
  if (!nodeId) return
  if (log.resourceType === 'FOLDER') {
    // 文件夹 → 取父目录后把文件列表定位过去（loadRootNode override 优先于持久化存档）
    try {
      const res = await nodeControllerGetParentContext({ path: { nodeId } })
      unwrap(res)
      const parentId = (res.data as { parentId?: string } | undefined)?.parentId
      if (parentId) {
        await fileList.loadRootNode(projectId.value, { folderId: parentId, breadcrumbs: [] })
      }
    } catch {
      showToast(t('定位失败，节点可能已移动或删除'))
    }
    return
  }
  // 文件 → 走统一打开入口（H1：非 CAD 文件名称快照判定，直下而非进编辑器）
  if (log.resourceName && !isCadFileName(log.resourceName)) {
    void downloadOriginal(nodeId, log.resourceName)
    return
  }
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

type ManageAction = ProjectMenuAction

// 门控表 + 装配表收在 getProjectMenuActions（与 FileBrowserPage 共用），此处只留分派
const manageActions = computed<ManageAction[]>(() => getProjectMenuActions(projectPermissions.value))

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
    case 'transfer':
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
    await Promise.all([loadMembers(), refreshProjectPermissions()])
  }
}

// ── A-06/A-07 格式转换下载 + 批量下载任务面板（项目空间：zip 任务带 projectId）──
// 状态机收敛到 useFormatDownload（与 FileBrowserPage 共用，唯一差异是 zip 是否带 projectId）
const formatDownload = useFormatDownload({ zipProjectId: () => projectId.value })
const {
  showBatchPanel,
  showFormatPopup,
  formatTarget,
  formatDownloadMode,
  batchConvertCount,
  onFormatDownloadConfirm,
} = formatDownload

// 个人空间根 id：移动/复制目标含个人空间（对齐 PC），惰性取一次；取不到则回落仅列我的项目
const personalSpaceId = ref<string | null>(null)
async function ensurePersonalSpaceId() {
  if (personalSpaceId.value) return
  const res = await projectControllerGetPersonalSpace()
  try {
    unwrap(res)
  } catch {
    return
  }
  const space = res.data as { id?: string } | undefined
  if (space?.id) personalSpaceId.value = space.id
}

// 粘贴预判：目标=当前项目；策略禁止跨项目转移 → 禁用粘贴 + 原因（对齐 PC）
const pastePolicy = useClipboardPaste(() => ({ id: projectId.value, domain: 'project' }))
// 粘贴门控=目标权限(FILE_CREATE) + 跨项目策略（对齐 PC canPaste = enableClipboard && canCreate && verdict）
const canPasteNow = computed(() => pastePolicy.canPaste.value && canCreateFile.value)
const pasteDisabledReasonNow = computed(() =>
  !canCreateFile.value ? t('没有执行此操作的权限') : pastePolicy.pasteDisabledReason.value,
)

// 删除/复制/移动撤销：操作成功后浮出撤销条，限时内点「撤销」回滚；回滚失败经 onError 弹「撤销失败」
const undo = useUndoSnackbar(5000, () => showFailToast(t('撤销失败')))

// ── 新建图纸（create-drawing 空白模板，后端自动补 .mxweb 后缀）──
const createDrawing = useCreateDrawing(
  () => fileList.currentFolderId.value ?? projectId.value,
  () => fileList.refresh(),
  // 撤销：彻底删除新建图纸（对齐 PC createDrawing undo rollback）
  (createdId) => {
    undo.trackUndo(t('已创建图纸'), async () => {
      const r = await nodeControllerDeleteNode({ path: { nodeId: createdId }, query: { permanently: true } })
      unwrap(r)
      showSuccessToast(t('已撤销'))
      await fileList.refresh()
    })
  },
)
const {
  showCreateDrawingDialog,
  drawingNameInput,
  openCreateDrawingDialog,
  onCreateDrawingConfirm,
} = createDrawing

// ── 文件节点操作层（C2：与 FileBrowserPage 共用 useFileNodeOps，差异收敛进 ctx）──
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
  reloadAfterOp: () => fileList.refresh(),
  currentFolderId: fileList.currentFolderId,
  breadcrumbs: fileList.breadcrumbs,
  rootId: fileList.rootId,
  setFilters: fileList.setFilters,
  spaceId: projectId,
  personalSpaceId,
  ensurePersonalSpaceId,
  domain: 'project',
  openItem: enterFolder,
  openHistoricalVersion: (nodeId) => {
    void openFromList(nodeId, {
      path: `/shell/file/project/${projectId.value}`,
      folderId: fileList.currentFolderId.value,
      breadcrumbs: fileList.breadcrumbs.value,
    })
  },
  resolveParentId: () => fileList.currentFolderId.value ?? projectId.value,
  folderPickerGuard: () => fileList.currentFolderId.value ?? projectId.value,
  transferSource: () => ({ id: projectId.value, name: projectName.value, domain: 'project' }),
  pasteGate: canPasteNow,
  pasteDisabledReason: pasteDisabledReasonNow,
  downloadOriginal,
  formatDownload,
  createDrawing,
  undo,
})

const memberRows = computed(() =>
  members.value.map((m) => ({
    id: m.id,
    name: m.nickname ?? m.username ?? m.email ?? t('未知'),
    role: getProjectRoleDisplayName(m.projectRoleName ?? 'PROJECT_MEMBER'),
    joinedAt: m.joinedAt ?? '',
    projectRoleId: m.projectRoleId,
    email: m.email ?? '',
    username: m.username ?? '',
    avatar: m.avatar ?? '',
  }))
)

// B-08 成员头像加载失败回落图标（逐 id 记录，避免整列回退）
const avatarErrors = ref<Set<string>>(new Set())
function onAvatarError(id: string) {
  avatarErrors.value.add(id)
}

// B-09 按角色筛选成员（对齐 PC MembersModal filterRoleId；选项含所有角色含所有者）
const filterRoleId = ref('')
const roleFilterOptions = computed(() => [
  { text: t('所有角色'), value: '' },
  ...roles.value.map((r) => ({
    text: getProjectRoleDisplayName(r.name),
    value: r.id,
  })),
])
const filteredMemberRows = computed(() =>
  filterRoleId.value
    ? memberRows.value.filter((m) => m.projectRoleId === filterRoleId.value)
    : memberRows.value
)

onMounted(() => {
  loadProjectInfo()
  initFileList()
  loadMembers()
  loadRoles()
  refreshProjectPermissions()
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
    <!-- 回收站打开时：标题变「回收站」，左箭头返回文件列表（对齐 PC 回收站 toggle）；
         未打开时右侧「回收站」入口（本项目子树已删条目）+ 项目管理菜单 -->
    <van-nav-bar
      :title="isTrashView ? t('回收站') : projectName"
      left-arrow
      @click-left="isTrashView ? closeTrash() : router.back()"
    >
      <template v-if="!isTrashView" #right>
        <van-icon name="delete-o" size="20" @click="isTrashView = true" />
        <!-- 项目管理入口（对齐 PC 项目卡片「…」菜单：编辑/成员/角色/转移设置/历史/删除） -->
        <van-icon name="ellipsis" size="20" @click="showManageSheet = true" />
      </template>
    </van-nav-bar>

    <van-tabs v-show="!isTrashView" v-model:active="activeTab" line-width="28" class="detail-tabs">
      <van-tab :title="t('文件')">
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
          <van-button size="small" round @click="fileList.loadNodes">{{ t('重试') }}</van-button>
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
          :selection-actions="fileSelectionActions"
          :show-fab="canCreateFile"
          :enable-paste="true"
          :paste-disabled="!canPasteNow"
          :paste-disabled-reason="pasteDisabledReasonNow"
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

      <van-tab :title="t('成员')">
        <div v-if="memberError && members.length === 0" class="state-box">
          <span class="state-text">{{ memberError }}</span>
          <van-button size="small" round @click="loadMembers">{{ t('重试') }}</van-button>
        </div>
        <div v-else-if="memberLoading && members.length === 0" class="state-box">
          <van-loading size="24" />
        </div>
        <div v-else class="member-list">
          <!-- 0 成员时列表头仍要保留角色管理入口（PC 端按权限恒显示，不依赖成员数） -->
          <div v-if="members.length > 0 || canManageRoles || canManageMembers" class="member-header">
            <div class="member-header-left">
              <span v-if="members.length > 0" class="member-count">{{ t('{count} 人', { count: filteredMemberRows.length }) }}</span>
              <van-dropdown-menu v-if="members.length > 0" class="role-filter-dropdown">
                <van-dropdown-item
                  :options="roleFilterOptions"
                  :model-value="filterRoleId"
                  @change="(val: string) => (filterRoleId = val)"
                />
              </van-dropdown-menu>
            </div>
            <div class="member-header-actions">
              <button v-if="canManageRoles" class="add-member-btn" @click="goRoleManagement">
                <van-icon name="apps-o" size="14" />
                {{ t('角色管理') }}
              </button>
              <button v-if="canManageMembers" class="add-member-btn" @click="openAddMemberDialog">
                <van-icon name="plus" size="14" />
                {{ t('添加成员') }}
              </button>
            </div>
          </div>
          <div v-if="members.length === 0" class="state-box">
            <span class="state-text">{{ t('暂无成员') }}</span>
          </div>
          <div v-else-if="filteredMemberRows.length === 0" class="state-box">
            <span class="state-text">{{ t('没有符合条件的成员') }}</span>
          </div>
          <div
            v-for="m in filteredMemberRows"
            :key="m.id"
            class="member-row"
          >
            <div class="member-avatar">
              <van-image
                v-if="m.avatar && !avatarErrors.has(m.id)"
                :src="m.avatar"
                class="member-avatar-img"
                fit="cover"
                @error="onAvatarError(m.id)"
              />
              <van-icon v-else name="user-o" size="20" />
            </div>
            <div class="member-info">
              <span class="member-name">{{ m.name }}</span>
              <span v-if="m.email" class="member-email">{{ m.email }}</span>
              <span class="member-role">{{ m.role }}</span>
            </div>
            <div v-if="canManageMembers && !isOwner(m) && !isSelf(m)" class="member-actions">
              <van-dropdown-menu class="role-dropdown">
                <van-dropdown-item
                  :options="memberRoleOptions"
                  :model-value="m.projectRoleId"
                  @change="(val: string) => onUpdateMemberRole(m, val)"
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

    <!-- 回收站视图（本项目子树已删条目；动作成功后关站刷新文件列表） -->
    <TrashView
      v-if="isTrashView"
      :project-id="projectId"
      :scope-label="projectName"
      @changed="trashDirty = true"
    />

    <!-- 成员 Tab 无新建内容语义（添加成员已有列表头按钮），故只在文件 Tab 显示 FAB -->
    <button v-if="activeTab === 0 && !isTrashView" class="fab" :aria-label="t('新建')" @click="showFabSheet = true">
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

/* flex:1 + 居中：与 UnifiedFileList .empty-state 口径一致（.van-tab__panel / .member-list 是 flex 列），
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
  overflow: hidden;
}

/* B-08 成员真实头像：铺满圆形容器，加载失败回落 user-o 图标 */
.member-avatar-img {
  width: 38px;
  height: 38px;
  display: block;
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

/* B-08 成员邮箱副行：无邮箱则不渲染（模板 v-if），不显示占位 */
.member-email {
  font-size: 12px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* B-09 左侧分组：人数 + 角色筛选下拉，与右侧操作按钮 space-between 对齐 */
.member-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
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

/* 行内角色 chip + B-09 列表头角色筛选。vant 自带的 ▼ 是绝对定位（right:-4px），会探出 bar 背景外（即用户看到的
   「右侧图标有一半不在背景内」），改成关掉它、由 item 的流内伪元素画三角，位置不再依赖箭头宽度。
   圆角加在 bar 上而非容器上——容器 overflow:hidden 可能裁掉绝对定位的角色面板。 */
.role-dropdown,
.role-filter-dropdown {
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