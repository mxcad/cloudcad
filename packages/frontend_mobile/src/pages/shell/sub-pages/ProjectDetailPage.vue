<script setup lang="ts">
/**
 * 子页：项目详情 —— Tab：文件 / 成员。
 *
 *   文件 Tab：UnifiedFileList(domain='project') + 面包屑 + nodeControllerGetChildren
 *   成员 Tab：memberControllerGetProjectMembers
 *
 * projectId 从路由参数获取。
 */
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showDialog, showToast, showLoadingToast, closeToast, showSuccessToast, showFailToast } from 'vant'
import { t } from '@/languages'
import { nodeControllerGetChildren } from '@cloudcad/api-sdk/sdk.gen'
import { nodeControllerCreateFolder } from '@cloudcad/api-sdk/sdk.gen'
import { nodeControllerBatchDeleteNodes } from '@cloudcad/api-sdk/sdk.gen'
import type { ActionSheetAction } from 'vant'
import { useCreateDrawing } from '@/composables/useCreateDrawing'
import { useViewMode } from '@/composables/useViewMode'
import { projectControllerGetProject, projectControllerGetProjectQuota } from '@cloudcad/api-sdk/sdk.gen'
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

// 项目角色名称映射（使用 t() 包裹以支持 i18n）
const PROJECT_ROLE_NAMES: Record<string, string> = {
  PROJECT_OWNER: t('项目所有者'),
  PROJECT_ADMIN: t('项目管理员'),
  PROJECT_EDITOR: t('项目编辑者'),
  PROJECT_MEMBER: t('项目成员'),
  PROJECT_VIEWER: t('项目查看者'),
}

// 获取角色显示名称
function getRoleDisplayName(roleName: string): string {
  return PROJECT_ROLE_NAMES[roleName] || roleName
}

const route = useRoute()
const router = useRouter()
const projectId = computed(() => (route.params.id as string) ?? '')

const activeTab = ref(0)
const projectName = ref('项目')
const projectFiles = ref<any[]>([])
const fileLoading = ref(false)
const fileError = ref('')
const fileBreadcrumbs = ref<Array<{ id: string; name: string }>>([])
// A-16 视图模式（网格/清单）持久化，与个人空间各自记住
const fileMode = useViewMode('project')
const currentFolderId = ref<string | null>(null)

// A-10 排序（后端 getChildren 的 ALLOWED_SORT 白名单，越界抛 400）
const fileSortBy = ref<'name' | 'createdAt' | 'updatedAt' | 'size'>('updatedAt')
const fileSortOrder = ref<'asc' | 'desc'>('desc')

const members = ref<any[]>([])
const memberLoading = ref(false)
const memberError = ref('')

const editorState = useEditorState()

const fileSearch = ref('')
const filePage = ref(1)
const fileTotalPages = ref(1)
const fileLoadingMore = ref(false)
// A-14 加载更多失败标记（区别于首屏失败 → 整页错误 + 重试）
const fileLoadMoreFailed = ref(false)
let fileSearchTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 加载文件列表。page=1 替换（首屏/切换文件夹/搜索），page>1 追加（滚动加载更多）。
 * 搜索走服务端 search 参数（匹配名称或描述），与 PC 端一致。
 */
async function loadFiles(page = 1) {
  if (!projectId.value) return
  if (page === 1) fileLoading.value = true
  else fileLoadingMore.value = true
  fileError.value = ''
  fileLoadMoreFailed.value = false
  try {
    const search = fileSearch.value.trim()
    const res = await nodeControllerGetChildren({
      path: { nodeId: currentFolderId.value ?? projectId.value },
      query: {
        page,
        limit: 50,
        sortBy: fileSortBy.value,
        sortOrder: fileSortOrder.value,
        ...(search ? { search } : {}),
      },
    } as any)

    if (res.error) throw new Error(String(res.error))
    const data = (res.data ?? {}) as { nodes?: any[]; totalPages?: number }
    const items = formatNodeAsItems(data.nodes ?? []).map((item) => ({
      ...item,
      thumb: `/api/v1/file-system/nodes/${item.id}/thumbnail`,
    }))
    projectFiles.value = page === 1 ? items : [...projectFiles.value, ...items]
    fileTotalPages.value = data.totalPages ?? 1
    filePage.value = page
  } catch (e) {
    fileError.value = '加载文件失败'
    // A-14 加载更多失败：已加载内容保留，只出底部重试条；
    // filePage 未前进（成功才赋值），重试重跑目标页不会重复追加
    fileLoadMoreFailed.value = page > 1
  } finally {
    fileLoading.value = false
    fileLoadingMore.value = false
  }
}

