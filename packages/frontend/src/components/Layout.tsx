import type React from 'react';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAuth } from '../contexts/AuthContext';
import { useIsMobile } from '../lib/useIsMobile';
import { useRuntimeConfig } from '../contexts/RuntimeConfigContext';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission } from '../constants/permissions';
import { useBrandConfig } from '../contexts/BrandContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Tag } from './ui/Tag';
import { TruncateText } from './ui/TruncateText';
import { UserAvatar } from './ui/UserAvatar';
import { formatFileSize } from '../utils/fileUtils';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useTheme } from '../contexts/ThemeContext';
import { Logo } from './Logo';
import { InteractiveBackground } from './InteractiveBackground';
import { useTour } from '../contexts/TourContext';
import { useStorageQuota } from '../hooks/useStorageQuota';
import MembershipBadge from './billing/MembershipBadge';
import { t, $t } from '@/languages';
import { QUOTA_GUIDE_EVENT } from '@/utils/quotaUpgradeGuide';

// Lucide 图标导入
import { LayoutDashboard } from 'lucide-react';
import { FolderOpen } from 'lucide-react';
import { FileText } from 'lucide-react';
import { Users } from 'lucide-react';
import { Shield } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { Type } from 'lucide-react';
import { Activity } from 'lucide-react';
import { ScrollText } from 'lucide-react';
import { Settings } from 'lucide-react';
import { Settings2 } from 'lucide-react';
import { LogOut } from 'lucide-react';
import {
  Menu as MenuIcon,
  X,
  HardDrive,
  ChevronDown,
  HelpCircle,
  Library,
  Share2,
  User,
  DollarSign,
  Home,
} from 'lucide-react';
import { Menu } from './ui/Menu';

interface NavItemProps {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active: boolean;
  badge?: number;
  dataTour?: string;
  onNavigate?: () => void;
}

/**
 * 导航项组件 - 带有精美动画效果
 */
