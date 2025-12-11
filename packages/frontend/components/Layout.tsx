import {
  AlertTriangle,
  Bell,
  Box,
  CheckCircle,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Type,
  Users,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { components } from '../types/api';
import { Permission, type Role } from '../types';
import { mockApi } from '../services/api';

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
    className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
      active
        ? 'bg-indigo-50 text-indigo-700'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <Icon size={20} />
    {label}
  </Link>
);

export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Interactions State
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [hookTest, setHookTest] = useState(false);

  useEffect(() => {
    mockApi.auth.getCurrentUser().then((u) => {
      setUser(u);
      mockApi.auth.getRole().then(setRole);
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const menuItems = [
    { to: '/', icon: LayoutDashboard, label: '工作台', visible: true },
    { to: '/projects', icon: FolderOpen, label: '项目管理', visible: true },
    { to: '/blocks', icon: Box, label: '图块库', visible: true },
    { to: '/fonts', icon: Type, label: '字体库', visible: true },
    {
      to: '/users',
      icon: Users,
      label: '用户管理',
      visible: role?.permissions.includes(Permission.MANAGE_USERS),
    },
    {
      to: '/roles',
      icon: ShieldCheck,
      label: '角色权限',
      visible: role?.permissions.includes(Permission.MANAGE_ROLES),
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
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Box className="text-white" size={20} />
              </div>
              <span className="text-xl font-bold text-slate-800">CloudCAD</span>
            </div>
            <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
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
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden">
                {user?.avatar && (
                  <img
                    src={user.avatar}
                    alt="User"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-slate-500 truncate">{role?.name}</p>
              </div>
              <button className="text-slate-400 hover:text-slate-600">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 lg:px-8 relative z-30">
          <button
            className="lg:hidden p-2 -ml-2 text-slate-600"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>

          <div className="flex-1 max-w-xl mx-4 hidden lg:block">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={20}
              />
              <input
                type="text"
                placeholder="搜索项目、图纸、图�?.."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-100 border-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Current Time Display */}
            <div className="hidden sm:flex items-center text-sm text-slate-600">
              <span className="font-medium">
                {currentTime.toLocaleTimeString()}
              </span>
            </div>

            {/* Notification Dropdown */}
            <div className="relative">
              <button
                className={`p-2 hover:text-slate-600 relative transition-colors ${showNotifications ? 'text-indigo-600 bg-indigo-50 rounded-full' : 'text-slate-400'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotifications(!showNotifications);
                  setShowSettings(false);
                }}
              >
                <Bell size={20} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-50">
                    <h3 className="font-semibold text-slate-800">通知中心</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <div className="px-4 py-3 hover:bg-slate-50 cursor-pointer flex gap-3">
                      <div className="mt-1">
                        <CheckCircle size={16} className="text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-800">
                          项目《商业中心》已归档
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          10分钟�?
                        </p>
                      </div>
                    </div>
                    <div className="px-4 py-3 hover:bg-slate-50 cursor-pointer flex gap-3">
                      <div className="mt-1">
                        <AlertTriangle size={16} className="text-orange-500" />
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
                className={`p-2 hover:text-slate-600 transition-colors ${showSettings ? 'text-indigo-600 bg-indigo-50 rounded-full' : 'text-slate-400'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettings(!showSettings);
                  setShowNotifications(false);
                }}
              >
                <Settings size={20} />
              </button>
              {showSettings && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50">
                  <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600">
                    个人资料
                  </button>
                  <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600">
                    系统设置
                  </button>
                  <div className="h-px bg-slate-100 my-1"></div>
                  <button className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                    退出登�?
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
};