/** 搜索（UnifiedFileList 上抛关键词，300ms 防抖后回到第一页重查） */
function onFileSearch() {
  if (fileSearchTimer) clearTimeout(fileSearchTimer)
  fileSearchTimer = setTimeout(() => {
    loadFiles(1)
  }, 300)
}

/** 滚动接近底部：还有下一页则追加加载 */
function onFileLoadMore() {
  if (fileLoading.value || fileLoadingMore.value) return
  if (filePage.value >= fileTotalPages.value) return
  loadFiles(filePage.value + 1)
}

/** A-14 加载更多失败后重试（filePage 未前进，重跑目标页） */
function retryLoadMoreFiles() {
  loadFiles(filePage.value + 1)
}

/** A-15 下拉刷新 → 回到第一页整页重查（顺带刷新配额用量） */
function refreshFiles() {
  loadFiles(1)
  loadProjectQuota()
}

/** A-10 排序切换（方向由 UnifiedFileList 计算后上抛） */
function onFileSortChange(by: 'name' | 'createdAt' | 'updatedAt' | 'size', order: 'asc' | 'desc') {
  fileSortBy.value = by
  fileSortOrder.value = order
  loadFiles(1)
}

async function loadProjectInfo() {
  if (!projectId.value) return
  try {
    const res = await projectControllerGetProject({
      path: { projectId: projectId.value },
    } as any)
    if (!res.error) {
      const data = res.data as any
      projectName.value = data?.name ?? '项目'
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
  showAddMember.value = false
  // Auto-select first non-owner role
  if (roles.value.length > 0) {
    const firstRole = roles.value.find((r: any) => !r.isOwnerRole)
    selectedRoleId.value = firstRole?.id ?? roles.value[0]?.id ?? ''
  }
}

async function onAddMemberConfirm() {
  if (!selectedUser.value || !selectedRoleId.value) {
    showFailToast('请选择用户和角色')
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
    showSuccessToast('成员添加成功')
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
    })
    showLoadingToast({ message: '移除中...', forbidClick: true })
    const res = await memberControllerRemoveProjectMember({
      path: { projectId: projectId.value, userId: member.id } as any,
    } as any)
    if (res.error) throw new Error(String(res.error))
    closeToast()
    showSuccessToast('成员已移除')
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

function getRoleName(id: string): string {
  const role = roles.value.find((r: any) => r.id === id)
  if (!role) return t('未知角色')
  return getRoleDisplayName(role.name)
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

async function enterFolder(item: any) {
  if (item.isFolder) {
    currentFolderId.value = item.id
    fileBreadcrumbs.value.push({ id: item.id, name: item.name })
    fileSearch.value = ''
    loadFiles(1)
    return
  }

  if (!item.path) return
  const fileUrl = `/api/v1/mxcad/filesData/${item.path}?t=${Date.now()}`
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

function goBackTo(index: number) {
  if (index < 0) {
    currentFolderId.value = null
    fileBreadcrumbs.value = []
  } else {
    fileBreadcrumbs.value = fileBreadcrumbs.value.slice(0, index + 1)
    currentFolderId.value = fileBreadcrumbs.value[index]?.id ?? null
  }
  fileSearch.value = ''
  loadFiles(1)
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
  { key: 'uploadFile', name: t('上传文件'), icon: 'upload' },
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
function onSelectionAction(action: 'download' | 'delete' | 'move' | 'copy', items: Array<{ id: string; name: string }>) {
  if (action === 'delete') {
    batchDelete(items)
  } else if (action === 'move' || action === 'copy') {
    openFolderPicker(action, items)
  } else if (action === 'download') {
    for (const item of items) {
      const a = document.createElement('a')
      a.href = `/api/v1/file-system/nodes/${item.id}/download?t=${Date.now()}`
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
    await loadFiles(1)
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
    enterFolder(target)
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
    await loadFiles(1)
  } catch (e) {
    closeToast()
    showFailToast(t('重命名失败'))
  }
}

const showFolderPicker = ref(false)
const folderPickerOp = ref<'move' | 'copy' | null>(null)
const folderPickerItems = ref<Array<{ id: string; name: string }>>([])

function openFolderPicker(op: 'move' | 'copy', items: Array<{ id: string; name: string }>) {
  const rootId = currentFolderId.value ?? projectId.value
  if (!rootId) {
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
    await loadFiles(1)
  } catch (e) {
    closeToast()
    showFailToast(op === 'move' ? t('移动失败') : t('复制失败'))
  }
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
  const parentId = currentFolderId.value ?? projectId.value
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
    await loadFiles()
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
  () => currentFolderId.value ?? projectId.value,
  () => loadFiles(),
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
  const file = input.files?.[0]
  if (!file) return

  const parentId = currentFolderId.value ?? projectId.value
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
    await loadFiles()
  } catch (e) {
    closeToast()
    showToast(t('上传失败，请重试'))
  } finally {
    input.value = ''
  }
}

const memberRows = computed(() =>
  members.value.map((m: any) => ({
    id: m.id,
    name: m.nickname ?? m.username ?? m.email ?? '未知',
    role: getRoleDisplayName(m.projectRoleName ?? m.role?.name ?? 'PROJECT_MEMBER'),
    joinedAt: m.joinedAt ?? '',
    projectRoleId: m.projectRoleId,
    email: m.email ?? '',
    username: m.username ?? '',
  }))
)

onMounted(() => {
  loadProjectInfo()
  loadFiles()
  loadMembers()
  loadRoles()
  loadProjectPermissions()
  loadProjectQuota()
})
</script>

<template>
  <div class="subpage">
    <van-nav-bar :title="projectName" left-arrow @click-left="() => router.back()" />

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
          <van-button size="small" round @click="loadFiles">重试</van-button>
        </div>
        <UnifiedFileList
          v-else
          domain="project"
          :items="projectFiles"
          :loading="fileLoading"
          :breadcrumb="fileBreadcrumbs"
          :mode="fileMode"
          :keyword="fileSearch"
          :has-more="filePage < fileTotalPages"
          :load-more-failed="fileLoadMoreFailed"
          :sort-by="fileSortBy"
          :sort-order="fileSortOrder"
          @item-click="enterFolder"
          @item-menu="onItemMenu"
          @breadcrumb-click="goBackTo"
          @mode-change="onModeChange"
          @selection-action="onSelectionAction"
          @search="onFileSearch"
          @update:keyword="fileSearch = $event"
          @load-more="onFileLoadMore"
          @load-more-retry="retryLoadMoreFiles"
          @refresh="refreshFiles"
          @sort-change="onFileSortChange"
          @fab-click="openCreateFolderDialog"
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
        <div v-else-if="members.length === 0" class="state-box">
          <span class="state-text">暂无成员</span>
        </div>
        <div v-else class="member-list">
          <div class="member-header">
            <span class="member-count">{{ members.length }} 人</span>
            <button v-if="canManageMembers" class="add-member-btn" @click="showAddMember = true">
              <van-icon name="plus" size="14" />
              添加成员
            </button>
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
                  :options="roles.filter(r => !r.isOwnerRole).map(r => ({ text: getRoleDisplayName(r.name), value: r.id }))"
                  v-model="m.projectRoleId"
                  @change="(val: any) => onUpdateMemberRole(m, val)"
                />
              </van-dropdown-menu>
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
                <van-radio :name="role.id">{{ getRoleDisplayName(role.name) }}</van-radio>
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
      :root-id="currentFolderId ?? projectId"
      :root-name="projectName"
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
  gap: 8px;
  flex-shrink: 0;
}

.role-dropdown {
  min-width: 80px;
}

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