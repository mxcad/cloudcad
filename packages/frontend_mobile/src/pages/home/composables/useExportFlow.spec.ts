/**
 * useExportFlow：编辑器导出意图（评审候选 5，从 home/index.vue 巨缝抽出）。
 *
 * 回归点：
 * - exportAllowed 闸门 = VIP 或 freeExportDownloadEnabled 开放（isExportDownloadAllowedFor 单点）；
 * - 菜单 exportDialogTrigger 触发 → showExportFormat 打开；
 * - mxweb 源格式不走会员门控直接导出；其他格式先过闸门；
 * - 闸门未过 → beginIntent(exportChainDef(payload)) 挂起意图链、关弹窗、不发导出；
 * - 闸门翻转放行且图纸未打开中 → resumeIntent 续跑挂起链。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

// exportDialogTrigger 必须是真实 ref 才能被 watch 订阅；经 mock 暴露触发器供测试
vi.mock('../hooks/useMenu', async () => {
  const { ref } = await import('vue')
  const exportDialogTrigger = ref(false)
  return {
    exportDialogTrigger,
    __triggerExportDialog: () => {
      exportDialogTrigger.value = true
    },
  }
})
vi.mock('../../../services/exportService', () => ({
  exportDrawing: vi.fn(),
}))
vi.mock('../../../services/permissionService', () => ({
  isExportDownloadAllowedFor: vi.fn(),
}))
vi.mock('../../../services/intentChain', () => ({
  beginIntent: vi.fn(),
  exportChainDef: vi.fn((payload: unknown) => ({ kind: 'export', payload })),
  resumeIntent: vi.fn(),
}))

import { useExportFlow } from './useExportFlow'
import { exportDrawing } from '../../../services/exportService'
import { isExportDownloadAllowedFor } from '../../../services/permissionService'
import {
  beginIntent,
  exportChainDef,
  resumeIntent,
} from '../../../services/intentChain'
import * as useMenuModule from '../hooks/useMenu'
// vi.mock 已把 useMenu 换成含 __triggerExportDialog 的替身；真实模块类型上没有该成员，
// 经 unknown 断言以通过 vue-tsc（运行时由 mock 提供）
const __triggerExportDialog = (
  useMenuModule as unknown as { __triggerExportDialog: () => void }
).__triggerExportDialog

const mockExportDrawing = exportDrawing as ReturnType<typeof vi.fn>
const mockIsAllowed = isExportDownloadAllowedFor as ReturnType<typeof vi.fn>
const mockBeginIntent = beginIntent as ReturnType<typeof vi.fn>
const mockExportChainDef = exportChainDef as ReturnType<typeof vi.fn>
const mockResumeIntent = resumeIntent as ReturnType<typeof vi.fn>

function makeOpts() {
  return {
    user: ref<unknown>(null),
    runtimeConfig: ref<{ freeExportDownloadEnabled?: boolean }>({
      freeExportDownloadEnabled: false,
    }),
    editorState: { state: { loading: false } },
  }
}

const pdfPayload = {
  format: 'pdf' as const,
  pdfOptions: { width: '2000', height: '2000', colorPolicy: 'mono' as const },
}
const dwgPayload = { format: 'dwg' as const, dwgOptions: { dwgVersion: 23 } }

describe('useExportFlow（编辑器导出意图）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAllowed.mockReturnValue(false)
  })

  it('exportAllowed = isExportDownloadAllowedFor(user, freeExportDownloadEnabled)', () => {
    mockIsAllowed.mockReturnValue(true)
    const { exportAllowed } = useExportFlow(makeOpts())
    expect(exportAllowed.value).toBe(true)
    expect(mockIsAllowed).toHaveBeenCalledWith(null, false)
  })

  it('菜单触发 exportDialogTrigger → 打开格式弹窗', async () => {
    const { showExportFormat } = useExportFlow(makeOpts())
    expect(showExportFormat.value).toBe(false)
    __triggerExportDialog()
    await nextTick()
    expect(showExportFormat.value).toBe(true)
  })

  it('mxweb 源格式：不走会员门控，直接导出', async () => {
    const { onExportFormatConfirm, exportFormatLoading } =
      useExportFlow(makeOpts())
    // watch(exportAllowed) 创建时求值一次建立旧值，属正常副作用；清掉隔离确认时调用
    mockIsAllowed.mockClear()
    await onExportFormatConfirm({ format: 'mxweb' })
    expect(mockIsAllowed).not.toHaveBeenCalled()
    expect(mockExportDrawing).toHaveBeenCalledWith('mxweb', undefined, undefined, undefined)
    expect(exportFormatLoading.value).toBe(false)
  })

  it('其他格式 + 闸门放行：导出并传格式参数', async () => {
    mockIsAllowed.mockReturnValue(true)
    const { onExportFormatConfirm } = useExportFlow(makeOpts())
    await onExportFormatConfirm(pdfPayload)
    expect(mockExportDrawing).toHaveBeenCalledWith(
      'pdf',
      undefined,
      pdfPayload.pdfOptions,
      undefined,
    )
  })

  it('其他格式 + 闸门未过：挂起意图链、关弹窗、不发导出', async () => {
    const { onExportFormatConfirm, showExportFormat } =
      useExportFlow(makeOpts())
    await onExportFormatConfirm(dwgPayload)
    expect(mockExportDrawing).not.toHaveBeenCalled()
    expect(mockExportChainDef).toHaveBeenCalledWith(dwgPayload)
    expect(mockBeginIntent).toHaveBeenCalledWith(mockExportChainDef(dwgPayload))
    expect(showExportFormat.value).toBe(false)
  })

  it('闸门翻转放行且图纸未打开中 → resumeIntent 续跑挂起链', async () => {
    let allowed = false
    mockIsAllowed.mockImplementation(() => allowed)
    const opts = makeOpts()
    const { exportAllowed } = useExportFlow(opts)
    expect(exportAllowed.value).toBe(false)
    allowed = true
    opts.user.value = { isVip: true }
    await nextTick()
    expect(mockResumeIntent).toHaveBeenCalled()
  })

  it('图纸打开中（loading）闸门放行不续跑', async () => {
    let allowed = false
    mockIsAllowed.mockImplementation(() => allowed)
    const opts = makeOpts()
    opts.editorState.state.loading = true
    useExportFlow(opts)
    allowed = true
    opts.user.value = { isVip: true }
    await nextTick()
    expect(mockResumeIntent).not.toHaveBeenCalled()
  })
})
