import type React from 'react';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAuth } from '../contexts/AuthContext';
import { useRuntimeConfig } from '../contexts/RuntimeConfigContext';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission } from '../constants/permissions';
import { useBrandConfig } from '../contexts/BrandContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Tag } from './ui/Tag';
import { TruncateText } from './ui/TruncateText';
import { formatFileSize } from '../utils/fileUtils';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useTheme } from '../contexts/ThemeContext';
import { Logo } from './Logo';
import { InteractiveBackground } from './InteractiveBackground';
import { useTour } from '../contexts/TourContext';
import { useStorageQuota } from '../hooks/useStorageQuota';
import MembershipBadge from './billing/MembershipBadge';

// Lucide 图标导入
import { LayoutDashboard } from 'lucide-react';
import { FolderOpen } from 'lucide-react';
import { FileText } from 'lucide-react';
import { Users } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { Type } from 'lucide-react';
import { Activity } from 'lucide-react';
import { ScrollText } from 'lucide-react';
import { Settings } from 'lucide-react';
import { Settings2 } from 'lucide-react';
import { LogOut } from 'lucide-react';
import { Menu as MenuIcon, X, HardDrive, ChevronDown, HelpCircle, Library, Share2, User, DollarSign } from 'lucide-react';
import { Menu } from './ui/Menu';

