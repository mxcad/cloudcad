import type React from 'react';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAuth } from '../contexts/AuthContext';
import { useIsMobile } from '../lib/useIsMobile';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission } from '../constants/permissions';
import { useBrandConfig } from '../contexts/BrandContext';
import { getAppBrandConfig } from '../constants/appConfig';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Tag } from './ui/Tag';
import { TruncateText } from './ui/TruncateText';
import { UserAvatar } from './ui/UserAvatar';
import { formatFileSize } from '../utils/fileUtils';
import { ThemeToggle } from './ThemeToggle';
import { NoticeBellDropdown } from './notice';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useTheme } from '../contexts/ThemeContext';
import { Logo } from './Logo';
import { InteractiveBackground } from './InteractiveBackground';
import { useTour } from '../contexts/TourContext';
import { useStorageQuota } from '../hooks/useStorageQuota';
import {
  useConversionQueueStore,
  countActiveTasks,
} from '../stores/conversionQueueStore';
import { toggleFileQueuePanel } from './conversion-panel/ConversionPanel';
import MembershipBadge from './billing/MembershipBadge';
import { t, $t, i18nScope } from '@/languages';
import { QUOTA_GUIDE_EVENT } from '@/utils/quotaUpgradeGuide';

// Lucide 图标导入（菜单图标已迁入 config/navigation 单一事实源，此处仅保留非菜单图标）
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { Settings } from 'lucide-react';
import { Settings2 } from 'lucide-react';
import { useRuntimeConfig } from '../contexts/RuntimeConfigContext';
import { LogOut } from 'lucide-react';
import {
  Menu as MenuIcon,
  X,
  HardDrive,
  ChevronDown,
  HelpCircle,
  Home,
  ListTodo,
} from 'lucide-react';
import { ROUTE_DECLARATIONS } from '../config/navigation';
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
  const { profile: brandProfile } = useBrandConfig();
  const { isDark } = useTheme();
  const { config: publicConfig } = useRuntimeConfig();
  const { isActive: isTourActive, openTourCenter } = useTour();
  const isMobile = useIsMobile();

  // UI 状态（必须在条件返回之前调用所有 Hooks）
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userMenuWidth, setUserMenuWidth] = useState(0);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 存储空间
  const { data: storageInfo } = useStorageQuota();

  // 文件队列：进行中任务数（角标）+ 面板当前是否展开（按钮高亮）。
  // 面板本体在 App 层按路由挂载，这里只读 store 做入口指示。
  const queueActiveCount = useConversionQueueStore((s) =>
    countActiveTasks(s.tasks)
  );
  const queuePanelOpen = useConversionQueueStore((s) => !s.collapsed);

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

  // 导航菜单项配置
  // 菜单项由路由声明（ROUTE_DECLARATIONS，单一事实源）派生：权限映射与路由守卫
  // （App）共用同一份，杜绝「菜单可见但路由 403」的漂移。仅带 icon 的条目进菜单
  // （/admin/stats、/runtime-config 等受守卫路由无 icon，不进菜单）。visible 按
  // permission 计算：无 permission = 仅需登录（恒可见）；单权限 = hasPermission；
  // 多权限 = 任一满足。
  const menuItems = useMemo(
    () =>
      ROUTE_DECLARATIONS.filter((e) => e.icon).map((e) => ({
        section: e.section!,
        to: e.path,
        icon: e.icon!,
        label: t(e.labelKey!),
        dataTour: e.dataTour,
        visible: e.permission
          ? Array.isArray(e.permission)
            ? hasAnyPermission(e.permission)
            : hasPermission(e.permission)
          : true,
      })),
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

  // 品牌名走唯一出口：运行时单项键（brandTitle）/ 整块 / config.json / 内置默认
  // 逐层回落，不再直读原始 config.json（#499）
  const appName = getAppBrandConfig().title;

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
              {/* Logo 组件 - 仅图标模式（文字由下方品牌块渲染） */}
              <Logo animated={false} />

              {/* 品牌名称 */}
              <div className="flex flex-col">
                {/* 主标题 */}
                <span
                  className="text-[15px] font-bold tracking-tight leading-none"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {appName}
                </span>
                {/* 副标题（品牌配置 subtitle） */}
                <span
                  className="text-[11px] font-medium tracking-wide mt-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {brandProfile.subtitle}
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
                .filter((item) => item.section === 'main' && item.visible)
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
            {menuItems.some(
              (item) => item.section === 'admin' && item.visible
            ) && (
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
                  .filter((item) => item.section === 'admin' && item.visible)
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
            {/* 时间显示（独立组件：每秒跳动的 state 不再拖累整棵侧边栏重渲染） */}
            <SidebarClock />

            {/* 文件队列入口（#497：悬浮药丸已取消，面板显隐只剩此按钮 + CAD 命令 Mx_ToggleFileQueue） */}
            <div className="p-0.5">
              <Tooltip content={t('文件队列')}>
                <Button
                  variant="secondary"
                  className={`relative rounded-xl transition-all duration-300 ease-out
                             hover:scale-110 active:scale-95
                             hover:bg-[var(--bg-tertiary)] group`}
                  aria-label={t('文件队列')}
                  aria-pressed={queuePanelOpen}
                  onClick={() => toggleFileQueuePanel()}
                >
                  <ListTodo
                    size={20}
                    className={`group-hover:text-[var(--accent-500)] ${
                      queuePanelOpen
                        ? 'text-[var(--accent-500)]'
                        : 'text-[var(--text-tertiary)]'
                    }`}
                  />
                  {queueActiveCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 flex items-center justify-center
                                 min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-semibold
                                 text-[var(--text-inverse)] bg-[var(--primary-500)]"
                    >
                      {queueActiveCount}
                    </span>
                  )}
                </Button>
              </Tooltip>
            </div>

            {/* 通知铃铛（通知中心入口：取代原常驻公告横幅） */}
            <NoticeBellDropdown />

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

        {/* 弱口令软提示（仅 ADMIN）：后端 passwordUnchanged = isAdmin && passwordChangedAt === null。
            所有改密入口都过 assertPasswordPolicy（拒绝弱口令），故「当前口令可能过弱」
            ⇔「部署初始口令从未改过」，无需新增字段/迁移即可判定。软提示不拦截、不设关闭按钮，
            改密成功即自动消失（与上方到期横幅同形态）。点击深链 /profile?section=password
            直达修改密码子页（Profile 页按 section 参数初始化子视图）。
            文案按安全模式分档：secure 模式初始口令不合规、需立即改；normal 模式初始口令
            是正当默认（DEFAULT_ADMIN_PASSWORD），改成建议式而非合规式，避免误导。 */}
        {user?.role?.name === 'ADMIN' &&
          (user as { passwordUnchanged?: boolean }).passwordUnchanged && (
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
                <ShieldAlert
                  size={18}
                  className="flex-shrink-0"
                  style={{ color: 'var(--warning)' }}
                />
                <span className="text-sm" style={{ color: 'var(--warning)' }}>
                  {publicConfig.securityMode === 'secure'
                    ? t('您当前仍在使用首次部署设置的初始密码，请立即修改')
                    : t('本地测试模式，建议在生产部署前改为强口令')}
                </span>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => navigate('/profile?section=password')}
                >
                  {t('去修改')}
                </Button>
              </div>
            </div>
          )}

        {/* 安全模式状态横幅（仅 SYSTEM_CONFIG_READ 且处于普通模式时展示）：全局只读提示 + 切换入口，
            切换在运行时配置页完成。securityMode 是公开配置项，读公开配置缓存无需额外请求。
            已收紧到安全模式后不再展示——此时横幅只剩「安全模式：安全模式」式重复告知；
            需要确认当前模式可去运行时配置页，那里有完整横幅与切换按钮。 */}
        {hasPermission(SystemPermission.SYSTEM_CONFIG_READ) &&
          publicConfig.securityMode !== 'secure' && (
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
                <ShieldAlert
                  size={18}
                  className="flex-shrink-0"
                  style={{ color: 'var(--warning)' }}
                />
                <span className="text-sm" style={{ color: 'var(--warning)' }}>
                  {t('安全模式：{mode}', { mode: t('普通模式') })}
                  {t('· 限制宽松，适合本地与测试环境')}
                </span>
                <Link
                  to="/runtime-config"
                  className="text-sm font-medium hover:underline"
                  style={{ color: 'var(--primary-500)' }}
                >
                  {t('前往配置')}
                </Link>
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

/** 顶栏时钟：每秒跳动的 state 收在本组件内，不拖累 Layout 整树重渲染 */
function SidebarClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  // locale 取运行时激活语言（同 DatePicker）：硬编码 'zh-CN' 会让 en-US/ko-KR 界面显示中文星期与月份
  const locale = i18nScope.activeLanguage;
  const formattedTime = now.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const formattedDate = now.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
  return (
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
  );
}