const NavItem: React.FC<NavItemProps> = ({
  to,
  icon: Icon,
  label,
  active,
  badge,
  dataTour,
  onNavigate,
}) => {
  const { isDark } = useTheme();

  return (
    <Link
      to={to}
      data-tour={dataTour}
      onClick={onNavigate}
      className={`
        group flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl transition-all duration-300 ease-out
        relative overflow-hidden
        ${
          active
            ? isDark
              ? 'text-white shadow-lg'
              : 'text-white shadow-md shadow-primary/30'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
        }
      `}
      style={
        active
          ? {
              background:
                'linear-gradient(135deg, var(--primary-600), var(--primary-500))',
            }
          : {}
      }
    >
      {/* 悬停背景效果 */}
      {!active && (
        <div className="absolute inset-0 bg-[var(--bg-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
      )}

      {/* 活跃指示器 */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white/50 rounded-r-full" />
      )}

      {/* 图标 */}
      <div
        className={`
        relative z-10 p-2 rounded-lg transition-all duration-300
        ${
          active
            ? 'bg-white/20'
            : 'bg-[var(--bg-tertiary)] group-hover:bg-[var(--bg-secondary)]'
        }
      `}
      >
        <Icon
          size={18}
          className={
            active
              ? 'text-white'
              : 'text-[var(--text-tertiary)] group-hover:text-[var(--primary-500)]'
          }
        />
      </div>

      {/* 标签 */}
      <span className="relative z-10 font-medium text-sm">{label}</span>

      {/* 徽章 */}
      {badge !== undefined && badge > 0 && (
        <span
          className={`
          relative z-10 ml-auto text-xs font-semibold px-2 py-0.5 rounded-full
          ${
            active
              ? 'bg-white/30 text-white'
              : 'bg-[var(--primary-100)] text-[var(--primary-600)]'
          }
        `}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
};

/**
 * 主布局组件 - CloudCAD 登录后界面
 *
 * 设计特色：
 * - 专业侧边栏导航，带有用户存储信息
 * - 沉浸式顶部导航栏，毛玻璃效果
 * - 完美主题切换支持
 * - 流畅的交互动画
 */
export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user, loading } = useAuth();
  const { hasPermission, hasAnyPermission } = usePermission();
  const { config: runtimeConfig } = useRuntimeConfig();
  const { config: brandConfig } = useBrandConfig();
  const { isDark } = useTheme();
  const { isActive: isTourActive, openTourCenter } = useTour();
  const isMobile = useIsMobile();

  // UI 状态（必须在条件返回之前调用所有 Hooks）
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userMenuWidth, setUserMenuWidth] = useState(0);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 存储空间
  const { data: storageInfo } = useStorageQuota();

  // 角色名称映射
  const getRoleDisplayName = useCallback((roleName: string): string => {
    const roleMap: Record<string, string> = {
      ADMIN: t('系统管理员'),
      USER_MANAGER: t('用户管理员'),
      FONT_MANAGER: t('字体管理员'),
      USER: t('普通用户'),
      MANAGER: t('项目经理'),
      GUEST: t('访客'),
    };
    return roleMap[roleName] || roleName;
  }, []);

  // 时钟更新
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 测量用户触发器宽度
  useEffect(() => {
    if (showUserMenu && userMenuRef.current) {
      setUserMenuWidth(userMenuRef.current.offsetWidth);
    }
  }, [showUserMenu]);

  // 处理登出
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      // logout() 内部已经会执行 window.location.href = '/login'，无需再次跳转
    } finally {
      setIsLoggingOut(false);
      setShowLogoutConfirm(false);
    }
  };

  // 格式化时间
  const formattedTime = useMemo(() => {
    return currentTime.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, [currentTime]);

  const formattedDate = useMemo(() => {
    return currentTime.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    });
  }, [currentTime]);

  // 导航菜单项配置
  const menuItems = useMemo(
    () => [
      {
        to: '/dashboard',
        icon: LayoutDashboard,
        label: t('仪表盘'),
        visible: true,
      },
      {
        to: '/projects',
        icon: FolderOpen,
        label: t('项目管理'),
        visible: true,
        dataTour: 'sidebar-projects',
      },
      {
        to: '/personal-space',
        icon: FileText,
        label: t('个人空间'),
        visible: true,
        dataTour: 'sidebar-personal-space',
      },
      {
        to: '/shares',
        icon: Share2,
        label: t('分享管理'),
        visible: true,
      },
      {
        to: '/profile',
        icon: User,
        label: t('个人资料'),
        visible: true,
      },
      {
        to: '/library',
        icon: Library,
        label: t('公共资源库'),
        visible:
          hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE) ||
          hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE),
      },
      {
        to: '/font-library',
        icon: Type,
        label: t('字体库'),
        visible: hasPermission(SystemPermission.SYSTEM_FONT_READ),
      },
      {
        to: '/users',
        icon: Users,
        label: t('用户管理'),
        visible: hasPermission(SystemPermission.SYSTEM_USER_READ),
      },
      {
        to: '/roles',
        icon: ShieldCheck,
        label: t('角色权限'),
        visible: hasPermission(SystemPermission.SYSTEM_ROLE_READ),
        dataTour: 'sidebar-roles',
      },
      {
        to: '/admin/billing',
        icon: DollarSign,
        label: t('支付管理'),
        // 与路由守卫一致：菜单显隐用 SYSTEM_BILLING_READ（曾误用 SYSTEM_CONFIG_READ，
        // 导致有"查看配置"无"查看支付"的用户看到菜单但 403，反之看不到菜单）
        visible: hasPermission(SystemPermission.SYSTEM_BILLING_READ),
      },
      {
        to: '/admin/ip-access',
        icon: Shield,
        label: t('IP 访问控制'),
        // 三个子 Tab 权限不同（黑名单 / 白名单+高危访问尝试），任一权限即见入口，
        // 页内再按权限显隐 Tab；与 /admin/ip-access 路由守卫的 OR 规则保持一致
        visible: hasAnyPermission([
          SystemPermission.SYSTEM_IP_BLACKLIST_MANAGE,
          SystemPermission.SYSTEM_IP_WHITELIST_MANAGE,
        ]),
      },
      {
        to: '/audit-logs',
        icon: ScrollText,
        label: t('审计日志'),
        // #321 三权分立：审计管理员（AUDIT_ADMIN）或系统管理员可见
        visible: hasAnyPermission([
          SystemPermission.AUDIT_ADMIN,
          SystemPermission.SYSTEM_ADMIN,
        ]),
      },
      {
        to: '/system-monitor',
        icon: Activity,
        label: t('系统监控'),
        visible: hasPermission(SystemPermission.SYSTEM_MONITOR),
      },
    ],
    [hasPermission, hasAnyPermission]
  );

  // 判断当前导航项是否活跃
  const isActiveRoute = useCallback(
    (path: string): boolean => {
      if (path === '/dashboard') {
        return location.pathname === '/dashboard' || location.pathname === '/';
      }
      if (path === '/projects') {
        return (
          location.pathname === '/projects' ||
          location.pathname.startsWith('/projects/')
        );
      }
      if (path === '/personal-space') {
        return (
          location.pathname === '/personal-space' ||
          location.pathname.startsWith('/personal-space/')
        );
      }
      return (
        location.pathname === path || location.pathname.startsWith(`${path}/`)
      );
    },
    [location.pathname]
  );

  // 存储空间使用率颜色
  const storageColor = useMemo(() => {
    if (!storageInfo) return 'from-emerald-500 to-emerald-600';
    if (storageInfo.usagePercent > 90) return 'from-red-500 to-red-600';
    if (storageInfo.usagePercent > 70) return 'from-amber-500 to-amber-600';
    return 'from-emerald-500 to-emerald-600';
  }, [storageInfo]);

  // 如果是 CAD 编辑器页面，不渲染布局（CAD 编辑器有自己的全屏布局）
  // 注意：必须在所有 Hooks 调用之后返回，以遵守 React Hooks 规则
  if (location.pathname.startsWith('/cad-editor/')) {
    return <div style={{ display: 'none' }} />;
  }

  const appName = brandConfig?.title || 'CloudCAD';

  return (
    <div
      className="flex h-screen overflow-hidden font-[var(--font-family-base)]"
      style={{ background: 'transparent' }}
      onMouseDown={(e) => {
        // 只有点击主内容区域时才关闭菜单，侧边栏内部点击不关闭
        const target = e.target as HTMLElement;
        if (target.closest('aside')) return;
        if (showUserMenu) setShowUserMenu(false);
      }}
    >
      {/* 交互式动态背景 - 带鼠标视差效果 */}
      <InteractiveBackground />
      {/* 移动端侧边栏遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden animate-fade-in"
          style={{
            background: 'var(--bg-overlay)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 w-[85vw] max-w-[320px] lg:w-72 transform transition-all duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-default)',
          boxShadow: sidebarOpen ? 'var(--shadow-2xl)' : 'none',
        }}
      >
        <div className="flex flex-col h-full">
          {/* Logo 区域 */}
          <div className="p-4 flex items-center justify-between">
            <a
              href="/cad-editor"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 group p-2 -m-2 rounded-xl transition-colors hover:bg-[var(--bg-tertiary)]"
              title={appName}
              onClick={() => setSidebarOpen(false)}
            >
              {/* Logo 组件 - 仅图标模式 */}
              <Logo iconOnly={true} animated={false} />

              {/* 品牌名称 */}
              <div className="flex flex-col">
                {/* 主标题 */}
                <span
                  className="text-[15px] font-bold tracking-tight leading-none"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {appName}
                </span>
                {/* 副标题 */}
                <span
                  className="text-[11px] font-medium tracking-wide mt-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {t('CAD 协同平台')}
                </span>
              </div>
            </a>

            {/* 移动端关闭按钮 */}
            <button
              className="lg:hidden w-[28px] h-[28px] flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
              onClick={() => setSidebarOpen(false)}
              aria-label={t('关闭菜单')}
            >
              <X size={20} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>

          {/* 导航菜单 */}
          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            <div className="pb-4">
              <p
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                {t('主菜单')}
              </p>
              {menuItems
                .filter((item) => item.visible)
                .slice(0, 5)
                .map((item) => (
                  <NavItem
                    key={item.to}
                    {...item}
                    active={isActiveRoute(item.to)}
                    onNavigate={() => setSidebarOpen(false)}
                  />
                ))}
            </div>

            {/* 管理菜单 */}
            {menuItems.some((item, idx) => idx >= 6 && item.visible) && (
              <div
                className="pt-2 border-t"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <p
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {t('系统管理')}
                </p>
                {menuItems
                  .filter((item, idx) => idx >= 5 && item.visible)
                  .map((item) => (
                    <NavItem
                      key={item.to}
                      {...item}
                      active={isActiveRoute(item.to)}
                      onNavigate={() => setSidebarOpen(false)}
                    />
                  ))}
              </div>
            )}
          </nav>

          {/* 存储空间信息 */}
          <div
            className="p-4 mx-4 mb-4 rounded-xl"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <HardDrive size={16} style={{ color: 'var(--text-tertiary)' }} />
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('个人空间存储')}
              </span>
            </div>

            {storageInfo ? (
              <>
                {/* 进度条 */}
                <div
                  className="h-2 rounded-full overflow-hidden mb-2"
                  style={{ background: 'var(--bg-secondary)' }}
                >
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${storageColor} transition-all duration-500`}
                    style={{
                      width: `${Math.min(storageInfo.usagePercent ?? 0, 100)}%`,
                    }}
                  />
                </div>

                {/* 存储信息 */}
                <div className="flex justify-between items-center text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>
                    {formatFileSize(storageInfo.used)}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    {(storageInfo.usagePercent ?? 0).toFixed(1)}%
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {formatFileSize(storageInfo.total)}
                  </span>
                </div>

                {/* 配额超额警告 */}
                {storageInfo.usagePercent > 100 && (
                  <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-500 font-medium">
                      {t('⚠️ 存储空间已超额')}
                    </p>
                    <p className="text-xs text-red-400 mt-1">
                      {t('升级会员可扩展存储空间')}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() =>
                        window.dispatchEvent(new CustomEvent(QUOTA_GUIDE_EVENT))
                      }
                    >
                      {t('去购买')}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('无法加载存储信息')}
              </p>
            )}
          </div>

          {/* 帮助引导入口 - 移动端隐藏 */}
          {!isMobile && (
            <div className="px-4 mb-2">
              <Button
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={openTourCenter}
                title={t('查看引导中心')}
              >
                <span className="relative">
                  <HelpCircle size={18} />
                  {isTourActive && (
                    <span
                      className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-pulse"
                      style={{ background: 'var(--primary-500)' }}
                    />
                  )}
                </span>
                <span
                  className="font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('帮助引导')}
                </span>
                {isTourActive && (
                  <Tag variant="primary" className="ml-auto">
                    {t('进行中')}
                  </Tag>
                )}
              </Button>
            </div>
          )}

          {/* 用户信息区域 */}
          <div
            className="p-4 border-t"
            style={{
              borderColor: 'var(--border-default)',
              paddingBottom:
                'calc(var(--space-4) + env(safe-area-inset-bottom, 0px))',
            }}
          >
            <div className="relative" ref={userMenuRef}>
              <Menu open={showUserMenu} onOpenChange={setShowUserMenu}>
                <Menu.Trigger asChild>
                  <button className="w-full flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-300 bg-transparent border-none text-left">
                    <UserAvatar
                      avatar={user?.avatar}
                      name={
                        user?.nickname ||
                        user?.username ||
                        user?.email ||
                        undefined
                      }
                      size={40}
                      className="shadow-[0_2px_8px_rgba(99,102,241,0.3)]"
                    />

                    {/* 用户信息 */}
                    <div className="flex-1 min-w-0 text-left">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <TruncateText>
                          {String(
                            user?.nickname ||
                              user?.username ||
                              user?.email ||
                              t('用户')
                          )}
                        </TruncateText>
                        <MembershipBadge />
                      </p>
                      <p
                        className="text-xs truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {loading
                          ? t('加载中...')
                          : user?.role?.name
                            ? getRoleDisplayName(user.role.name)
                            : t('未知角色')}
                      </p>
                    </div>

                    {/* 下拉箭头 */}
                    <ChevronDown
                      size={16}
                      className={`transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--text-muted)' }}
                    />
                  </button>
                </Menu.Trigger>

                <Menu.Content
                  align="end"
                  side="top"
                  sideOffset={8}
                  style={{ width: userMenuWidth || undefined }}
                >
                  <Menu.Item
                    icon={<Settings size={16} />}
                    onClick={() => {
                      setShowUserMenu(false);
                      setSidebarOpen(false);
                      navigate('/profile');
                    }}
                  >
                    {t('个人设置')}
                  </Menu.Item>
                  <Menu.Separator />
                  <Menu.Item
                    variant="danger"
                    icon={<LogOut size={16} />}
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowLogoutConfirm(true);
                    }}
                  >
                    {t('退出登录')}
                  </Menu.Item>
                </Menu.Content>
              </Menu>
            </div>
          </div>
        </div>
      </aside>

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 顶部导航栏 */}
        <header
          className="h-14 lg:h-16 flex items-center justify-between px-4 lg:px-8 relative z-30"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--border-default)',
            paddingTop: 'env(safe-area-inset-top, 0px)',
          }}
        >
          {/* 左侧：菜单按钮 */}
          <div className="flex items-center gap-4 flex-1">
            {/* 移动端菜单按钮 */}
            <Button
              variant="secondary"
              size="md"
              icon={MenuIcon}
              className="lg:hidden !w-[28px] !h-[28px] !p-0"
              onClick={() => setSidebarOpen(true)}
            />
            {/* 移动端回到 CAD 编辑器按钮 */}
            <Button
              variant="secondary"
              size="md"
              icon={Home}
              aria-label={t('回到CAD编辑器')}
              className="lg:hidden !w-[28px] !h-[28px] !p-0"
              onClick={() => navigate('/cad-editor')}
            />
          </div>

          {/* 右侧工具栏 */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* 时间显示 */}
            <div
              className="hidden md:flex flex-col items-end mr-4 px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <span
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {formattedTime}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {formattedDate}
              </span>
            </div>

            {/* 语言切换 */}
            <div className="p-0.5">
              <LanguageSwitcher />
            </div>

            {/* 主题切换 */}
            <div className="p-0.5">
              <ThemeToggle />
            </div>

            {/* 系统设置 */}
            {hasPermission(SystemPermission.SYSTEM_CONFIG_READ) && (
              <div className="p-0.5">
                <Tooltip content={t('系统设置')}>
                  <Button
                    variant="secondary"
                    className="relative rounded-xl transition-all duration-300 ease-out
                               hover:scale-110 active:scale-95
                               hover:bg-[var(--bg-tertiary)]
                               group"
                    aria-label={t('系统设置')}
                    onClick={() => navigate('/runtime-config')}
                  >
                    <Settings2
                      size={20}
                      className="text-[var(--text-tertiary)] group-hover:text-[var(--accent-500)]"
                    />
                  </Button>
                </Tooltip>
              </div>
            )}
          </div>
        </header>

        {/* 管理员口令即将到期提示条（#416 等保 8.1.4.1 b)）：距到期 ≤14 天软提示，不拦截。
            后端 /auth/profile 与登录响应均下发 passwordExpiringSoon（仅 ADMIN 角色有值），
            refreshUser 后保持同步；到期即由后端 JwtStrategy 强制锁定至 /admin/change-password。 */}
        {user?.role?.name === 'ADMIN' &&
          (user as { passwordExpiringSoon?: boolean }).passwordExpiringSoon && (
            <div
              className="px-4 py-2 animate-slide-up"
              style={{
                background: isDark
                  ? 'var(--warning-dim)'
                  : 'var(--warning-light)',
                borderBottom: `1px solid ${isDark ? 'var(--warning)' : 'var(--warning-dim)'}`,
              }}
            >
              <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
                <ShieldCheck
                  size={18}
                  className="flex-shrink-0"
                  style={{ color: 'var(--warning)' }}
                />
                <span className="text-sm" style={{ color: 'var(--warning)' }}>
                  {t('您的管理员密码即将到期，请提前修改')}
                </span>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => navigate('/admin/change-password')}
                >
                  {t('修改密码')}
                </Button>
              </div>
            </div>
          )}

        {/* 系统公告横幅 */}
        {runtimeConfig.systemNotice && (
          <div
            className="px-4 py-2.5 animate-slide-up"
            style={{
              background: isDark
                ? 'var(--warning-dim)'
                : 'var(--warning-light)',
              borderBottom: `1px solid ${isDark ? 'var(--warning)' : 'var(--warning-dim)'}`,
            }}
          >
            <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
              <svg
                className="w-5 h-5 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: 'var(--warning)' }}
              >
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm" style={{ color: 'var(--warning)' }}>
                {runtimeConfig.systemNotice}
              </span>
            </div>
          </div>
        )}

        {/* 页面内容 */}
        <main
          className="flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden"
          style={{
            background: 'transparent',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <div className="flex-1 min-h-0 animate-fade-in">{children}</div>
        </main>
      </div>

      {/* 退出登录确认对话框 */}
      <Modal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title={t('确认退出登录')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowLogoutConfirm(false)}
              disabled={isLoggingOut}
            >
              {t('取消')}
            </Button>
            <Button
              variant="danger"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('退出中...')}
                </span>
              ) : (
                t('确认退出')
              )}
            </Button>
          </>
        }
      >
        <div className="text-center py-4">
          <div
            className="mx-auto flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'var(--error-light)' }}
          >
            <LogOut size={28} style={{ color: 'var(--error)' }} />
          </div>
          <h3
            className="text-xl font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('确认退出登录')}
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {$t(
              '您确定要退出 {appName} 吗？退出后需要重新登录才能访问系统功能。',
              { appName }
            )}
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default Layout;
