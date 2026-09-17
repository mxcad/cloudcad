import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  navigateToLogin,
  navigateToRegister,
  navigateToLoginPage,
  navigateAfterAuth,
  redirectQueryOf,
} from './authNavigate'

// router 是唯一副作用出口：整段替换为记录器，断言跳转目标而非 DOM。
const nav = vi.hoisted(() => ({ replace: vi.fn(), fullPath: '/' }))

vi.mock('@/router', () => ({
  default: {
    replace: (target: unknown) => nav.replace(target),
    get currentRoute() {
      return { value: { fullPath: nav.fullPath } }
    },
  },
}))
// authSession 只为拿 resolveRedirectTarget，顺手把会话写入链路换成空实现，
// 避免 test 里拉进 useUser 的 window/router 顶层副作用（并打破 authNavigate → authSession
// → useUser → authNavigate 的循环 import）。
vi.mock('@/composables/useAuthState', () => ({ useAuthState: () => ({ setAuthenticated: vi.fn() }) }))
vi.mock('@/composables/useUser', () => ({ useUser: () => ({ refresh: vi.fn() }) }))

describe('authNavigate 认证页导航', () => {
  beforeEach(() => {
    nav.replace.mockReset()
    nav.fullPath = '/'
  })

  describe('navigateToLogin / navigateToRegister', () => {
    it('当前在需登录子页时带 redirect 回跳目标', () => {
      nav.fullPath = '/shell/files'
      navigateToLogin()
      expect(nav.replace).toHaveBeenCalledWith({ path: '/login', query: { redirect: '/shell/files' } })
    })

    it('redirect 携带 query 时整串保留（不能被 { path } 拆开）', () => {
      nav.fullPath = '/shell/files?projectId=p1&tab=links'
      navigateToLogin()
      expect(nav.replace).toHaveBeenCalledWith({
        path: '/login',
        query: { redirect: '/shell/files?projectId=p1&tab=links' },
      })
    })

    it('壳根（编辑器）无需回跳：不带 redirect', () => {
      nav.fullPath = '/shell'
      navigateToLogin()
      expect(nav.replace).toHaveBeenCalledWith({ path: '/login', query: {} })
    })

    it('认证页自身避免自指：/login /register 不带 redirect', () => {
      nav.fullPath = '/login'
      navigateToRegister()
      expect(nav.replace).toHaveBeenCalledWith({ path: '/register', query: {} })

      nav.fullPath = '/register'
      navigateToLogin()
      expect(nav.replace).toHaveBeenCalledWith({ path: '/login', query: {} })
    })

    it('显式 redirect 优先于当前路由', () => {
      nav.fullPath = '/shell'
      navigateToLogin('/shell/profile')
      expect(nav.replace).toHaveBeenCalledWith({ path: '/login', query: { redirect: '/shell/profile' } })
    })

    it('navigateToRegister 与登录页同口径', () => {
      nav.fullPath = '/shell/share'
      navigateToRegister()
      expect(nav.replace).toHaveBeenCalledWith({ path: '/register', query: { redirect: '/shell/share' } })
    })

    it('navigateToLoginPage 不带 redirect（登录是终点）', () => {
      nav.fullPath = '/shell/profile'
      navigateToLoginPage()
      expect(nav.replace).toHaveBeenCalledWith({ path: '/login' })
    })
  })

  describe('navigateAfterAuth 认证完成落点', () => {
    it('按 redirect 回跳，且以整串字符串传（query 不能丢）', () => {
      navigateAfterAuth({ redirect: '/shell/files?projectId=p1&tab=links' })
      expect(nav.replace).toHaveBeenCalledWith('/shell/files?projectId=p1&tab=links')
    })

    it('redirect 缺失回退壳根', () => {
      navigateAfterAuth({})
      expect(nav.replace).toHaveBeenCalledWith('/shell')
    })

    it('拒绝跨源与协议相对目标（防 open redirect）', () => {
      navigateAfterAuth({ redirect: 'https://evil.example/x' })
      expect(nav.replace).toHaveBeenLastCalledWith('/shell')

      navigateAfterAuth({ redirect: '//evil.example/x' })
      expect(nav.replace).toHaveBeenLastCalledWith('/shell')
    })

    it('非字符串 redirect 一律回退壳根', () => {
      navigateAfterAuth({ redirect: undefined })
      expect(nav.replace).toHaveBeenLastCalledWith('/shell')

      navigateAfterAuth({ redirect: 42 })
      expect(nav.replace).toHaveBeenLastCalledWith('/shell')
    })
  })

  describe('redirectQueryOf 中转页透传', () => {
    it('可携带目标原样透传，供验证页继续带回', () => {
      expect(redirectQueryOf({ redirect: '/shell/share?tab=links' })).toEqual({
        redirect: '/shell/share?tab=links',
      })
    })

    it('缺省时返回空对象（调用方 spread 后不会产生 redirect: undefined）', () => {
      expect(redirectQueryOf({})).toEqual({})
      expect(redirectQueryOf({ redirect: undefined })).toEqual({})
    })

    it('壳根与认证页自身不携带，避免无意义自指', () => {
      expect(redirectQueryOf({ redirect: '/shell' })).toEqual({})
      expect(redirectQueryOf({ redirect: '/login' })).toEqual({})
      expect(redirectQueryOf({ redirect: '/register' })).toEqual({})
    })

    it('跨源目标一律不透传', () => {
      expect(redirectQueryOf({ redirect: 'https://evil.example/x' })).toEqual({})
      expect(redirectQueryOf({ redirect: '//evil.example/x' })).toEqual({})
    })

    it('返回可 spread 的普通对象，不污染调用方的其余 query', () => {
      const query = { email: 'a@b.com', ...redirectQueryOf({ redirect: '/shell/profile' }) }
      expect(query).toEqual({ email: 'a@b.com', redirect: '/shell/profile' })
    })
  })
})
