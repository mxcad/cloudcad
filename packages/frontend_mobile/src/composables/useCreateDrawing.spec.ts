/**
 * useCreateDrawing：新建图纸 + onCreated 撤销钩子。
 *
 * 回归点：
 * - 创建成功 → onCreated 回调新建节点 id（页面据此挂「撤销=彻底删除新节点」snackbar，对齐 PC）；
 * - 创建失败 / 响应无 id → 不回调（对齐 PC：无 createdId 不入撤销栈）；
 * - 目标文件夹未就绪 → 不发起创建请求。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCreateDrawing } from './useCreateDrawing'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  nodeControllerCreateDrawing: vi.fn(),
}))
vi.mock('vant', () => ({
  showToast: vi.fn(),
  showLoadingToast: vi.fn(),
  closeToast: vi.fn(),
  showFailToast: vi.fn(),
}))
vi.mock('@/languages', () => ({
  t: (key: string) => key,
}))
vi.mock('@/utils/validateName', () => ({
  validateName: (name: string) => ({ valid: name.length > 0, error: null }),
}))

import { nodeControllerCreateDrawing } from '@cloudcad/api-sdk/sdk.gen'

const mockedCreate = nodeControllerCreateDrawing as ReturnType<typeof vi.fn>

describe('useCreateDrawing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('创建成功：onCreated 回调新建节点 id', async () => {
    mockedCreate.mockResolvedValue({ data: { id: 'new-1' }, error: null })
    const onCreated = vi.fn()
    const { onCreateDrawingConfirm } = useCreateDrawing(() => 'parent-1', vi.fn(), onCreated)
    await onCreateDrawingConfirm()
    expect(mockedCreate).toHaveBeenCalledWith({ body: { parentId: 'parent-1', name: undefined } })
    expect(onCreated).toHaveBeenCalledWith('new-1')
  })

  it('创建失败：不回调 onCreated', async () => {
    mockedCreate.mockResolvedValue({ data: null, error: 'boom' })
    const onCreated = vi.fn()
    const { onCreateDrawingConfirm } = useCreateDrawing(() => 'parent-1', vi.fn(), onCreated)
    await onCreateDrawingConfirm()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('响应无 id：不回调 onCreated（对齐 PC 无 createdId 不入栈）', async () => {
    mockedCreate.mockResolvedValue({ data: {}, error: null })
    const onCreated = vi.fn()
    const { onCreateDrawingConfirm } = useCreateDrawing(() => 'parent-1', vi.fn(), onCreated)
    await onCreateDrawingConfirm()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('目标文件夹未就绪：不发起创建请求', async () => {
    const onCreated = vi.fn()
    const { onCreateDrawingConfirm } = useCreateDrawing(() => null, vi.fn(), onCreated)
    await onCreateDrawingConfirm()
    expect(mockedCreate).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })
})
