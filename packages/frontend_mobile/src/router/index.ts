/**
 * 移动端路由表
 *
 * 壳模式始终启用。Shell 组件渲染顶栏 + 编辑器根 + 子页覆盖层。
 * 根路径 `/` 重定向到 `/shell`（壳根 = 编辑器 + 顶栏）。
 * 子页通过 Action Sheet 导航覆盖在编辑器上。
 *
 * 认证页（/login、/register）为顶层懒加载路由，App.vue 按 route.path 条件渲染为全屏覆盖层
 * （App.vue 直接渲染 <Shell /> 而非 <router-view>，认证页不能走 router-view）。
 *
 * 路由守卫：未登录访问需登录子页（/shell/file、/shell/share、/shell/profile）→ 直接跳 /login?redirect=...；
 * 已登录访问 /login|/register → 跳回 redirect 目标或 /shell。/shell 根（编辑器）公开可游客使用。
 */
import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/shell',
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../pages/auth/LoginPage.vue'),
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../pages/auth/RegisterPage.vue'),
  },
  {
    path: '/shell',
    name: 'Shell',
    component: () => import('../pages/shell/index.vue'),
    children: [
      {
        path: 'file',
        name: 'FileBrowser',
        component: () => import('../pages/shell/sub-pages/FileBrowserPage.vue'),
      },
      {
        path: 'file/project/:id',
        name: 'ProjectDetail',
        component: () => import('../pages/shell/sub-pages/ProjectDetailPage.vue'),
      },
      {
        path: 'share',
        name: 'ShareManage',
        component: () => import('../pages/shell/sub-pages/ShareManagePage.vue'),
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('../pages/shell/sub-pages/ProfilePage.vue'),
      },
    ],
  },
]

/** 需登录才能访问的路径前缀（/shell 根 = 编辑器，公开可游客使用） */
const AUTH_REQUIRED_PREFIXES = ['/shell/file', '/shell/share', '/shell/profile']

/** 纯 JWT exp 检查：accessToken 存在且未过期即视为已登录（无法解析 / 无 exp 视为有效） */
function hasValidToken(): boolean {
  const token = localStorage.getItem('accessToken')
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || '')) as { exp?: number }
    if (typeof payload.exp !== 'number') return true
    return payload.exp * 1000 > Date.now()
  } catch {
    return true
  }
}

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  const isAuthPage = to.path === '/login' || to.path === '/register'
  const needsAuth = AUTH_REQUIRED_PREFIXES.some((p) => to.path.startsWith(p))
  const authed = hasValidToken()

  // 已登录访问认证页 → 跳回 redirect 目标（同源内部路径）或壳根
  if (isAuthPage && authed) {
    const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : ''
    const safe = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/shell'
    return safe
  }
  // 未登录访问需登录子页 → 直接跳登录页（带 redirect 回跳）
  if (needsAuth && !authed) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
