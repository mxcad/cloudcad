import type { RouteRecordRaw } from 'vue-router';
import { SystemPermission } from '@/constants/permissions';

/**
 * 路由元信息类型
 */
declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题 */
    title?: string;
    /** 是否公开访问（无需登录） */
    public?: boolean;
    /** 所需系统权限 */
    permission?: string;
    /** 使用的布局：app = 带侧边栏主布局, auth = 认证布局, bare = 无布局 */
    layout?: 'app' | 'auth' | 'bare';
    /** 是否在侧边栏中隐藏 */
    hidden?: boolean;
    /** 侧边栏图标 (MDI) */
    icon?: string;
    /** 侧边栏分组 */
    group?: string;
  }
}

// ============================================================================
// 路由分层设计
// ============================================================================

/**
 * 公开路由 - 认证相关页面，无需登录
 * 使用 AuthLayout
 */
const publicRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: {
      public: true,
      layout: 'auth',
      title: '登录',
    },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/pages/RegisterPage.vue'),
    meta: {
      public: true,
      layout: 'auth',
      title: '注册',
    },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/pages/ForgotPasswordPage.vue'),
    meta: {
      public: true,
      layout: 'auth',
      title: '忘记密码',
    },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('@/pages/ResetPasswordPage.vue'),
    meta: {
      public: true,
      layout: 'auth',
      title: '重置密码',
    },
  },
  {
    path: '/verify-email',
    name: 'verify-email',
    component: () => import('@/pages/VerifyEmailPage.vue'),
    meta: {
      public: true,
      layout: 'auth',
      title: '邮箱验证',
    },
  },
  {
    path: '/verify-phone',
    name: 'verify-phone',
    component: () => import('@/pages/VerifyPhonePage.vue'),
    meta: {
      public: true,
      layout: 'auth',
      title: '手机验证',
    },
  },
];

/**
 * CAD 编辑器路由 - 公开访问，无布局（编辑器自带全屏布局）
 */
const cadRoutes: RouteRecordRaw[] = [
  {
    path: '/cad-editor',
    name: 'cad-editor',
    component: () => import('@/pages/CadEditorPage.vue'),
    meta: {
      public: true,
      layout: 'bare',
      title: 'CAD 编辑器',
    },
  },
  {
    path: '/cad-editor/:fileId',
    name: 'cad-editor-file',
    component: () => import('@/pages/CadEditorPage.vue'),
    meta: {
      public: true,
      layout: 'bare',
      title: 'CAD 编辑器',
    },
  },
];

/**
 * 核心路由 - 登录后主功能区，使用 AppLayout
 */
const coreRoutes: RouteRecordRaw[] = [
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/pages/DashboardPage.vue'),
    meta: {
      layout: 'app',
      title: '仪表盘',
      icon: 'mdi-view-dashboard-outline',
      group: 'main',
    },
  },
  {
    path: '/projects',
    name: 'projects',
    component: () => import('@/pages/ProjectsPage.vue'),
    meta: {
      layout: 'app',
      title: '项目管理',
      icon: 'mdi-folder-open-outline',
      group: 'main',
    },
  },
  {
    path: '/projects/:projectId/files',
    name: 'project-files',
    component: () => import('@/pages/ProjectsPage.vue'),
    meta: {
      layout: 'app',
      title: '项目文件',
      icon: 'mdi-folder-open-outline',
      hidden: true,
    },
  },
  {
    path: '/projects/:projectId/files/:nodeId',
    name: 'project-file-detail',
    component: () => import('@/pages/ProjectsPage.vue'),
    meta: {
      layout: 'app',
      title: '文件详情',
      hidden: true,
    },
  },
  {
    path: '/personal-space',
    name: 'personal-space',
    component: () => import('@/pages/PersonalSpacePage.vue'),
    meta: {
      layout: 'app',
      title: '我的图纸',
      icon: 'mdi-file-document-outline',
      group: 'main',
    },
  },
  {
    path: '/personal-space/:nodeId',
    name: 'personal-space-detail',
    component: () => import('@/pages/PersonalSpacePage.vue'),
    meta: {
      layout: 'app',
      title: '我的图纸',
      hidden: true,
    },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/pages/ProfilePage.vue'),
    meta: {
      layout: 'app',
      title: '个人设置',
      hidden: true,
    },
  },
];

