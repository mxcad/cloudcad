import type React from 'react';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { UserDto, StorageInfoDto } from '../types/api-client';
import { projectsApi } from '../services/projectsApi';
import { useAuth } from '../contexts/AuthContext';
import { useRuntimeConfig } from '../contexts/RuntimeConfigContext';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission } from '../constants/permissions';
import { APP_NAME, APP_LOGO } from '../constants/appConfig';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { TruncateText } from './ui/TruncateText';
import { formatFileSize } from '../utils/fileUtils';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '../contexts/ThemeContext';
import { Logo } from './Logo';

// Lucide 图标导入
import LayoutDashboard from 'lucide-react/dist/esm/icons/layout-dashboard';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Users from 'lucide-react/dist/esm/icons/users';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import Type from 'lucide-react/dist/esm/icons/type';
import Activity from 'lucide-react/dist/esm/icons/activity';
import Settings from 'lucide-react/dist/esm/icons/settings';
import Settings2 from 'lucide-react/dist/esm/icons/settings-2';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import Menu from 'lucide-react/dist/esm/icons/menu';
import X from 'lucide-react/dist/esm/icons/x';
import Search from 'lucide-react/dist/esm/icons/search';
import Bell from 'lucide-react/dist/esm/icons/bell';
import HardDrive from 'lucide-react/dist/esm/icons/hard-drive';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import Layers from 'lucide-react/dist/esm/icons/layers';
import History from 'lucide-react/dist/esm/icons/history';
import Star from 'lucide-react/dist/esm/icons/star';

interface NavItemProps {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active: boolean;
  badge?: number;
}

/**
 * 导航项组件 - 带有精美动画效果
 */
