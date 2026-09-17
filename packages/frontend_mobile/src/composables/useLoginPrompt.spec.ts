/**
 * useLoginPrompt 未登录引导逻辑
 *
 * 覆盖：
 *  - guest 态（无 accessToken）→ 立即显示弹窗，不触发 onAuthenticated
 *  - 已登录态 → 不显示弹窗，立即触发 onAuthenticated（页面加载数据）
 *  - 过期的 accessToken（无 refreshToken）→ 视为未登录：显示弹窗（回归：stale token 401 死循环）
 *  - 过期的 accessToken（有 refreshToken）→ 静默触发刷新，不直接判已登录
 *  - open('register'/'login') → window.open 打开 PC 注册/登录页（带 redirect 回跳当前页）
 *  - 弹窗被拦截 → 回退当前标签导航 + 重置等待态
 *  - close() → 重置显示与等待态
 *
 * 注：storage 事件驱动的 guest→authenticated 态转换属 useAuthState 既有行为（组件 onMounted 注册监听），
 * 此处只测 useLoginPrompt 自身的立即判定与打开/关闭逻辑。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useLoginPrompt } from './useLoginPrompt'
import { authControllerRefreshToken } from '@cloudcad/api-sdk/sdk.gen'

// useAuthState.attemptRefresh 依赖该 SDK 函数；mock 掉避免真实网络请求
vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  authControllerRefreshToken: vi.fn(),
}))

function setToken(token: string | null) {
  if (token) {
    localStorage.setItem('accessToken', token)
  } else {
    localStorage.removeItem('accessToken')
  }
}

/** 构造一个 exp 已过去的 JWT（header.payload.sig），用于模拟过期 token */
function makeExpiredJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 3600 }))
  return `${header}.${payload}.sig`
}

describe('useLoginPrompt 未登录引导', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setToken(null)
  })

  it('guest 态立即显示弹窗，且不触发登录后回调', () => {
    setToken(null)
    const onAuthenticated = vi.fn()
    const { show, waiting, close } = useLoginPrompt(onAuthenticated)
    expect(show.value).toBe(true)
    expect(waiting.value).toBe(false)
    expect(onAuthenticated).not.toHaveBeenCalled()
    close()
    expect(show.value).toBe(false)
  })

  it('已登录态不显示弹窗，立即触发登录后回调（页面加载数据）', () => {
    setToken('test-token')
    const onAuthenticated = vi.fn()
    const { show, waiting } = useLoginPrompt(onAuthenticated)
    expect(show.value).toBe(false)
    expect(waiting.value).toBe(false)
    expect(onAuthenticated).toHaveBeenCalledTimes(1)
  })

  it('过期的 accessToken（无 refreshToken）视为未登录：显示弹窗且不触发登录后回调', () => {
    // 回归：stale token 曾被 initFromStorage 误判为 authenticated，导致 401 死循环
    localStorage.setItem('accessToken', makeExpiredJwt())
    const onAuthenticated = vi.fn()
    const { show } = useLoginPrompt(onAuthenticated)
    expect(show.value).toBe(true)
    expect(onAuthenticated).not.toHaveBeenCalled()
    // 陈旧 token 应被清除，避免下次仍被误判
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  it('open("register") 打开 PC 注册页（带 redirect 回跳当前页）', () => {
    setToken(null)
    vi.spyOn(window, 'open').mockReturnValue({} as unknown as Window)
    const { open, waiting } = useLoginPrompt(vi.fn())
    open('register')
    expect(waiting.value).toBe(true)
    const [url, name] = vi.mocked(window.open).mock.calls[0] as [string, string]
    expect(url).toContain('/register')
    expect(url).toContain(`redirect=${encodeURIComponent(window.location.href)}`)
    expect(name).toBe('pc-auth')
  })

  it('open("login") 打开 PC 登录页（带 redirect 回跳当前页）', () => {
    setToken(null)
    vi.spyOn(window, 'open').mockReturnValue({} as unknown as Window)
    const { open } = useLoginPrompt(vi.fn())
    open('login')
    const [url, name] = vi.mocked(window.open).mock.calls[0] as [string, string]
    expect(url).toContain('/login')
    expect(url).not.toContain('/register')
    expect(url).toContain(`redirect=${encodeURIComponent(window.location.href)}`)
    expect(name).toBe('pc-auth')
  })

  it('弹窗被拦截时回退当前标签导航并重置等待态', () => {
    setToken(null)
    vi.spyOn(window, 'open').mockReturnValue(null)
    const { open, waiting, show } = useLoginPrompt(vi.fn())
    open('login')
    expect(waiting.value).toBe(false)
    expect(show.value).toBe(false)
  })

  it('accessToken 过期但 refreshToken 存在：静默触发刷新，不直接判已登录', () => {
    // 放最后：attemptRefresh 会置 refreshing 标记（异步复位），避免影响前面用例
    vi.mocked(authControllerRefreshToken).mockResolvedValue({
      data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
      error: undefined,
    } as never)
    localStorage.setItem('accessToken', makeExpiredJwt())
    localStorage.setItem('refreshToken', 'valid-refresh')
    const onAuthenticated = vi.fn()
    const { show } = useLoginPrompt(onAuthenticated)
    // 初始态 guest（access 过期）→ 显示弹窗，不直接触发登录后回调
    expect(show.value).toBe(true)
    expect(onAuthenticated).not.toHaveBeenCalled()
    // 静默刷新被触发
    expect(authControllerRefreshToken).toHaveBeenCalled()
  })
})
