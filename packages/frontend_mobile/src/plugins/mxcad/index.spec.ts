import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * createMxCAD 引擎单例回归。
 *
 * 移动端曾把 new McObject + mxcad.create() 放在每次调用里、无任何守卫：
 * 组件重挂载 / HMR 模块重评估只要触发第二次调用，就会拉起第二份 WASM 引擎、
 * 重复加载 wasm 与 shx 字体（控制台里 MxCAD TryVersion / replace [*.shx]
 * 成对出现）。对齐 PC MxCADInstanceManager 的严格单例后，本组用例锁定
 * 「无论顺序调用、并发调用还是模块重评估，引擎只初始化一次」。
 */

let mcObjectCreateCount = 0
const mcObjectInstances: object[] = []

// vitest.config 把 mxcad 与 mxdraw 都 alias 到同一个 __mocks__/empty.ts，
// 两个 vi.mock 会打架（后者覆盖前者，mxcad 的 import 命中 mxdraw 的 mock）。
// 故合并为单一 mock，同时提供两个模块所需的具名导出。
vi.mock('mxcad', () => {
  class McObject {
    handlers: Record<string, Array<() => void>> = {}
    created = false
    constructor() {
      mcObjectCreateCount++
      mcObjectInstances.push(this)
    }
    on(event: string, cb: () => void) {
      ;(this.handlers[event] ||= []).push(cb)
    }
    create() {
      this.created = true
      // 异步派发 init_mxcad，确保监听器已注册（对齐真实引擎的事件时序）
      setTimeout(() => {
        ;(this.handlers['init_mxcad'] || []).forEach((cb) => cb())
      }, 0)
    }
    setAttribute() {}
  }
  return {
    // mxcad 的具名导出
    McObject,
    MxCpp: {
      getCurrentMxCAD: vi.fn(),
      App: { getCurrentMxCAD: vi.fn() },
    },
    // mxdraw 的具名导出（同文件，一并提供）
    MxFun: {
      getQueryString: vi.fn(() => null),
      setIniset: vi.fn(),
      addCommand: vi.fn(),
      sendStringToExecute: vi.fn(),
    },
    store: { state: { MxFun: null } },
  }
})

vi.mock('@/command/layer/currentLayerNameHistoryState', () => ({
  currentLayerNameHistoryState: { value: [] as unknown[] },
}))

vi.mock('@/utils/paramsFromUrl', () => ({
  getParamsFromUrl: vi.fn(() => ({})),
}))

vi.mock('./command', () => ({
  registerCommand: vi.fn(),
}))

vi.mock('./openMxWeb', () => ({
  openMxWeb: vi.fn(),
}))

vi.mock('@/languages', () => ({
  t: (s: string) => s,
}))

/** 重新求值被测模块（模拟 HMR 模块重评估：模块级单例归零，window 引用存活） */
async function loadModule() {
  vi.resetModules()
  return import('./index')
}

describe('createMxCAD — 引擎单例', () => {
  beforeEach(() => {
    mcObjectCreateCount = 0
    mcObjectInstances.length = 0
    delete (window as unknown as { __MxCAD_MOBILE__?: unknown }).__MxCAD_MOBILE__
  })

  it('顺序多次调用只初始化一次，返回同一实例', async () => {
    const { createMxCAD } = await loadModule()
    const a = await createMxCAD()
    const b = await createMxCAD()
    const c = await createMxCAD()
    expect(mcObjectCreateCount).toBe(1)
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('并发调用共享同一次初始化', async () => {
    const { createMxCAD } = await loadModule()
    const [a, b, c] = await Promise.all([
      createMxCAD(),
      createMxCAD(),
      createMxCAD(),
    ])
    expect(mcObjectCreateCount).toBe(1)
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('模块重评估后从 window 引用恢复，不重复 new McObject', async () => {
    const mod1 = await loadModule()
    const a = await mod1.createMxCAD()
    expect(mcObjectCreateCount).toBe(1)

    // 模拟 HMR：模块重评估，mxcadSingleton 归零，但 window.__MxCAD_MOBILE__ 仍在
    const mod2 = await loadModule()
    const b = await mod2.createMxCAD()

    expect(mcObjectCreateCount).toBe(1) // 没有第二次 new McObject
    expect(a).toBe(b) // 恢复的是同一实例
  })

  it('初始化只派发一次 registerCommand', async () => {
    const { createMxCAD } = await loadModule()
    // 须在 loadModule（resetModules）之后取，才能拿到 createMxCAD 所用的同一 mock 实例
    const { registerCommand } = await import('./command')
    // vi.mock 工厂只求值一次并被缓存，registerCommand 会累积前序用例的调用，先清空
    vi.mocked(registerCommand).mockClear()
    await createMxCAD()
    await createMxCAD()
    expect(registerCommand).toHaveBeenCalledTimes(1)
  })
})