interface NavItemProps {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active: boolean;
  badge?: number;
  dataTour?: string;
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
}) => {
  const { isDark } = useTheme();

  return (
    <Link
      to={to}
      data-tour={dataTour}
      className={`
        group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ease-out
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
  const { hasPermission } = usePermission();
  const { config: runtimeConfig } = useRuntimeConfig();
  const { config: brandConfig } = useBrandConfig();
  const { isDark } = useTheme();
  const { isActive: isTourActive, openTourCenter } = useTour();

  // UI 状态（必须在条件返回之前调用所有 Hooks）
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userMenuWidth, setUserMenuWidth] = useState(0);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 存储空间
  const { data: storageInfo, isLoading: storageLoading } = useStorageQuota();

  // 角色名称映射
  const getRoleDisplayName = useCallback((roleName: string): string => {
    const roleMap: Record<string, string> = {
      ADMIN: '系统管理员',
      USER_MANAGER: '用户管理员',
      FONT_MANAGER: '字体管理员',
      USER: '普通用户',
      MANAGER: '项目经理',
      GUEST: '访客',
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
        label: '仪表盘',
        visible: true,
      },
      {
        to: '/projects',
        icon: FolderOpen,
        label: '项目管理',
        visible: true,
        dataTour: 'sidebar-projects',
      },
      {
        to: '/personal-space',
        icon: FileText,
        label: '我的图纸',
        visible: true,
        dataTour: 'sidebar-personal-space',
      },
      {
        to: '/shares',
        icon: Share2,
        label: '分享管理',
        visible: true,
      },
      {
        to: '/profile',
        icon: User,
        label: '个人资料',
        visible: true,
      },
      {
        to: '/library',
        icon: Library,
        label: '公共资源库',
        visible:
          hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE) ||
          hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE),
      },
      {
        to: '/font-library',
        icon: Type,
        label: '字体库',
        visible: hasPermission(SystemPermission.SYSTEM_FONT_READ),
      },
      {
        to: '/users',
        icon: Users,
        label: '用户管理',
        visible: hasPermission(SystemPermission.SYSTEM_USER_READ),
      },
      {
        to: '/roles',
        icon: ShieldCheck,
        label: '角色权限',
        visible: hasPermission(SystemPermission.SYSTEM_ROLE_READ),
        dataTour: 'sidebar-roles',
      },
      {
        to: '/admin/billing',
        icon: DollarSign,
        label: '支付管理',
        visible: hasPermission(SystemPermission.SYSTEM_CONFIG_READ),
      },
      {
        to: '/audit-logs',
        icon: ScrollText,
        label: '审计日志',
        visible: hasPermission(SystemPermission.SYSTEM_ADMIN),
      },
      {
        to: '/system-monitor',
        icon: Activity,
        label: '系统监控',
        visible: hasPermission(SystemPermission.SYSTEM_MONITOR),
      },
    ],
    [hasPermission]
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
          fixed lg:static inset-y-0 left-0 z-50 w-72 transform transition-all duration-300 ease-out
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
          <div className="p-4">
            <Link
              to="/dashboard"
              className="flex items-center gap-3 group p-2 -m-2 rounded-xl transition-colors hover:bg-[var(--bg-tertiary)]"
              title={appName}
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
                  CAD 协同平台
                </span>
              </div>
            </Link>

            {/* 移动端关闭按钮 */}
            <Button
              variant="secondary"
              size="sm"
              icon={X}
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          </div>

          {/* 导航菜单 */}
          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            <div className="pb-4">
              <p
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                主菜单
              </p>
              {menuItems
                .filter((item) => item.visible)
                .slice(0, 5)
                .map((item) => (
                  <NavItem
                    key={item.to}
                    {...item}
                    active={isActiveRoute(item.to)}
                  />
                ))}
            </div>

            {/* 管理菜单 */}
            {menuItems.some((item, idx) => idx >= 5 && item.visible) && (
              <div
                className="pt-2 border-t"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <p
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  系统管理
                </p>
                {menuItems
                  .filter((item, idx) => idx >= 5 && item.visible)
                  .map((item) => (
                    <NavItem
                      key={item.to}
                      {...item}
                      active={isActiveRoute(item.to)}
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
                存储空间
              </span>
            </div>

            {storageLoading ? (
              <div className="space-y-2">
                <div className="h-2 rounded-full skeleton-theme" />
                <div className="h-3 w-20 rounded skeleton-theme" />
              </div>
            ) : storageInfo ? (
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
                      ⚠️ 存储空间已超额
                    </p>
                    <p className="text-xs text-red-400 mt-1">
                      请联系管理员增加配额或删除不需要的文件
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                无法加载存储信息
              </p>
            )}
          </div>

          {/* 帮助引导入口 */}
          <div className="px-4 mb-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-3"
              onClick={openTourCenter}
              title="查看引导中心"
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
              <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                帮助引导
              </span>
              {isTourActive && (
                <Tag variant="primary" className="ml-auto">进行中</Tag>
              )}
            </Button>
          </div>

          {/* 用户信息区域 */}
          <div
            className="p-4 border-t"
            style={{ borderColor: 'var(--border-default)' }}
          >
            <div className="relative" ref={userMenuRef}>
              <Menu open={showUserMenu} onOpenChange={setShowUserMenu}>
                <Menu.Trigger asChild>
                  <button
                    className="w-full flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-300 bg-transparent border-none text-left"
                  >
                    {/* 头像 */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                      style={{
                        background:
                          'linear-gradient(135deg, var(--primary-400), var(--accent-400))',
                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                      }}
                    >
                      {user?.avatar ? (
                        <img
                          src={user.avatar}
                          alt="Avatar"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      ) : null}
                      {!user?.avatar && (
                        <span className="text-sm font-semibold text-white">
                          {(user?.nickname || user?.username || user?.email || 'U')
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* 用户信息 */}
                    <div className="flex-1 min-w-0 text-left">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <TruncateText>
                          {String(user?.nickname ||
                            user?.username ||
                            user?.email ||
                            '用户')}
                        </TruncateText>
                        <MembershipBadge />
                      </p>
                      <p
                        className="text-xs truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {loading
                          ? '加载中...'
                          : user?.role?.name
                            ? getRoleDisplayName(user.role.name)
                            : '未知角色'}
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

                <Menu.Content align="end" side="top" sideOffset={8} style={{ width: userMenuWidth || undefined }}>
                  <Menu.Item
                    icon={<Settings size={16} />}
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate('/profile');
                    }}
                  >
                    个人设置
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
                    退出登录
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
          className="h-16 flex items-center justify-between px-6 lg:px-8 relative z-30"
          style={{
            background: isDark
              ? 'rgba(26, 29, 33, 0.8)'
              : 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          {/* 左侧：菜单按钮 */}
          <div className="flex items-center gap-4 flex-1">
            {/* 移动端菜单按钮 */}
            <Button
              variant="secondary"
              size="sm"
              icon={MenuIcon}
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            />
          </div>

          {/* 右侧工具栏 */}
          <div className="flex items-center gap-2">
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
            {/* <div className="p-0.5">
              <LanguageSwitcher />
            </div> */}

            {/* 主题切换 */}
            <div className="p-0.5">
              <ThemeToggle />
            </div>

            {/* 系统设置 */}
            {hasPermission(SystemPermission.SYSTEM_CONFIG_READ) && (
              <div className="p-0.5">
                <Tooltip content="系统设置">
                  <Button
                    variant="secondary"
                    className="relative rounded-xl transition-all duration-300 ease-out
                               hover:scale-110 active:scale-95
                               hover:bg-[var(--bg-tertiary)]
                               group"
                    aria-label="系统设置"
                    onClick={() => navigate('/runtime-config')}
                  >
                    <Settings2 size={20} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent-500)]" />
                  </Button>
                </Tooltip>
              </div>
            )}
          </div>
        </header>

        {/* 系统公告横幅 */}
        {runtimeConfig.systemNotice && (
          <div
            className="px-4 py-2.5 animate-slide-up"
            style={{
              background: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb',
              borderBottom: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.3)' : '#fef3c7'}`,
            }}
          >
            <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
              <svg
                className="w-5 h-5 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: isDark ? '#f59e0b' : '#d97706' }}
              >
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span
                className="text-sm"
                style={{ color: isDark ? '#fbbf24' : '#92400e' }}
              >
                {runtimeConfig.systemNotice}
              </span>
            </div>
          </div>
        )}

        {/* 页面内容 */}
        <main
          className="flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden"
          style={{ background: 'transparent' }}
        >
          <div className="flex-1 min-h-0 animate-fade-in">{children}</div>
        </main>
      </div>

      {/* 退出登录确认对话框 */}
      <Modal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="确认退出登录"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowLogoutConfirm(false)}
              disabled={isLoggingOut}
            >
              取消
            </Button>
            <Button
              variant="danger"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  退出中...
                </span>
              ) : (
                '确认退出'
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
            确认退出登录
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            您确定要退出 {appName} 吗？退出后需要重新登录才能访问系统功能。
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default Layout;
