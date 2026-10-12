import { describe, it, expect, vi, afterEach } from 'vitest'
import { useLoginPrompt } from './useLoginPrompt'
import { navigateToLogin, navigateToRegister } from '../utils/authNavigate'
import { hasValidAuth } from '../router'

vi.mock('../utils/authNavigate', () => ({
  navigateToLogin: vi.fn(),
  navigateToRegister: vi.fn(),
}))
vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  authControllerRefreshToken: vi.fn(),
}))
vi.mock('../router', () => ({
  hasValidAuth: vi.fn(),
}))

// guest / token_expired 的跳转决策已改为 await hasValidAuth()（冷启动竞态修复），
// 断言前需让出事件循环等该 promise 链结算（含 attemptRefresh 的并发刷新链）。
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function setToken(token: string | null) {
  if (token) localStorage.setItem('accessToken', token)
  else localStorage.removeItem('accessToken')
}
function makeExpiredJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 3600 }))
  return `${header}.${payload}.sig`
}

describe('useLoginPrompt 未登录引导', () => {
  afterEach(() => {
    vi.clearAllMocks()
    setToken(null)
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
  })
  it('guest 态（刷新判定失败）跳原生登录页，且不触发登录后回调', async () => {
    vi.mocked(hasValidAuth).mockResolvedValue(false)
    setToken(null)
    const onAuthenticated = vi.fn()
    const { open } = useLoginPrompt(onAuthenticated)
    await flush()
    expect(hasValidAuth).toHaveBeenCalled()
    expect(navigateToLogin).toHaveBeenCalled()
    expect(onAuthenticated).not.toHaveBeenCalled()
    expect(typeof open).toBe('function')
  })
  it('已登录态不跳登录页，立即触发登录后回调（页面加载数据）', () => {
    setToken('test-token')
    const onAuthenticated = vi.fn()
    const { open } = useLoginPrompt(onAuthenticated)
    expect(navigateToLogin).not.toHaveBeenCalled()
    expect(onAuthenticated).toHaveBeenCalledTimes(1)
    expect(typeof open).toBe('function')
  })
  it('过期的 accessToken（无 refreshToken）视为未登录：清除陈旧 token 并跳登录页', async () => {
    vi.mocked(hasValidAuth).mockResolvedValue(false)
    localStorage.setItem('accessToken', makeExpiredJwt())
    const onAuthenticated = vi.fn()
    useLoginPrompt(onAuthenticated)
    expect(localStorage.getItem('accessToken')).toBeNull()
    await flush()
    expect(navigateToLogin).toHaveBeenCalled()
    expect(onAuthenticated).not.toHaveBeenCalled()
  })
  it('open("register") 跳原生注册页', () => {
    setToken('test-token') // 有效 token，避免 watch(immediate) 在 guest 态额外触发 navigateToLogin 干扰计数
    const { open } = useLoginPrompt(vi.fn())
    open('register')
    expect(navigateToRegister).toHaveBeenCalledTimes(1)
  })
  it('open("login") 跳原生登录页', () => {
    setToken('test-token')
    const { open } = useLoginPrompt(vi.fn())
    open('login')
    expect(navigateToLogin).toHaveBeenCalledTimes(1)
  })
})

describe('冷启动竞态：accessToken 过期但 refreshToken 有效（可续期会话）', () => {
  afterEach(() => {
    vi.clearAllMocks()
    setToken(null)
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
  })
  it('不弹登录页：判定为已登录后同步状态机并触发登录后回调', async () => {
    vi.mocked(hasValidAuth).mockResolvedValue(true)
    // accessToken 已过期 + refreshToken 仍在：initFromStorage 置 guest 并异步尝试刷新，
    // 挂载瞬间 kind 恰是 guest——修复前此处会立即 navigateToLogin() 把可续期会话弹走
    localStorage.setItem('accessToken', makeExpiredJwt())
    localStorage.setItem('refreshToken', 'valid-refresh-token')
    const onAuthenticated = vi.fn()
    useLoginPrompt(onAuthenticated)
    await flush()
    expect(navigateToLogin).not.toHaveBeenCalled()
    expect(onAuthenticated).toHaveBeenCalledTimes(1)
  })
  it('刷新判定失败才跳登录页', async () => {
    vi.mocked(hasValidAuth).mockResolvedValue(false)
    localStorage.setItem('accessToken', makeExpiredJwt())
    localStorage.setItem('refreshToken', 'stale-refresh-token')
    const onAuthenticated = vi.fn()
    useLoginPrompt(onAuthenticated)
    await flush()
    expect(navigateToLogin).toHaveBeenCalledTimes(1)
    expect(onAuthenticated).not.toHaveBeenCalled()
  })
})
