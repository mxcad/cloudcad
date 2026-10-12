import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  Share2,
  User,
  Library,
  Type,
  Users,
  ShieldCheck,
  DollarSign,
  Shield,
  ScrollText,
  Activity,
  Bell,
} from 'lucide-react';
import { SystemPermission } from '../constants/permissions';

/**
 * 后台路由 / 导航声明（单一事实源）：侧边栏菜单项与路由守卫共用的
 * 「路径 → 所需系统权限（+ 菜单展示信息）」声明。
 *
 * 历史上菜单显隐（Layout）与路由守卫（App）各自内联一份「路径 → 权限」映射，
 * 两处漂移会导致「菜单可见但路由 403」或反之（实例：/admin/billing 曾误用
 * SYSTEM_CONFIG_READ；/admin/notices 菜单曾误用 SYSTEM_CONFIG_READ 而守卫用
 * SYSTEM_CONFIG_WRITE，READ-only 用户看到菜单却 403）。收敛为单一声明后，
 * 新增 / 调整后台页面只改这里一处，菜单与守卫天然一致。
 *
 * - `permission` 为 undefined 表示仅需登录（ProtectedRoute），无需额外系统权限。
 * - 带 `icon` 的条目出现在侧边栏菜单；无 `icon` 的条目（如 /admin/stats、
 *   /runtime-config）只是受守卫路由，不进菜单。
 * - `labelKey` 是 i18n 源键（中文），消费方在渲染时 `t(labelKey)` 以随语言切换，
 *   不在模块加载期求值。
 * - 子路由（如 /library/:libraryType）复用其顶级路径的权限，App 守卫按顶级路径取值。
 */
export interface RouteDeclaration {
  path: string;
  permission?: SystemPermission | SystemPermission[];
  /** 菜单展示信息（仅侧边栏菜单项需要；受守卫但无菜单的路由不填） */
  labelKey?: string;
  icon?: LucideIcon;
  section?: 'main' | 'admin';
  dataTour?: string;
}

export const ROUTE_DECLARATIONS: RouteDeclaration[] = [
  { path: '/dashboard', labelKey: '仪表盘', icon: LayoutDashboard, section: 'main' },
  {
    path: '/projects',
    labelKey: '项目管理',
    icon: FolderOpen,
    section: 'main',
    dataTour: 'sidebar-projects',
  },
  {
    path: '/personal-space',
    labelKey: '个人空间',
    icon: FileText,
    section: 'main',
    dataTour: 'sidebar-personal-space',
  },
  { path: '/shares', labelKey: '分享管理', icon: Share2, section: 'main' },
  { path: '/profile', labelKey: '个人资料', icon: User, section: 'main' },
  {
    path: '/library',
    labelKey: '公共资源库',
    icon: Library,
    section: 'admin',
    permission: [
      SystemPermission.LIBRARY_DRAWING_MANAGE,
      SystemPermission.LIBRARY_BLOCK_MANAGE,
    ],
  },
  {
    path: '/font-library',
    labelKey: '字体库',
    icon: Type,
    section: 'admin',
    permission: SystemPermission.SYSTEM_FONT_READ,
  },
  {
    path: '/users',
    labelKey: '用户管理',
    icon: Users,
    section: 'admin',
    permission: SystemPermission.SYSTEM_USER_READ,
  },
  {
    path: '/roles',
    labelKey: '角色权限',
    icon: ShieldCheck,
    section: 'admin',
    permission: SystemPermission.SYSTEM_ROLE_READ,
    dataTour: 'sidebar-roles',
  },
  {
    path: '/admin/billing',
    labelKey: '支付管理',
    icon: DollarSign,
    section: 'admin',
    // 菜单显隐与路由守卫一致用 SYSTEM_BILLING_READ（曾误用 SYSTEM_CONFIG_READ，
    // 导致有"查看配置"无"查看支付"的用户看到菜单但 403，反之看不到菜单）
    permission: SystemPermission.SYSTEM_BILLING_READ,
  },
  {
    path: '/admin/ip-access',
    labelKey: 'IP 访问控制',
    icon: Shield,
    section: 'admin',
    // 三个子 Tab 权限不同（黑名单 / 白名单+高危访问尝试），任一权限即见入口，
    // 页内再按权限显隐 Tab；与 /admin/ip-access 路由守卫的 OR 规则保持一致
    permission: [
      SystemPermission.SYSTEM_IP_BLACKLIST_MANAGE,
      SystemPermission.SYSTEM_IP_WHITELIST_MANAGE,
    ],
  },
  {
    path: '/audit-logs',
    labelKey: '审计日志',
    icon: ScrollText,
    section: 'admin',
    // #321 三权分立：审计管理员（AUDIT_ADMIN）或系统管理员可见
    permission: [SystemPermission.AUDIT_ADMIN, SystemPermission.SYSTEM_ADMIN],
  },
  {
    path: '/system-monitor',
    labelKey: '系统监控',
    icon: Activity,
    section: 'admin',
    permission: SystemPermission.SYSTEM_MONITOR,
  },
  {
    path: '/admin/notices',
    labelKey: '通知管理',
    icon: Bell,
    section: 'admin',
    // 与路由守卫一致用 SYSTEM_CONFIG_WRITE（通知管理需写权限；曾误用 READ，
    // READ-only 用户看到菜单却 403）
    permission: SystemPermission.SYSTEM_CONFIG_WRITE,
  },
  // 受守卫但无侧边栏菜单项的路由（仅声明权限，供路由守卫取值）
  {
    path: '/admin/stats',
    permission: [
      SystemPermission.SYSTEM_USER_READ,
      SystemPermission.SYSTEM_BILLING_READ,
    ],
  },
  {
    path: '/runtime-config',
    permission: SystemPermission.SYSTEM_CONFIG_READ,
  },
];

/**
 * 路由路径 → 所需系统权限（单一事实源）。
 *
 * 菜单显隐（Layout）与路由守卫（App）都经此取值，杜绝两处漂移。子路由按顶级
 * 路径取值（如 /library/:libraryType → /library）。未声明的路径返回 undefined
 * （仅需登录，由 ProtectedRoute 兜底）。
 */
export function getRoutePermission(
  path: string
): SystemPermission | SystemPermission[] | undefined {
  return ROUTE_DECLARATIONS.find((e) => e.path === path)?.permission;
}
