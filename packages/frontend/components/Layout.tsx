import {
  AlertTriangle,
  Bell,
  Box,
  CheckCircle,
  FolderOpen,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Type,
  Users,
  X,
  HardDrive,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { components } from '../types/api';
import { type Role } from '../types';
import { projectsApi, mockApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

type User = components['schemas']['UserDto'];

interface NavItemProps {
  to: string;
  icon: any;
  label: string;
  active: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, active }) => (
  <Link
    to={to}
    className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 ${
      active
        ? 'bg-primary-50 text-primary-700 shadow-sm'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <Icon size={20} className={active ? 'text-primary-600' : ''} />
    {label}
  </Link>
);

export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user, loading } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Interactions State
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [hookTest, setHookTest] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 存储空间状态
  const [storageInfo, setStorageInfo] = useState<{
    totalUsed: number;
    totalLimit: number;
    available: number;
    usagePercentage: number;
    formatted: {
      totalUsed: string;
      totalLimit: string;
      available: string;
    };
  } | null>(null);

  useEffect(() => {
    // 只有在用户已认证且加载完成时才获取角色信息
    if (user && !loading) {
      mockApi.auth
        .getRole()
        .then(setRole)
        .catch(() => {
          // 如果获取角色失败，设置默认角色
          setRole({ name: '用户', permissions: [] });
        });

      // 获取存储空间信息
      projectsApi
        .getStorageInfo()
        .then((response) => {
          // 静默：存储空间响应
          // 静默：存储空间信息
          if (response.data) {
            setStorageInfo(response.data);
          }
        })
        .catch((error) => {
          // 静默：获取存储空间信息失败
          // 静默：错误详情
        });
    }
  }, [user, loading]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login');
      // 静默：退出登录成功
    } catch (error) {
      // 静默：退出登录失败
    } finally {
      setIsLoggingOut(false);
      setShowLogoutConfirm(false);
    }
  };

  const menuItems = [
    { to: '/projects', icon: FolderOpen, label: '项目管理', visible: true },
    { to: '/trash', icon: Trash2, label: '回收站', visible: true },
    { to: '/library-blocks', icon: Box, label: '图库', visible: true },
    { to: '/font-library', icon: Type, label: '字体库', visible: true },
    {
      to: '/users',
      icon: Users,
      label: '用户管理',
      visible: user?.role?.name === 'ADMIN',
    },
    {
      to: '/roles',
      icon: ShieldCheck,
      label: '角色权限',
      visible: user?.role?.name === 'ADMIN',
    },
  ];

  return (
    <div
      className="flex h-screen bg-slate-50 overflow-hidden"
      onClick={() => {
        if (showNotifications) setShowNotifications(false);
        if (showSettings) setShowSettings(false);
      }}
    >
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out shadow-lg lg:shadow-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl gradient-primary shadow-primary-custom flex items-center justify-center">
                <Box className="text-white" size={20} />
              </div>
              <span className="text-xl font-bold text-slate-900">
                <span className="text-gradient-primary">CloudCAD</span>
              </span>
            </div>
            <button
              className="lg:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            {menuItems
              .filter((item) => item.visible)
              .map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  active={
                    location.pathname === item.to ||
                    (item.to !== '/' && location.pathname.startsWith(item.to))
                  }
                />
              ))}
          </nav>

          <div className="p-4 border-t border-slate-200">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-accent-400 overflow-hidden flex items-center justify-center shadow-sm">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt="User"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold text-white">
                    {(user?.nickname || user?.username || user?.email || 'U')
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {user?.nickname || user?.username || user?.email}
                </p>
                <p className="text-xs text-slate-500 truncate">{role?.name}</p>

                {/* 存储空间信息 */}
                {storageInfo && storageInfo.formatted ? (
                  <div className="mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <HardDrive size={12} className="text-slate-400" />
                      <span className="text-xs text-slate-600">
                        {storageInfo.formatted.totalUsed} /{' '}
                        {storageInfo.formatted.totalLimit}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          storageInfo.usagePercentage > 90
                            ? 'bg-gradient-to-r from-red-500 to-red-600'
                            : storageInfo.usagePercentage > 70
                              ? 'bg-gradient-to-r from-yellow-500 to-yellow-600'
                              : 'bg-gradient-to-r from-green-500 to-green-600'
                        }`}
                        style={{
                          width: `${Math.min(storageInfo.usagePercentage, 100)}%`,
                        }}
                      ></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      剩余 {storageInfo.formatted.available}
                    </p>
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <HardDrive size={12} className="text-slate-400" />
                      <span className="text-xs text-slate-400">加载中...</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-slate-300 animate-pulse"
                        style={{ width: '0%' }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
              <button
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowLogoutConfirm(true);
                }}
                title="退出登录"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200 h-16 flex items-center justify-between px-6 lg:px-8 relative z-30">
          <button
            className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>

          <div className="flex-1 max-w-xl mx-4 hidden lg:block">
            <div className="relative group">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors"
                size={20}
              />
              <input
                type="text"
                placeholder="搜索项目、图纸、图块..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-all shadow-sm hover:shadow-md"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Current Time Display */}
            <div className="hidden sm:flex items-center px-3 py-1.5 bg-slate-50 rounded-lg text-sm text-slate-600 font-medium">
              <span className="text-primary-600">
                {currentTime.toLocaleTimeString()}
              </span>
            </div>

            {/* Notification Dropdown */}
            <div className="relative">
              <button
                className={`p-2 hover:bg-slate-100 relative transition-all rounded-xl ${showNotifications ? 'text-primary-600 bg-primary-50' : 'text-slate-400'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotifications(!showNotifications);
                  setShowSettings(false);
                }}
              >
                <Bell size={20} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error-500 rounded-full ring-2 ring-white"></span>
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 animate-slide-in-right">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800">通知中心</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <div className="px-4 py-3 hover:bg-slate-50 cursor-pointer flex gap-3 transition-colors">
                      <div className="mt-1">
                        <CheckCircle size={16} className="text-success-500" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-800">
                          项目《商业中心》已归档
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          10分钟前
                        </p>
                      </div>
                    </div>
                    <div className="px-4 py-3 hover:bg-slate-50 cursor-pointer flex gap-3 transition-colors">
                      <div className="mt-1">
                        <AlertTriangle size={16} className="text-warning-500" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-800">
                          存储空间即将耗尽 (90%)
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">2小时前</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Settings Dropdown */}
            <div className="relative">
              <button
                className={`p-2 hover:bg-slate-100 transition-all rounded-xl ${showSettings ? 'text-primary-600 bg-primary-50' : 'text-slate-400'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettings(!showSettings);
                  setShowNotifications(false);
                }}
              >
                <Settings size={20} />
              </button>
              {showSettings && (
                <div className="absolute right-0 mt-2 w-48 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-100 py-1 z-50 animate-slide-in-right">
                  <Link
                    to="/profile"
                    className="block w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-primary-600 transition-colors"
                    onClick={() => setShowSettings(false)}
                  >
                    个人资料
                  </Link>
                  <button className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-primary-600 transition-colors">
                    系统设置
                  </button>
                  <div className="h-px bg-slate-100 my-1"></div>
                  <button
                    className="w-full text-left px-4 py-2.5 text-sm text-error-600 hover:bg-error-50 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowLogoutConfirm(true);
                      setShowSettings(false);
                    }}
                  >
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
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
              {isLoggingOut ? '退出中...' : '确认退出'}
            </Button>
          </>
        }
      >
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-2xl bg-error-100 mb-4">
            <LogOut className="w-8 h-8 text-error-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            确认退出登录
          </h3>
          <p className="text-sm text-slate-500">
            您确定要退出 CloudCAD 吗？退出后需要重新登录才能访问系统功能。
          </p>
        </div>
      </Modal>
    </div>
  );
};
