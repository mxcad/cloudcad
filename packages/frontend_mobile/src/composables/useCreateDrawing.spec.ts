/**
 * useCreateDrawing：新建图纸 + 内聚「撤销=彻底删除新节点」回滚。
 *
 * 回归点：
 * - 创建成功 → 挂撤销到 undo 栈，回滚闭包彻底删除新建节点并刷新列表；
 * - 创建失败 / 响应无 id → 不挂撤销（对齐 PC：无 createdId 不入撤销栈）；
 * - 目标文件夹未就绪 → 不发起创建请求。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCreateDrawing } from './useCreateDrawing'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  nodeControllerCreateDrawing: vi.fn(),
  nodeControllerDeleteNode: vi.fn(),
}))
vi.mock('vant', () => ({
  showToast: vi.fn(),
  showLoadingToast: vi.fn(),
  closeToast: vi.fn(),
  showFailToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))
vi.mock('@/languages', () => ({
  t: (key: string) => key,
}))
vi.mock('@/utils/validateName', () => ({
  validateName: (name: string) => ({ valid: name.length > 0, error: null }),
}))

import {
  nodeControllerCreateDrawing,
  nodeControllerDeleteNode,
} from '@cloudcad/api-sdk/sdk.gen'

const mockedCreate = nodeControllerCreateDrawing as ReturnType<typeof vi.fn>
const mockedDelete = nodeControllerDeleteNode as ReturnType<typeof vi.fn>

/** 最小 undo 桩：只关心 trackUndo 是否被调用、回滚闭包做什么 */
function makeUndo() {
  return { trackUndo: vi.fn() }
}

describe('useCreateDrawing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('创建成功：挂撤销，回滚彻底删除新建节点并刷新', async () => {
    mockedCreate.mockResolvedValue({ data: { id: 'new-1' }, error: null })
    const undo = makeUndo()
    const refresh = vi.fn()
    const { onCreateDrawingConfirm } = useCreateDrawing(() => 'parent-1', refresh, undo as never)
    await onCreateDrawingConfirm()
    expect(mockedCreate).toHaveBeenCalledWith({ body: { parentId: 'parent-1', name: undefined } })
    expect(undo.trackUndo).toHaveBeenCalledTimes(1)

    // 执行回滚闭包：应彻底删除新建节点并刷新列表
    mockedDelete.mockResolvedValue({ data: {}, error: null })
    const rollback = undo.trackUndo.mock.calls[0][1] as () => Promise<void>
    await rollback()
    expect(mockedDelete).toHaveBeenCalledWith({ path: { nodeId: 'new-1' }, query: { permanently: true } })
    expect(refresh).toHaveBeenCalled()
  })

  it('创建失败：不挂撤销', async () => {
    mockedCreate.mockResolvedValue({ data: null, error: 'boom' })
    const undo = makeUndo()
    const { onCreateDrawingConfirm } = useCreateDrawing(() => 'parent-1', vi.fn(), undo as never)
    await onCreateDrawingConfirm()
    expect(undo.trackUndo).not.toHaveBeenCalled()
  })

  it('响应无 id：不挂撤销（对齐 PC 无 createdId 不入栈）', async () => {
    mockedCreate.mockResolvedValue({ data: {}, error: null })
    const undo = makeUndo()
    const { onCreateDrawingConfirm } = useCreateDrawing(() => 'parent-1', vi.fn(), undo as never)
    await onCreateDrawingConfirm()
    expect(undo.trackUndo).not.toHaveBeenCalled()
  })

  it('目标文件夹未就绪：不发起创建请求', async () => {
    const undo = makeUndo()
    const { onCreateDrawingConfirm } = useCreateDrawing(() => null, vi.fn(), undo as never)
    await onCreateDrawingConfirm()
    expect(mockedCreate).not.toHaveBeenCalled()
    expect(undo.trackUndo).not.toHaveBeenCalled()
  })
})