/**
 * 后台管理路由 - 需要特定系统权限，使用 AppLayout
 */
const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/users',
    name: 'users',
    component: () => import('@/pages/UserManagementPage.vue'),
    meta: {
      layout: 'app',
      title: '用户管理',
      permission: SystemPermission.SYSTEM_USER_READ,
      icon: 'mdi-account-group-outline',
      group: 'admin',
    },
  },
  {
    path: '/roles',
    name: 'roles',
    component: () => import('@/pages/RoleManagementPage.vue'),
    meta: {
      layout: 'app',
      title: '角色权限',
      permission: SystemPermission.SYSTEM_ROLE_READ,
      icon: 'mdi-shield-check-outline',
      group: 'admin',
    },
  },
  {
    path: '/font-library',
    name: 'font-library',
    component: () => import('@/pages/FontLibraryPage.vue'),
    meta: {
      layout: 'app',
      title: '字体库',
      permission: SystemPermission.SYSTEM_FONT_READ,
      icon: 'mdi-format-font',
      group: 'admin',
    },
  },
  {
    path: '/library',
    name: 'library',
    component: () => import('@/pages/LibraryPage.vue'),
    meta: {
      layout: 'app',
      title: '公共资源库',
      permission: SystemPermission.LIBRARY_DRAWING_MANAGE,
      icon: 'mdi-bookshelf',
      group: 'admin',
    },
  },
  {
    path: '/library/:libraryType',
    name: 'library-type',
    component: () => import('@/pages/LibraryPage.vue'),
    meta: {
      layout: 'app',
      title: '资源库',
      permission: SystemPermission.LIBRARY_DRAWING_MANAGE,
      hidden: true,
    },
  },
  {
    path: '/library/:libraryType/:nodeId',
    name: 'library-detail',
    component: () => import('@/pages/LibraryPage.vue'),
    meta: {
      layout: 'app',
      title: '资源详情',
      permission: SystemPermission.LIBRARY_DRAWING_MANAGE,
      hidden: true,
    },
  },
  {
    path: '/audit-logs',
    name: 'audit-logs',
    component: () => import('@/pages/AuditLogPage.vue'),
    meta: {
      layout: 'app',
      title: '审计日志',
      permission: SystemPermission.SYSTEM_ADMIN,
      icon: 'mdi-clipboard-text-clock-outline',
      group: 'admin',
    },
  },
  {
    path: '/system-monitor',
    name: 'system-monitor',
    component: () => import('@/pages/SystemMonitorPage.vue'),
    meta: {
      layout: 'app',
      title: '系统监控',
      permission: SystemPermission.SYSTEM_MONITOR,
      icon: 'mdi-monitor-dashboard',
      group: 'admin',
    },
  },
  {
    path: '/runtime-config',
    name: 'runtime-config',
    component: () => import('@/pages/RuntimeConfigPage.vue'),
    meta: {
      layout: 'app',
      title: '系统设置',
      permission: SystemPermission.SYSTEM_CONFIG_READ,
      icon: 'mdi-cog-outline',
      group: 'admin',
    },
  },
];

/**
 * 兜底路由
 */
const fallbackRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/cad-editor',
    meta: {
      public: true,
    },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: {
      public: true,
      layout: 'bare',
      title: '页面未找到',
    },
  },
];

/**
 * 完整路由表
 * 合并顺序：公开 → CAD → 核心 → 管理 → 兜底
 */
const routes: RouteRecordRaw[] = [
  ...publicRoutes,
  ...cadRoutes,
  ...coreRoutes,
  ...adminRoutes,
  ...fallbackRoutes,
];

export default routes;