const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, active, badge }) => {
  const { isDark } = useTheme();
  
  return (
    <Link
      to={to}
      className={`
        group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ease-out
        relative overflow-hidden
        ${active 
          ? isDark 
            ? 'text-white shadow-lg' 
            : 'text-white shadow-md shadow-primary/30'
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
        }
      `}
      style={active ? {
        background: 'linear-gradient(135deg, var(--primary-600), var(--primary-500))',
      } : {}}
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
      <div className={`
        relative z-10 p-2 rounded-lg transition-all duration-300
        ${active 
          ? 'bg-white/20' 
          : 'bg-[var(--bg-tertiary)] group-hover:bg-[var(--bg-secondary)]'
        }
      `}>
        <Icon size={18} className={active ? 'text-white' : 'text-[var(--text-tertiary)] group-hover:text-[var(--primary-500)]'} />
      </div>
      
      {/* 标签 */}
      <span className="relative z-10 font-medium text-sm">{label}</span>
      
      {/* 徽章 */}
      {badge !== undefined && badge > 0 && (
        <span className={`
          relative z-10 ml-auto text-xs font-semibold px-2 py-0.5 rounded-full
          ${active 
            ? 'bg-white/30 text-white' 
            : 'bg-[var(--primary-100)] text-[var(--primary-600)]'
          }
        `}>
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
export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user, loading } = useAuth();
  const { hasPermission } = usePermission();
  const { config: runtimeConfig } = useRuntimeConfig();
  const { isDark } = useTheme();
  
  // UI 状态
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [notifications] = useState(3); // 示例通知数
  
  // 存储空间状态
  const [storageInfo, setStorageInfo] = useState<StorageInfoDto | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);

  // 角色名称映射
  const getRoleDisplayName = useCallback((roleName: string): string => {
    const roleMap: Record<string, string> = {
      ADMIN: '系统管理员',
      USER: '普通用户',
      MANAGER: '项目经理',
      GUEST: '访客',
    };
    return roleMap[roleName] || roleName;
  }, []);

  // 获取存储空间信息
  useEffect(() => {
    if (user && !loading) {
      setStorageLoading(true);
      projectsApi
        .getStorageInfo()
        .then((response) => {
          if (response.data) {
            setStorageInfo(response.data);
          }
        })
        .catch(() => {
          // 静默处理错误
        })
        .finally(() => {
          setStorageLoading(false);
        });
    }
  }, [user, loading]);

  // 时钟更新
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 处理登出
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login');
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
      hour12: false 
    });
  }, [currentTime]);

  const formattedDate = useMemo(() => {
    return currentTime.toLocaleDateString('zh-CN', { 
      month: 'short', 
      day: 'numeric',
      weekday: 'short'
    });
  }, [currentTime]);

  // 导航菜单项配置
  const menuItems = useMemo(() => [
    { to: '/dashboard', icon: LayoutDashboard, label: '仪表盘', visible: true },
    { to: '/projects', icon: FolderOpen, label: '项目管理', visible: true },
    { to: '/personal-space', icon: FileText, label: '我的图纸', visible: true },
    { to: '/recent', icon: History, label: '最近访问', visible: true },
    { to: '/favorites', icon: Star, label: '收藏夹', visible: true },
    { to: '/font-library', icon: Type, label: '字体库', visible: 
      hasPermission(SystemPermission.SYSTEM_FONT_READ) },
    { to: '/users', icon: Users, label: '用户管理', visible: 
      hasPermission(SystemPermission.SYSTEM_USER_READ) },
    { to: '/roles', icon: ShieldCheck, label: '角色权限', visible: 
      hasPermission(SystemPermission.SYSTEM_ROLE_READ) },
    { to: '/system-monitor', icon: Activity, label: '系统监控', visible: 
      hasPermission(SystemPermission.SYSTEM_MONITOR) },
  ], [hasPermission]);

  // 判断当前导航项是否活跃
  const isActiveRoute = useCallback((path: string): boolean => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname === '/';
    }
    if (path === '/projects') {
      return location.pathname === '/projects' || location.pathname.startsWith('/projects/');
    }
    if (path === '/personal-space') {
      return location.pathname === '/personal-space' || location.pathname.startsWith('/personal-space/');
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  }, [location.pathname]);

  // 存储空间使用率颜色
  const storageColor = useMemo(() => {
    if (!storageInfo) return 'from-emerald-500 to-emerald-600';
    if (storageInfo.usagePercent > 90) return 'from-red-500 to-red-600';
    if (storageInfo.usagePercent > 70) return 'from-amber-500 to-amber-600';
    return 'from-emerald-500 to-emerald-600';
  }, [storageInfo]);

  return (
    <div 
      className="flex h-screen overflow-hidden font-[var(--font-family-base)]"
      style={{ background: 'var(--bg-primary)' }}
      onClick={() => {
        if (showSettings) setShowSettings(false);
        if (showUserMenu) setShowUserMenu(false);
      }}
    >
      {/* 移动端侧边栏遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden animate-fade-in"
          style={{ background: 'var(--bg-overlay)', backdropFilter: 'blur(4px)' }}
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
          boxShadow: sidebarOpen ? 'var(--shadow-2xl)' : 'none'
        }}
      >
        <div className="flex flex-col h-full">
          {/* Logo 区域 */}
          <div className="p-4">
            <Link 
              to="/dashboard" 
              className="flex items-center gap-3 group p-2 -m-2 rounded-xl transition-colors hover:bg-[var(--bg-tertiary)]"
              title={APP_NAME}
            >
              {/* Logo 组件 - 仅图标模式 */}
              <Logo size="sm" iconOnly={true} animated={false} />
              
              {/* 品牌名称 */}
              <div className="flex flex-col">
                {/* 主标题 */}
                <span 
                  className="text-[15px] font-bold tracking-tight leading-none"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {APP_NAME}
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
            <button
              className="lg:hidden p-2 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={20} style={{ color: 'var(--text-tertiary)' }} />
            </button>
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
              <div className="pt-2 border-t" style={{ borderColor: 'var(--border-default)' }}>
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
              border: '1px solid var(--border-default)'
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <HardDrive size={16} style={{ color: 'var(--text-tertiary)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
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
                    style={{ width: `${Math.min(storageInfo.usagePercent, 100)}%` }}
                  />
                </div>
                
                {/* 存储信息 */}
                <div className="flex justify-between items-center text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>
                    {formatFileSize(storageInfo.used)}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    {storageInfo.usagePercent.toFixed(1)}%
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {formatFileSize(storageInfo.total)}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                无法加载存储信息
              </p>
            )}
          </div>

          {/* 用户信息区域 */}
          <div 
            className="p-4 border-t"
            style={{ borderColor: 'var(--border-default)' }}
          >
            <div className="relative">
              <button
                className="w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-300 hover:bg-[var(--bg-tertiary)]"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUserMenu(!showUserMenu);
                }}
              >
                {/* 头像 */}
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, var(--primary-400), var(--accent-400))',
                    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
                  }}
                >
                  {user?.avatar ? (
                    <img 
                      src={user.avatar} 
                      alt="Avatar" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-white">
                      {(user?.nickname || user?.username || user?.email || 'U').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                
                {/* 用户信息 */}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    <TruncateText>
                      {user?.nickname || user?.username || user?.email || '用户'}
                    </TruncateText>
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {user?.role?.name ? getRoleDisplayName(user.role.name) : '加载中...'}
                  </p>
                </div>
                
                {/* 下拉箭头 */}
                <ChevronDown 
                  size={16} 
                  className={`transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--text-muted)' }}
                />
              </button>
              
              {/* 用户下拉菜单 */}
              {showUserMenu && (
                <div 
                  className="absolute bottom-full left-0 right-0 mb-2 rounded-xl overflow-hidden animate-scale-in"
                  style={{ 
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    boxShadow: 'var(--shadow-xl)'
                  }}
                >
                  <Link
                    to="/profile"
                    className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Settings size={16} />
                    个人设置
                  </Link>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--error-dim)]"
                    style={{ color: 'var(--error)' }}
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowLogoutConfirm(true);
                    }}
                  >
                    <LogOut size={16} />
                    退出登录
                  </button>
                </div>
              )}
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
            background: isDark ? 'rgba(26, 29, 33, 0.8)' : 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          {/* 左侧：菜单按钮 + 搜索 */}
          <div className="flex items-center gap-4 flex-1">
            {/* 移动端菜单按钮 */}
            <button
              className="lg:hidden p-2 -ml-2 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} style={{ color: 'var(--text-secondary)' }} />
            </button>

            {/* 搜索框 */}
            <div className="flex-1 max-w-xl hidden sm:block">
              <div 
                className="relative group"
              >
                <Search
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="text"
                  placeholder="搜索项目、图纸、图块..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl text-sm transition-all duration-200 outline-none"
                  style={{ 
                    background: 'var(--bg-tertiary)',
                    border: '1px solid transparent',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--primary-500)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'transparent';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                {/* 快捷键提示 */}
                <kbd 
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-xs hidden lg:block"
                  style={{ 
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-default)'
                  }}
                >
                  ⌘K
                </kbd>
              </div>
            </div>
          </div>

          {/* 右侧工具栏 */}
          <div className="flex items-center gap-2">
            {/* 时间显示 */}
            <div 
              className="hidden md:flex flex-col items-end mr-4 px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {formattedTime}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {formattedDate}
              </span>
            </div>

            {/* 通知按钮 */}
            <button
              className="relative p-2.5 rounded-xl transition-all duration-200 hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <Bell size={20} />
              {notifications > 0 && (
                <span 
                  className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center"
                  style={{ 
                    background: 'var(--error)',
                    color: 'white'
                  }}
                >
                  {notifications > 9 ? '9+' : notifications}
                </span>
              )}
            </button>

            {/* 主题切换 */}
            <div className="p-0.5">
              <ThemeToggle />
            </div>

            {/* 设置按钮 */}
            <div className="relative">
              <button
                className={`
                  p-2.5 rounded-xl transition-all duration-200
                  ${showSettings 
                    ? 'text-[var(--primary-500)] bg-[var(--primary-50)]' 
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]'
                  }
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettings(!showSettings);
                }}
              >
                <Settings2 size={20} />
              </button>
              
              {/* 设置下拉菜单 */}
              {showSettings && (
                <div 
                  className="absolute right-0 mt-2 w-52 rounded-xl overflow-hidden animate-slide-up z-50"
                  style={{ 
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    boxShadow: 'var(--shadow-xl)'
                  }}
                >
                  <Link
                    to="/profile"
                    className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={() => setShowSettings(false)}
                  >
                    <Settings size={16} />
                    个人资料
                  </Link>
                  {hasPermission(SystemPermission.SYSTEM_CONFIG_READ) && (
                    <Link
                      to="/runtime-config"
                      className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--bg-tertiary)]"
                      style={{ color: 'var(--text-secondary)' }}
                      onClick={() => setShowSettings(false)}
                    >
                      <Settings2 size={16} />
                      系统设置
                    </Link>
                  )}
                  <div 
                    className="h-px mx-4"
                    style={{ background: 'var(--border-subtle)' }}
                  />
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--error-dim)]"
                    style={{ color: 'var(--error)' }}
                    onClick={(e) => {
                      e.preventDefault();
                      setShowLogoutConfirm(true);
                      setShowSettings(false);
                    }}
                  >
                    <LogOut size={16} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* 系统公告横幅 */}
        {runtimeConfig.systemNotice && (
          <div 
            className="px-4 py-2.5 animate-slide-up"
            style={{ 
              background: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb',
              borderBottom: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.3)' : '#fef3c7'}`
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
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ background: 'var(--bg-primary)' }}
        >
          <div className="animate-fade-in">
            {children}
          </div>
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
              variant="ghost"
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
          <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            确认退出登录
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            您确定要退出 {APP_NAME} 吗？退出后需要重新登录才能访问系统功能。
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default Layout;