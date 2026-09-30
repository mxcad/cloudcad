import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useStorage } from '@vueuse/core'

// 只测「浏览文件」这一条链路（openFile），不驱动插入交互本身：交互部分依赖引擎
// 的交互点对象，属另一层。
//
// 回归点：.dwg/.dxf 选完就拼 access URL 会让引擎 404——access 端点按 hash 找
// mxweb，服务端转换未落盘时直接 404，引擎只报「图块加载失败」（无进度无重试），
// 所以必须先拿到转换终态再拼 URL。
let mockPickerCallback: ((param: unknown) => unknown) | null = null

vi.mock('vant', () => ({
  showToast: vi.fn(),
  showLoadingToast: vi.fn(),
  closeToast: vi.fn(),
  showConfirmDialog: vi.fn(),
  showFailToast: vi.fn(),
}))
vi.mock('mxcad', () => ({
  MxCpp: {
    getCurrentMxCAD: vi.fn(() => ({
      getDatabase: () => ({
        getBlockTable: () => ({
          getAllRecordId: () => [],
          get: () => ({ isValid: () => false }),
        }),
      }),
    })),
  },
  McDbBlockReference: vi.fn(),
  MxCADUiPrPoint: vi.fn(),
  McGePoint3d: vi.fn(),
  McGeLongArray: vi.fn(),
  McDbAttribute: vi.fn(),
  McDbAttributeDefinition: vi.fn(),
}))
vi.mock('mxdraw', () => ({
  MxType: { InputToucheType: { kGetEnd: 0 } },
}))
vi.mock('@vueuse/core', () => ({
  useStorage: vi.fn(),
}))
vi.mock('@/languages', () => ({
  t: (s: string) => s,
}))
vi.mock('@/composables/useNativeFilePicker', () => ({
  showFilePicker: (cb: (param: unknown) => unknown) => {
    mockPickerCallback = cb
  },
}))
vi.mock('@/services/publicFileService', () => ({
  buildPublicMxwebUrl: vi.fn(
    (hash: string) => `/api/v1/public-file/access/${hash}.mxweb?t=1`
  ),
}))
vi.mock('@/services/conversionStream', () => ({
  waitPublicConversion: vi.fn(async () => 'COMPLETED' as const),
  CONVERSION_WAIT_TIMEOUT_MS: 300000,
}))

import { useInsertBlock, currentItem } from './useInsertBlock'
import { showLoadingToast, closeToast, showFailToast } from 'vant'
import { buildPublicMxwebUrl } from '@/services/publicFileService'
import { waitPublicConversion } from '@/services/conversionStream'

function pick(params: Record<string, unknown> = {}) {
  if (!mockPickerCallback) throw new Error('showFilePicker 未被调用')
  return mockPickerCallback({
    hash: 'ab12cd34ef56',
    type: 'dwg',
    ext: 'dwg',
    name: '图块.dwg',
    size: 1024,
    file: { name: '图块.dwg', source: new File(['x'], '图块.dwg') },
    isUseServerExistingFile: false,
    ...params,
  })
}

async function openAndPick(params: Record<string, unknown> = {}) {
  const p = useInsertBlock()
  const done = p.openFile()
  await pick(params)
  await done
  return p
}

describe('useInsertBlock.openFile 浏览文件', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPickerCallback = null
    // currentItem 是模块级共享 ref，跨用例残留会污染断言
    currentItem.value = undefined
    // 被测代码只读 .value，不需要真 Ref
    vi.mocked(useStorage).mockImplementation((_: string, v: unknown) =>
      ({ value: v } as never)
    )
    vi.mocked(waitPublicConversion).mockResolvedValue('COMPLETED' as const)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('.dwg 先等转换终态、COMPLETED 才拼 access URL，不产生 blob URL', async () => {
    const started = vi.fn()
    vi.mocked(waitPublicConversion).mockImplementation(async () => {
      started()
      return 'COMPLETED'
    })
    const created = vi.spyOn(URL, 'createObjectURL')

    const p = await openAndPick()

    expect(started).toHaveBeenCalled()
    expect(waitPublicConversion).toHaveBeenCalledWith('ab12cd34ef56')
    expect(buildPublicMxwebUrl).toHaveBeenCalledWith('ab12cd34ef56')
    expect(p.list.value[0]?.filePath).toBe(
      '/api/v1/public-file/access/ab12cd34ef56.mxweb?t=1'
    )
    // 转换期间有等待提示，结束后关闭
    expect(showLoadingToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: '转换中', duration: 0 })
    )
    expect(closeToast).toHaveBeenCalled()
    // 源格式路径不触发
    expect(created).not.toHaveBeenCalled()
  })

  it('转换失败：提示失败、不加入块列表、但正常结束浏览流程', async () => {
    vi.mocked(waitPublicConversion).mockResolvedValue('FAILED' as const)

    const p = await openAndPick()

    expect(showFailToast).toHaveBeenCalledWith('转换失败')
    expect(p.list.value).toHaveLength(0)
    expect(p.currentItem.value).toBeUndefined()
    expect(buildPublicMxwebUrl).not.toHaveBeenCalled()
    expect(closeToast).toHaveBeenCalled()
  })

  it('.mxweb 是源格式：不等转换、不拼服务端 URL，以 blob URL 就地加入列表', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test/x')

    const p = await openAndPick({ type: 'mxweb', ext: 'mxweb', name: '图块.mxweb' })

    expect(waitPublicConversion).not.toHaveBeenCalled()
    expect(buildPublicMxwebUrl).not.toHaveBeenCalled()
    expect(p.list.value[0]).toEqual({
      name: '图块',
      filePath: 'blob:test/x',
      id: 'blob:test/x',
    })
  })

  it('块名剥离扩展名（含 .dxf 等多段扩展名不误剥）', async () => {
    const p = await openAndPick({ type: 'dxf', ext: 'dxf', name: 'a.b.dxf' })
    expect(p.list.value[0]?.name).toBe('a.b')
  })
})
