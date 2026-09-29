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
 * 已登录访问 /login|/register 等认证页 → 跳回 redirect 目标或 /shell（例外：/forgot-password、
 * /reset-password 允许已登录进入——Profile 页「忘记密码」入口面向已登录用户）。/shell 根（编辑器）公开可游客使用。
 */
import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from 'vue-router';
import {
  AUTH_PAGE_PATHS,
  isTokenExpired,
  readToken,
  resolveRedirectTarget,
} from '@/utils/authSession';

const routes: RouteRecordRaw[] = [
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
    path: '/verify-email',
    name: 'VerifyEmail',
    component: () => import('../pages/auth/VerifyEmailPage.vue'),
  },
  {
    path: '/verify-phone',
    name: 'VerifyPhone',
    component: () => import('../pages/auth/VerifyPhonePage.vue'),
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: () => import('../pages/auth/ForgotPasswordPage.vue'),
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: () => import('../pages/auth/ResetPasswordPage.vue'),
  },
  {
    // 微信绑定/注销授权回调桥接：后端固定重定向到 PC 路径 /profile#wechat_result=...，
    // 移动端 Profile 页在 /shell/profile，保留 hash 转发过去由页面消费
    path: '/profile',
    redirect: (to) => ({
      path: '/shell/profile',
      query: to.query,
      hash: to.hash,
    }),
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
        component: () =>
          import('../pages/shell/sub-pages/ProjectDetailPage.vue'),
      },
      {
        path: 'file/project/:id/roles',
        name: 'ProjectRoles',
        component: () =>
          import('../pages/shell/sub-pages/ProjectRolesPage.vue'),
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
      {
        path: 'member',
        name: 'MemberCenter',
        component: () =>
          import('../pages/shell/sub-pages/MemberCenterPage.vue'),
      },
    ],
  },
];

/** 需登录才能访问的路径前缀（/shell 根 = 编辑器，公开可游客使用） */
const AUTH_REQUIRED_PREFIXES = [
  '/shell/file',
  '/shell/share',
  '/shell/profile',
  '/shell/member',
];

/** 已登录用户允许直接访问的认证页（忘记密码/重置密码由 Profile 页入口发起；
 *  verify 页是登录前补验流程，保持弹回） */
const AUTHED_ALLOWED_AUTH_PAGES = ['/forgot-password', '/reset-password'];

/** 纯 JWT exp 检查：accessToken 存在且未过期即视为已登录（无法解析 / 无 exp 视为有效） */
function hasValidToken(): boolean {
  const token = readToken();
  return !!token && !isTokenExpired(token);
}

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach((to) => {
  const isAuthPage = AUTH_PAGE_PATHS.includes(to.path);
  const needsAuth = AUTH_REQUIRED_PREFIXES.some((p) => to.path.startsWith(p));
  const authed = hasValidToken();

  // 已登录访问认证页 → 跳回 redirect 目标（同源内部路径）或壳根
  // （/forgot-password、/reset-password 例外：Profile 页入口面向已登录用户）
  if (isAuthPage && authed && !AUTHED_ALLOWED_AUTH_PAGES.includes(to.path)) {
    const redirect =
      typeof to.query.redirect === 'string' ? to.query.redirect : '';
    return resolveRedirectTarget(redirect || undefined, '/shell');
  }
  // 未登录访问需登录子页 → 直接跳登录页（带 redirect 回跳）
  if (needsAuth && !authed) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
