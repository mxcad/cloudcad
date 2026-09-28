import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseWechatResult, useWechatAccount } from './useWechatAccount'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  authControllerGetWechatAuthUrl: vi.fn(),
  authControllerBindWechat: vi.fn(),
  authControllerUnbindWechat: vi.fn(),
}))
// useWechatLogin 依赖链带 vant（CSS 导入 vitest 不处理）；本 composable 只用其纯函数 hashRouterOrigin
vi.mock('@/composables/useWechatLogin', () => ({
  hashRouterOrigin: () => 'http://localhost:3000/#',
}))

import {
  authControllerGetWechatAuthUrl,
  authControllerBindWechat,
  authControllerUnbindWechat,
} from '@cloudcad/api-sdk/sdk.gen'

function resolveWith<T extends (...args: never[]) => unknown>(fn: T, response: unknown) {
  vi.mocked(fn).mockResolvedValue(response as never)
}

function encodeResult(data: Record<string, unknown>): string {
  return `#wechat_result=${encodeURIComponent(JSON.stringify(data))}`
}

describe('parseWechatResult 微信授权回调 hash 解析', () => {
  it('bind 回调 → 解析出 purpose/code/state', () => {
    const hash = encodeResult({ code: 'c1', state: 's1', purpose: 'bind', isPopup: false })
    expect(parseWechatResult(hash)).toEqual({ purpose: 'bind', code: 'c1', state: 's1' })
  })

  it('deactivate 回调 → 解析出 purpose/code/state', () => {
    const hash = encodeResult({ code: 'c2', state: 's2', purpose: 'deactivate', isPopup: false })
    expect(parseWechatResult(hash)).toEqual({ purpose: 'deactivate', code: 'c2', state: 's2' })
  })

  it('无 wechat_result → null', () => {
    expect(parseWechatResult('')).toBeNull()
    expect(parseWechatResult('#other=x')).toBeNull()
  })

  it('JSON 损坏 → null', () => {
    expect(parseWechatResult('#wechat_result=%7Bbroken')).toBeNull()
  })

  it('purpose 非 bind/deactivate → null', () => {
    expect(parseWechatResult(encodeResult({ code: 'c', state: 's', purpose: 'login' }))).toBeNull()
  })

  it('缺 code 或 state → null', () => {
    expect(parseWechatResult(encodeResult({ state: 's', purpose: 'bind' }))).toBeNull()
    expect(parseWechatResult(encodeResult({ code: 'c', purpose: 'bind' }))).toBeNull()
  })
})

describe('useWechatAccount.openAuth 微信授权整页跳转', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('拉授权链接并整页跳转（client=mobile、purpose 透传）', async () => {
    resolveWith(authControllerGetWechatAuthUrl, { data: { authUrl: 'https://wechat/auth?x=1' } })
    const { openAuth } = useWechatAccount()
    await openAuth('deactivate')
    expect(vi.mocked(authControllerGetWechatAuthUrl)).toHaveBeenCalledTimes(1)
    const query = vi.mocked(authControllerGetWechatAuthUrl).mock.calls[0][0].query
    expect(query.purpose).toBe('deactivate')
    expect(query.client).toBe('mobile')
    expect(query.isPopup).toBe('false')
    expect(window.location.href).toBe('https://wechat/auth?x=1')
  })

  it('res.error → 抛错不跳转', async () => {
    resolveWith(authControllerGetWechatAuthUrl, { error: { code: 'INTERNAL', message: 'boom' } })
    const { openAuth } = useWechatAccount()
    await expect(openAuth('bind')).rejects.toThrow()
  })

  it('无 authUrl → 抛错', async () => {
    resolveWith(authControllerGetWechatAuthUrl, { data: {} })
    const { openAuth } = useWechatAccount()
    await expect(openAuth('bind')).rejects.toThrow('获取授权链接失败')
  })
})

describe('useWechatAccount.bindWechat 绑定微信', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('成功 → body 带 code/state、不带 takeover', async () => {
    resolveWith(authControllerBindWechat, { data: { success: true, message: 'ok' } })
    const { bindWechat } = useWechatAccount()
    await bindWechat('c1', 's1')
    expect(vi.mocked(authControllerBindWechat).mock.calls[0][0].body).toEqual({ code: 'c1', state: 's1' })
  })

  it('takeover=true → body 带 takeover', async () => {
    resolveWith(authControllerBindWechat, { data: { success: true, message: 'ok' } })
    const { bindWechat } = useWechatAccount()
    await bindWechat('c1', 's1', true)
    expect(vi.mocked(authControllerBindWechat).mock.calls[0][0].body).toEqual({
      code: 'c1',
      state: 's1',
      takeover: true,
    })
  })

  it('res.error（409 CONFLICT）→ 抛错保留 code', async () => {
    resolveWith(authControllerBindWechat, {
      error: { code: 'CONFLICT', message: '该微信已绑定其他账号' },
    })
    const { bindWechat } = useWechatAccount()
    await expect(bindWechat('c1', 's1')).rejects.toThrow('该微信已绑定其他账号')
  })

  it('data.success=false → 抛错带 message', async () => {
    resolveWith(authControllerBindWechat, { data: { success: false, message: '绑定失败' } })
    const { bindWechat } = useWechatAccount()
    await expect(bindWechat('c1', 's1')).rejects.toThrow('绑定失败')
  })
})

describe('useWechatAccount.unbindWechat 解绑微信', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('成功 → 不抛错', async () => {
    resolveWith(authControllerUnbindWechat, { data: { success: true, message: 'ok' } })
    const { unbindWechat } = useWechatAccount()
    await expect(unbindWechat()).resolves.toBeUndefined()
    expect(vi.mocked(authControllerUnbindWechat)).toHaveBeenCalledTimes(1)
  })

  it('res.error（如账号无其他登录方式）→ 抛错', async () => {
    resolveWith(authControllerUnbindWechat, {
      error: { code: 'BAD_REQUEST', message: '至少需要保留一种登录方式' },
    })
    const { unbindWechat } = useWechatAccount()
    await expect(unbindWechat()).rejects.toThrow('至少需要保留一种登录方式')
  })
})
