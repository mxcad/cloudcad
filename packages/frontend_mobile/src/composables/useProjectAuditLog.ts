/**
 * 项目操作历史（二期 b）数据层
 *
 * 端点 GET /api/v1/audit/project/:projectId（成员可查，ProjectAuditGuard 兜底 403）。
 * SDK 响应类型是 200: unknown（Swagger 未声明 DTO），此处按后端 AuditLogListItem 手动定义。
 * 分组语义与 PC OperationHistoryModal 一致：今天/昨天/更早 三桶（非逐日历日）。
 */
import { ref, computed } from 'vue'
import {
  projectAuditLogControllerFindByProject,
  memberControllerGetProjectMembers,
} from '@cloudcad/api-sdk/sdk.gen'
import { t } from '@/languages'

/** 后端 AuditLogListItem（审计日志列表项） */
export interface AuditLogItem {
  id: string
  /** 操作类型（AuditAction 枚举字符串值） */
  action: string
  resourceType: string
  /** 即 fileSystemNode.id（文件/文件夹/项目节点） */
  resourceId: string | null
  projectId: string | null
  /** 名称快照（记录时存，资源删除后仍可读） */
  resourceName: string | null
  /** 结构化参数（NODE_MOVE 带 oldParentId/newParentId 等） */
  params: Record<string, unknown> | null
  userId: string
  user: { id: string; email: string; username: string }
  success: boolean
  errorMessage: string | null
  createdAt: string
}

export interface AuditMember {
  id: string
  username: string
  nickname?: string
}

export type TimeGroup = 'today' | 'yesterday' | 'earlier'

const PAGE_SIZE = 20

/** 可定位节点的动作（节点仍存在，点击可跳转；FILE_DELETE 节点已删必 404，PC 同款排除） */
const LOCATABLE_ACTIONS = new Set([
  'FILE_CREATE',
  'FILE_UPDATE',
  'FILE_SHARE',
  'FOLDER_CREATE',
  'NODE_RENAME',
  'NODE_MOVE',
  'NODE_COPY',
  'NODE_RESTORE',
])

/** 操作短文案（对齐 PC ACTION_NAME_MAP 的项目操作子集） */
const ACTION_LABELS: Record<string, string> = {
  FILE_CREATE: t('新增图纸'),
  FILE_UPDATE: t('保存图纸'),
  FILE_DELETE: t('删除图纸'),
  FILE_SHARE: t('分享图纸'),
  FOLDER_CREATE: t('新建文件夹'),
  NODE_RENAME: t('重命名'),
  NODE_MOVE: t('移动'),
  NODE_COPY: t('复制'),
  NODE_RESTORE: t('恢复'),
  ADD_MEMBER: t('添加成员'),
  UPDATE_MEMBER: t('修改成员角色'),
  REMOVE_MEMBER: t('移除成员'),
  TRANSFER_OWNERSHIP: t('转移所有权'),
  PROJECT_CREATE: t('创建项目'),
  PROJECT_UPDATE: t('修改项目'),
  PROJECT_DELETE: t('删除项目'),
  PROJECT_TRANSFER: t('转移项目'),
  ROLE_CREATE: t('新建角色'),
  ROLE_UPDATE: t('修改角色'),
  ROLE_DELETE: t('删除角色'),
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

export function isLocatable(log: AuditLogItem): boolean {
  return !!log.resourceId && LOCATABLE_ACTIONS.has(log.action)
}

export function useProjectAuditLog(getProjectId: () => string) {
  const logs = ref<AuditLogItem[]>([])
  const loading = ref(false)
  const error = ref('')
  const page = ref(1)
  const totalPages = ref(1)
  const total = ref(0)
  const search = ref('')
  const actionFilter = ref('') // 逗号分隔多值
  const memberFilter = ref('') // userId
  const members = ref<AuditMember[]>([])

  const hasMore = computed(() => page.value < totalPages.value)

  function buildQuery(p: number) {
    const q: Record<string, string> = { page: String(p), limit: String(PAGE_SIZE) }
    if (search.value.trim()) q.search = search.value.trim()
    if (actionFilter.value) q.action = actionFilter.value
    if (memberFilter.value) q.userId = memberFilter.value
    return q
  }

  async function loadLogs(reset = false): Promise<void> {
    const projectId = getProjectId()
    if (!projectId) return
    if (reset) page.value = 1
    loading.value = true
    error.value = ''
    try {
      const res = await projectAuditLogControllerFindByProject({
        path: { projectId },
        query: buildQuery(page.value),
      })
      if (res.error) throw new Error(String(res.error))
      const data = (res.data ?? {}) as {
        logs?: AuditLogItem[]
        total?: number
        page?: number
        totalPages?: number
      }
      const items = data.logs ?? []
      logs.value = page.value === 1 ? items : [...logs.value, ...items]
      total.value = data.total ?? 0
      totalPages.value = data.totalPages ?? 1
    } catch (e) {
      console.error('[useProjectAuditLog] loadLogs:', e)
      error.value = t('加载失败')
    } finally {
      loading.value = false
    }
  }

  async function loadMembers(): Promise<void> {
    const projectId = getProjectId()
    if (!projectId) return
    try {
      const res = await memberControllerGetProjectMembers({ path: { projectId } })
      if (res.error) return
      const raw = (res.data ?? []) as AuditMember[]
      members.value = Array.isArray(raw) ? raw : []
    } catch {
      members.value = []
    }
  }

  function loadMore() {
    if (loading.value || page.value >= totalPages.value) return
    page.value++
    loadLogs()
  }

  // ── 按天分组（今天/昨天/更早，与 PC 一致）──
  function startOfToday(): number {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  }

  function timeGroup(createdAt: string): TimeGroup {
    const ts = new Date(createdAt).getTime()
    const todayStart = startOfToday()
    if (Number.isNaN(ts)) return 'earlier'
    if (ts >= todayStart) return 'today'
    if (ts >= todayStart - 86400000) return 'yesterday'
    return 'earlier'
  }

  const grouped = computed<Array<{ group: TimeGroup; label: string; items: AuditLogItem[] }>>(() => {
    const buckets: Record<TimeGroup, AuditLogItem[]> = { today: [], yesterday: [], earlier: [] }
    for (const log of logs.value) buckets[timeGroup(log.createdAt)].push(log)
    const labels: Record<TimeGroup, string> = {
      today: t('今天'),
      yesterday: t('昨天'),
      earlier: t('更早'),
    }
    return (['today', 'yesterday', 'earlier'] as TimeGroup[])
      .filter((g) => buckets[g].length > 0)
      .map((g) => ({ group: g, label: labels[g], items: buckets[g] }))
  })

  return {
    logs, loading, error, total, hasMore,
    search, actionFilter, memberFilter, members,
    grouped,
    loadLogs, loadMembers, loadMore,
  }
}
