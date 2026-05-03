import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import routes from './routes';

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

// ============================================================================
// 路由守卫
// ============================================================================

// 认证相关路径（已登录用户访问时重定向到仪表盘）
const authPaths = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/verify-phone',
]);

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore();

  // 1. 设置页面标题
  if (to.meta.title) {
    document.title = `${to.meta.title} - CloudCAD`;
  }

  // 2. 公开页面直接放行
  if (to.meta.public) {
    // 已登录用户访问认证页，重定向到仪表盘
    if (auth.isAuthenticated && authPaths.has(to.path)) {
      return next({ path: '/dashboard', replace: true });
    }
    return next();
  }

  // 3. 非公开页面需要认证
  if (!auth.isAuthenticated) {
    return next({
      path: '/login',
      query: { redirect: to.fullPath },
      state: { from: to.fullPath },
      replace: true,
    });
  }

  // 4. 权限检查
  if (to.meta.permission) {
    const userPermissions =
      auth.user?.role?.permissions?.map((p) => p.permission) ?? [];
    const hasPermission = userPermissions.includes(to.meta.permission);

    if (!hasPermission) {
      return next({ path: '/projects', replace: true });
    }
  }

  next();
});

export default router;
