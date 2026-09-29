import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useProjectActions } from './useProjectActions'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  projectControllerUpdateProject: vi.fn(),
  projectControllerDeleteProject: vi.fn(),
}))
vi.mock('vant', () => ({
  showLoadingToast: vi.fn(),
  closeToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showFailToast: vi.fn(),
  showDialog: vi.fn(),
}))
vi.mock('@/languages', () => ({
  t: (key: string, params?: Record<string, string>) => {
    let out = key
    if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(v)
    return out
  },
}))
vi.mock('@/utils/apiError', () => ({
  errorKind: vi.fn(() => 'unknown'),
  errMsg: vi.fn((e: unknown, fallback: string) => {
    if (typeof e === 'string') return e
    const m = (e as { message?: unknown })?.message
    return typeof m === 'string' && m ? m : fallback
  }),
}))

import { projectControllerUpdateProject, projectControllerDeleteProject } from '@cloudcad/api-sdk/sdk.gen'
import { showSuccessToast, showFailToast, showDialog } from 'vant'
import { errorKind } from '@/utils/apiError'

const PROJECT_ID = 'proj-1'

function resolveWith<T extends (...args: never[]) => unknown>(fn: T, response: unknown) {
  vi.mocked(fn).mockResolvedValue(response as never)
}

function setup() {
  const refresh = vi.fn(async () => undefined)
  const c = useProjectActions(refresh)
  return { c, refresh }
}

describe('useProjectActions 项目操作', () => {
  let warnSpy: { mockRestore: () => void }
  beforeEach(() => {
    vi.clearAllMocks()
    resolveWith(projectControllerUpdateProject, { data: {} })
    resolveWith(projectControllerDeleteProject, { data: {} })
    // showDialog 默认确认（resolve）；取消用例单独 override 为 reject
    vi.mocked(showDialog).mockResolvedValue(undefined as never)
    warnSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('rename 成功：PATCH 只传 name + 成功文案 + 刷新', async () => {
    const { c, refresh } = setup()
    await c.rename(PROJECT_ID, '新项目')
    expect(vi.mocked(projectControllerUpdateProject)).toHaveBeenCalledWith({
      path: { projectId: PROJECT_ID },
      body: { name: '新项目' },
    })
    expect(vi.mocked(showSuccessToast)).toHaveBeenCalledWith('重命名成功')
    expect(refresh).toHaveBeenCalled()
  })

  it('rename 空名称：不调 API，提示名称错误', async () => {
    const { c, refresh } = setup()
    await c.rename(PROJECT_ID, '')
    expect(vi.mocked(projectControllerUpdateProject)).not.toHaveBeenCalled()
    expect(vi.mocked(showFailToast)).toHaveBeenCalledWith('名称不能为空')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('rename 非法字符：不调 API', async () => {
    const { c } = setup()
    await c.rename(PROJECT_ID, 'a/b')
    expect(vi.mocked(projectControllerUpdateProject)).not.toHaveBeenCalled()
    expect(vi.mocked(showFailToast)).toHaveBeenCalled()
  })

  it('rename 403：显示权限错误文案，不刷新', async () => {
    vi.mocked(errorKind).mockReturnValue('forbidden')
    vi.mocked(projectControllerUpdateProject).mockRejectedValue(new Error('no perm'))
    const { c, refresh } = setup()
    await c.rename(PROJECT_ID, '新项目')
    expect(vi.mocked(showFailToast)).toHaveBeenCalledWith('没有执行此操作的权限')
    expect(vi.mocked(showSuccessToast)).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('remove 确认：软删 permanently=false + 成功文案 + 刷新', async () => {
    const { c, refresh } = setup()
    await c.remove(PROJECT_ID, '旧项目')
    expect(vi.mocked(showDialog)).toHaveBeenCalledWith(expect.objectContaining({ showCancelButton: true }))
    expect(vi.mocked(projectControllerDeleteProject)).toHaveBeenCalledWith({
      path: { projectId: PROJECT_ID },
      query: { permanently: false },
    })
    expect(vi.mocked(showSuccessToast)).toHaveBeenCalledWith('删除成功')
    expect(refresh).toHaveBeenCalled()
  })

  it('remove 取消：不调 API，不刷新', async () => {
    vi.mocked(showDialog).mockRejectedValue(new Error('cancel'))
    const { c, refresh } = setup()
    await c.remove(PROJECT_ID, '旧项目')
    expect(vi.mocked(projectControllerDeleteProject)).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('remove 403：显示权限错误文案，不刷新', async () => {
    vi.mocked(errorKind).mockReturnValue('forbidden')
    vi.mocked(projectControllerDeleteProject).mockRejectedValue(new Error('no perm'))
    const { c, refresh } = setup()
    await c.remove(PROJECT_ID, '旧项目')
    expect(vi.mocked(showFailToast)).toHaveBeenCalledWith('没有执行此操作的权限')
    expect(vi.mocked(showSuccessToast)).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
