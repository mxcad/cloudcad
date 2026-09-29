import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useProjectAuditLog, actionLabel, isLocatable, type AuditLogItem } from './useProjectAuditLog'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  projectAuditLogControllerFindByProject: vi.fn(),
  memberControllerGetProjectMembers: vi.fn(),
}))
vi.mock('@/languages', () => ({
  t: (key: string, params?: Record<string, string>) => {
    let out = key
    if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(v)
    return out
  },
}))

import {
  projectAuditLogControllerFindByProject,
  memberControllerGetProjectMembers,
} from '@cloudcad/api-sdk/sdk.gen'

function resolveWith<T extends (...args: never[]) => unknown>(fn: T, response: unknown) {
  vi.mocked(fn).mockResolvedValue(response as never)
}

function logItem(over: Partial<AuditLogItem> & { createdAt: string }): AuditLogItem {
  return {
    id: over.id ?? 'log-1',
    action: over.action ?? 'FILE_CREATE',
    resourceType: over.resourceType ?? 'FILE',
    resourceId: over.resourceId ?? null,
    projectId: 'proj-1',
    resourceName: over.resourceName ?? '图纸1.mxweb',
    params: null,
    userId: 'u-1',
    user: { id: 'u-1', email: 'a@b.c', username: '张三' },
    success: true,
    errorMessage: null,
    ...over,
  }
}

const DAY = 86400000

