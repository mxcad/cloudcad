import { describe, it, expect, vi, afterEach } from 'vitest'
import { useLoginPrompt } from './useLoginPrompt'
import { navigateToLogin, navigateToRegister } from '../utils/authNavigate'

vi.mock('../utils/authNavigate', () => ({
  navigateToLogin: vi.fn(),
  navigateToRegister: vi.fn(),
}))
vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  authControllerRefreshToken: vi.fn(),
}))

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
  it('guest 态立即跳原生登录页，且不触发登录后回调', () => {
    setToken(null)
    const onAuthenticated = vi.fn()
    const { open } = useLoginPrompt(onAuthenticated)
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
  it('过期的 accessToken（无 refreshToken）视为未登录：跳登录页并清除陈旧 token', () => {
    localStorage.setItem('accessToken', makeExpiredJwt())
    const onAuthenticated = vi.fn()
    const { open } = useLoginPrompt(onAuthenticated)
    expect(navigateToLogin).toHaveBeenCalled()
    expect(onAuthenticated).not.toHaveBeenCalled()
    expect(localStorage.getItem('accessToken')).toBeNull()
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
