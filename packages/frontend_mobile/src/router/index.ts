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
 *
 * 守卫是异步的：accessToken 过期但 refreshToken 有效时先静默刷新再判定（见 hasValidAuth），
 * 否则冷启动会误把「可续期会话」判成未登录而弹登录页。
 */
import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from 'vue-router';
import {
  AUTH_PAGE_PATHS,
  isTokenExpired,
  onSessionChanged,
  readToken,
  resolveRedirectTarget,
} from '@/utils/authSession';
import { refreshTokensOnce } from '@/utils/apiConfig';

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
    // 壳根（编辑器）。App.vue 静态渲染 <Shell />（不走 router-view，保 WebGL 存活），
    // 此记录只为让 /shell 是已声明路径（404 兜底判 route.matched.length）。
    path: '/shell',
    name: 'Shell',
    component: () => import('../pages/shell/index.vue'),
  },
  {
    // 子页必须是顶层记录而非 /shell 的 children：App.vue 不走 <router-view>，
    // Shell 覆盖层里的 <router-view> 处于第 0 层；children 嵌套会让它渲染
    // matched[0]=Shell 本身——每进一个子页就重挂一套 Shell+Home（编辑器），
    // 深链 ?fileId= 被重新消费 → 图纸重复打开、引擎重复初始化。
    // 拍平后第 0 层直接渲染子页；路径与名称不变，ADR-0070 映射表不受影响。
    path: '/shell/file',
    name: 'FileBrowser',
    component: () => import('../pages/shell/sub-pages/FileBrowserPage.vue'),
  },
  {
    // 参数名须为 :projectId：与 @cloudcad/platform 路由映射表的反向解析共用
    // renderPathPattern，参数名不同名会渲染出空路径段。
    path: '/shell/file/project/:projectId',
    name: 'ProjectDetail',
    component: () =>
      import('../pages/shell/sub-pages/ProjectDetailPage.vue'),
  },
  {
    path: '/shell/file/project/:projectId/roles',
    name: 'ProjectRoles',
    component: () =>
      import('../pages/shell/sub-pages/ProjectRolesPage.vue'),
  },
  {
    path: '/shell/share',
    name: 'ShareManage',
    component: () => import('../pages/shell/sub-pages/ShareManagePage.vue'),
  },
  {
    path: '/shell/profile',
    name: 'Profile',
    component: () => import('../pages/shell/sub-pages/ProfilePage.vue'),
  },
  {
    path: '/shell/member',
    name: 'MemberCenter',
    component: () =>
      import('../pages/shell/sub-pages/MemberCenterPage.vue'),
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

/**
 * 守卫等待刷新的上限。@hey-api 生成的 client 没有内置超时（apiConfig 的 fetch
 * 覆写也只处理重试），刷新请求挂住会让导航永久 pending，故守卫侧自己兜上限。
 */
const REFRESH_GUARD_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * 可续期的登录态判定：accessToken 有效即已登录；否则先静默刷新一次再判定。
 *
 * 必须异步：accessToken 过期但 refreshToken 仍有效时（冷启动最典型——
 * useAuthState.initFromStorage 的静默刷新还没回来，守卫已同步判完），
 * 纯 exp 检查会把「可续期会话」误判成未登录，把刚登录的用户弹回 /login。
 *
 * 判定结果按会话缓存：刷新失败（含超时、网络错误）后不再每次导航都重试；
 * 会话写入/清理时（onSessionChanged）重置，重新允许尝试。in-flight 期间并发
 * 导航共享同一个 promise，不会在刷新未返回前抢先弹登录页。
 *
 * 刷新走 apiConfig.refreshTokensOnce 唯一出口（与 fetch 层 401 刷新共享 in-flight
 * 去重，不会重复消费轮换制 refresh token）。
 */
let authRefreshOutcome: Promise<boolean> | null = null;
onSessionChanged(() => {
  authRefreshOutcome = null;
});

export function hasValidAuth(): Promise<boolean> {
  if (hasValidToken()) return Promise.resolve(true);
  if (authRefreshOutcome) return authRefreshOutcome;
  authRefreshOutcome = withTimeout(refreshTokensOnce(), REFRESH_GUARD_TIMEOUT_MS)
    .then((ok) => ok && hasValidToken())
    .catch(() => false);
  return authRefreshOutcome;
}

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const isAuthPage = AUTH_PAGE_PATHS.includes(to.path);
  const needsAuth = AUTH_REQUIRED_PREFIXES.some((p) => to.path.startsWith(p));
  const authed = await hasValidAuth();

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