describe('useProjectAuditLog 项目操作历史（二期 b）', () => {
  let errorSpy: { mockRestore: () => void }

  beforeEach(() => {
    vi.clearAllMocks()
    resolveWith(projectAuditLogControllerFindByProject, { data: { logs: [], total: 0, page: 1, totalPages: 1 } })
    resolveWith(memberControllerGetProjectMembers, { data: [] })
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('actionLabel：已知动作给中文短文案，未知动作回退原值', () => {
    expect(actionLabel('FILE_CREATE')).toBe('新增图纸')
    expect(actionLabel('NODE_MOVE')).toBe('移动')
    expect(actionLabel('SOME_NEW_ACTION')).toBe('SOME_NEW_ACTION')
  })

  it('isLocatable：可定位动作且有 resourceId 才为真；FILE_DELETE 恒假（节点已删）', () => {
    expect(isLocatable(logItem({ action: 'NODE_MOVE', resourceId: 'n-1', createdAt: '' }))).toBe(true)
    expect(isLocatable(logItem({ action: 'FILE_CREATE', resourceId: 'n-2', createdAt: '' }))).toBe(true)
    // FILE_DELETE 不在可定位集合
    expect(isLocatable(logItem({ action: 'FILE_DELETE', resourceId: 'n-3', createdAt: '' }))).toBe(false)
    // 无 resourceId（成员类操作）
    expect(isLocatable(logItem({ action: 'ADD_MEMBER', resourceId: null, createdAt: '' }))).toBe(false)
  })

  it('loadLogs：响应解析进 logs/total/totalPages，query 带 page/limit', async () => {
    const now = new Date()
    resolveWith(projectAuditLogControllerFindByProject, {
      data: {
        logs: [logItem({ id: 'l1', createdAt: now.toISOString() })],
        total: 21,
        page: 1,
        totalPages: 2,
      },
    })
    const c = useProjectAuditLog(() => 'proj-1')
    await c.loadLogs()
    expect(c.logs.value).toHaveLength(1)
    expect(c.total.value).toBe(21)
    expect(c.hasMore.value).toBe(true)
    expect(vi.mocked(projectAuditLogControllerFindByProject)).toHaveBeenCalledWith({
      path: { projectId: 'proj-1' },
      query: expect.objectContaining({ page: '1', limit: '20' }),
    })
  })

  it('loadMore：翻页追加（不覆盖第一页）', async () => {
    const now = new Date()
    resolveWith(projectAuditLogControllerFindByProject, {
      data: {
        logs: [logItem({ id: 'l1', createdAt: now.toISOString() })],
        total: 2,
        page: 1,
        totalPages: 2,
      },
    })
    const c = useProjectAuditLog(() => 'proj-1')
    await c.loadLogs()
    vi.mocked(projectAuditLogControllerFindByProject).mockResolvedValueOnce({
      data: {
        logs: [logItem({ id: 'l2', createdAt: now.toISOString() })],
        total: 2,
        page: 2,
        totalPages: 2,
      },
    } as never)
    c.loadMore()
    await vi.waitFor(() => expect(c.logs.value).toHaveLength(2))
    expect(c.hasMore.value).toBe(false)
    const lastCall = vi.mocked(projectAuditLogControllerFindByProject).mock.calls.at(-1)?.[0] as {
      query: Record<string, string>
    }
    expect(lastCall.query.page).toBe('2')
  })

  it('筛选参数：search/actionFilter/memberFilter 进 query（空值不带键）', async () => {
    const c = useProjectAuditLog(() => 'proj-1')
    await c.loadLogs()
    const firstCall = vi.mocked(projectAuditLogControllerFindByProject).mock.calls.at(-1)?.[0] as {
      query: Record<string, string>
    }
    expect(firstCall.query.search).toBeUndefined()
    expect(firstCall.query.action).toBeUndefined()
    expect(firstCall.query.userId).toBeUndefined()

    c.search.value = ' 图纸 '
    c.actionFilter.value = 'FILE_CREATE,NODE_MOVE'
    c.memberFilter.value = 'u-9'
    await c.loadLogs(true)
    const lastCall = vi.mocked(projectAuditLogControllerFindByProject).mock.calls.at(-1)?.[0] as {
      query: Record<string, string>
    }
    expect(lastCall.query).toMatchObject({ search: '图纸', action: 'FILE_CREATE,NODE_MOVE', userId: 'u-9' })
  })

  it('grouped：今天/昨天/更早三桶分组，空桶省略，标签中文', async () => {
    const now = new Date()
    resolveWith(projectAuditLogControllerFindByProject, {
      data: {
        logs: [
          logItem({ id: 'today-1', action: 'FILE_CREATE', createdAt: now.toISOString() }),
          logItem({ id: 'today-2', action: 'NODE_MOVE', resourceId: 'n-1', createdAt: now.toISOString() }),
          logItem({ id: 'yest-1', action: 'FILE_UPDATE', createdAt: new Date(now.getTime() - DAY).toISOString() }),
          logItem({ id: 'earlier-1', action: 'NODE_COPY', createdAt: new Date(now.getTime() - 3 * DAY).toISOString() }),
        ],
        total: 4,
        page: 1,
        totalPages: 1,
      },
    })
    const c = useProjectAuditLog(() => 'proj-1')
    await c.loadLogs()
    expect(c.grouped.value).toHaveLength(3)
    expect(c.grouped.value.map((g) => g.label)).toEqual(['今天', '昨天', '更早'])
    expect(c.grouped.value[0].items.map((i) => i.id)).toEqual(['today-1', 'today-2'])
    expect(c.grouped.value[1].items).toHaveLength(1)
    expect(c.grouped.value[2].items[0].id).toBe('earlier-1')
  })

  it('grouped：无日志时分组为空数组', async () => {
    const c = useProjectAuditLog(() => 'proj-1')
    await c.loadLogs()
    expect(c.grouped.value).toEqual([])
  })

  it('loadMembers：成员列表进 members（供成员筛选下拉）', async () => {
    resolveWith(memberControllerGetProjectMembers, {
      data: [
        { id: 'u-1', username: '张三' },
        { id: 'u-2', username: '李四', nickname: '小李' },
      ],
    })
    const c = useProjectAuditLog(() => 'proj-1')
    await c.loadMembers()
    expect(c.members.value).toHaveLength(2)
    expect(c.members.value[1].nickname).toBe('小李')
  })

  it('loadLogs 失败：error 置「加载失败」', async () => {
    vi.mocked(projectAuditLogControllerFindByProject).mockResolvedValueOnce({ error: 'boom' } as never)
    const c = useProjectAuditLog(() => 'proj-1')
    await c.loadLogs()
    expect(c.error.value).toBe('加载失败')
    expect(c.logs.value).toEqual([])
  })
})
