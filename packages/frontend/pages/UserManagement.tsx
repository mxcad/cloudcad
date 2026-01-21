import {
  AlertCircle,
  Edit,
  Shield,
  Trash2,
  User as UserIcon,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { usersApi, authApi, rolesApi } from '../services/apiService';
import { components } from '../types/api';

// 使用API类型
type UserDto = components['schemas']['UserDto'];
type RoleDto = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export const UserManagement = () => {
  const [hasPermission, setHasPermission] = useState(false);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 搜索、筛选、排序、分页状态
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalUsers, setTotalUsers] = useState(0);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    roleId: '',
    nickname: '',
  });

  // 表单验证错误
  const [formErrors, setFormErrors] = useState({
    username: '',
    email: '',
    password: '',
  });

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const hasAccess = await checkAccess();
    if (hasAccess) {
      await Promise.all([loadData(), loadRoles()]);
    }
  };

  const loadRoles = async () => {
    try {
      const response = await rolesApi.list();
      setRoles(response.data);
    } catch (error) {
      console.error('加载角色列表失败:', error);
    }
  };

  const checkAccess = async (): Promise<boolean> => {
    try {
      const response = await authApi.getProfile();
      const currentUser = response.data;
      // 只有ADMIN角色可以管理用户
      const hasAccess = currentUser.role?.name === 'ADMIN';
      setHasPermission(hasAccess);
      return hasAccess;
    } catch (error) {
      setHasPermission(false);
      return false;
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await usersApi.list({
        search: searchQuery || undefined,
        roleId: roleFilter || undefined,
        page: currentPage,
        limit: pageSize,
        sortBy,
        sortOrder,
      });
      setUsers(response.data.data);
      setTotalUsers(response.data.pagination.total);
    } catch (error) {
      setError('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 当搜索、筛选、排序或分页改变时重新加载数据
  useEffect(() => {
    if (hasPermission) {
      loadData();
    }
  }, [searchQuery, roleFilter, sortBy, sortOrder, currentPage, hasPermission]);

  const handleOpenCreate = () => {
    setEditingUser(null);
    // 获取默认角色（USER）
    const defaultRole = roles.find((r) => r.name === 'USER');
    setFormData({
      username: '',
      email: '',
      password: '',
      roleId: defaultRole?.id || '',
      nickname: '',
    });
    setFormErrors({ username: '', email: '', password: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: UserDto) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '', // 编辑时不显示密码
      roleId: (user.role as any)?.id || '',
      nickname: user.nickname || '',
    });
    setFormErrors({ username: '', email: '', password: '' });
    setIsModalOpen(true);
  };

  // 表单验证函数
  const validateForm = (): boolean => {
    const errors = {
      username: '',
      email: '',
      password: '',
    };

    // 验证用户名
    if (!formData.username) {
      errors.username = '用户名不能为空';
    } else if (formData.username.length < 3) {
      errors.username = '用户名至少3个字符';
    } else if (formData.username.length > 20) {
      errors.username = '用户名最多20个字符';
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      errors.username = '用户名只能包含字母、数字和下划线';
    }

    // 验证邮箱
    if (!formData.email) {
      errors.email = '邮箱不能为空';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = '请输入有效的邮箱地址';
    }

    // 验证密码（创建用户时必填，编辑用户时可选）
    if (!editingUser) {
      if (!formData.password) {
        errors.password = '密码不能为空';
      } else if (formData.password.length < 8) {
        errors.password = '密码至少8个字符';
      } else if (formData.password.length > 50) {
        errors.password = '密码最多50个字符';
      }
    } else if (formData.password && formData.password.length < 8) {
      errors.password = '密码至少8个字符';
    }

    setFormErrors(errors);
    return !errors.username && !errors.email && !errors.password;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证表单
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      if (editingUser) {
        // 更新用户
        const updateData = {
          username: formData.username,
          email: formData.email,
          roleId: formData.roleId,
          nickname: formData.nickname,
        };
        // 只有在输入密码时才更新密码
        if (formData.password) {
          (updateData as any).password = formData.password;
        }
        await usersApi.update(editingUser.id, updateData);
      } else {
        // 创建用户
        const createData = {
          username: formData.username,
          email: formData.email,
          password: formData.password,
          roleId: formData.roleId,
          nickname: formData.nickname,
        };
        await usersApi.create(createData);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (error) {
      setError(editingUser ? '更新用户失败' : '创建用户失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('确定要删除该用户吗？相关数据可能无法恢复。')) {
      setLoading(true);
      try {
        await usersApi.delete(id);
        await loadData();
      } catch (error) {
        setError('删除用户失败');
      } finally {
        setLoading(false);
      }
    }
  };

  const getRoleName = (role: string | { name: string }) => {
    if (typeof role === 'string') {
      // 兼容旧格式：role 是字符串
      return roles.find((r) => r.id === role)?.name || '未知角色';
    } else if (role && role.name) {
      // 新格式：role 是对象
      return role.name;
    }
    return '未知角色';
  };

  if (!hasPermission) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <AlertCircle size={48} className="text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">访问被拒绝</h2>
        <p>您没有权限访问此页面。</p>
      </div>
    );
  }

  if (loading && users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="mt-4">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <AlertCircle size={48} className="text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">加载失败</h2>
        <p>{error}</p>
        <Button onClick={loadData} className="mt-4">
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">用户管理</h1>
          <p className="text-slate-500 mt-1">
            管理团队成员、分配角色及存储配额
          </p>
        </div>
        <Button onClick={handleOpenCreate} disabled={loading}>
          添加用户
        </Button>
      </div>

      {/* 搜索、筛选、排序控件 */}
      <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 搜索框 */}
          <div className="relative group">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors"
              size={20}
            />
            <input
              type="text"
              placeholder="搜索用户（邮箱、用户名、昵称）"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1); // 搜索时重置到第一页
              }}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all shadow-sm hover:shadow-md"
            />
          </div>

          {/* 角色筛选 */}
          <div className="relative">
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1); // 筛选时重置到第一页
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all shadow-sm hover:shadow-md"
            >
              <option value="">所有角色</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          {/* 排序方式 */}
          <div className="relative">
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field);
                setSortOrder(order as 'asc' | 'desc');
                setCurrentPage(1); // 排序时重置到第一页
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all shadow-sm hover:shadow-md"
            >
              <option value="createdAt-desc">创建时间（降序）</option>
              <option value="createdAt-asc">创建时间（升序）</option>
              <option value="username-asc">用户名（升序）</option>
              <option value="username-desc">用户名（降序）</option>
              <option value="email-asc">邮箱（升序）</option>
              <option value="email-desc">邮箱（降序）</option>
            </select>
          </div>
        </div>

        {/* 分页信息 */}
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            共 {totalUsers} 位用户，每页 {pageSize} 条，共{' '}
            {Math.ceil(totalUsers / pageSize)} 页
          </span>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1 || loading}
              variant="ghost"
              size="xsmall"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium">
              {currentPage} / {Math.ceil(totalUsers / pageSize)}
            </span>
            <Button
              onClick={() =>
                setCurrentPage(
                  Math.min(Math.ceil(totalUsers / pageSize), currentPage + 1)
                )
              }
              disabled={
                currentPage >= Math.ceil(totalUsers / pageSize) || loading
              }
              variant="ghost"
              size="xsmall"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>

      {/* 用户列表表格 */}
      <div className="bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                用户
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                角色
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                状态
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                      {user.avatar ? (
                        <img
                          className="h-10 w-10 rounded-full"
                          src={user.avatar}
                          alt=""
                        />
                      ) : (
                        <UserIcon size={20} className="text-slate-400" />
                      )}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-slate-900">
                        {user.nickname || user.username}
                      </div>
                      <div className="text-sm text-slate-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    <Shield size={12} /> {getRoleName(user.role)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      user.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-700 border border-green-200'
                        : user.status === 'INACTIVE'
                          ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                          : 'bg-red-100 text-red-700 border border-red-200'
                    }`}
                  >
                    {user.status === 'ACTIVE'
                      ? '活跃'
                      : user.status === 'INACTIVE'
                        ? '非活跃'
                        : '已暂停'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenEdit(user)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="编辑"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit/Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? '编辑用户' : '添加新用户'}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setIsModalOpen(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? '处理中...' : editingUser ? '保存' : '创建'}
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              用户名 *
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => {
                setFormData({ ...formData, username: e.target.value });
                if (formErrors.username) {
                  setFormErrors({ ...formErrors, username: '' });
                }
              }}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                formErrors.username
                  ? 'border-red-300 bg-red-50'
                  : 'border-slate-300 focus:border-indigo-500'
              }`}
              placeholder="请输入用户名（3-20个字符，只能包含字母、数字和下划线）"
            />
            {formErrors.username && (
              <p className="mt-1 text-sm text-red-600">{formErrors.username}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              邮箱 *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                if (formErrors.email) {
                  setFormErrors({ ...formErrors, email: '' });
                }
              }}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                formErrors.email
                  ? 'border-red-300 bg-red-50'
                  : 'border-slate-300 focus:border-indigo-500'
              }`}
              placeholder="请输入邮箱地址"
            />
            {formErrors.email && (
              <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {editingUser ? '新密码（留空则不修改）' : '密码 *'}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => {
                setFormData({ ...formData, password: e.target.value });
                if (formErrors.password) {
                  setFormErrors({ ...formErrors, password: '' });
                }
              }}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                formErrors.password
                  ? 'border-red-300 bg-red-50'
                  : 'border-slate-300 focus:border-indigo-500'
              }`}
              placeholder={
                editingUser ? '留空保持原密码' : '请输入密码（至少8个字符）'
              }
            />
            {formErrors.password && (
              <p className="mt-1 text-sm text-red-600">{formErrors.password}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                角色 *
              </label>
              <select
                value={formData.roleId}
                onChange={(e) =>
                  setFormData({ ...formData, roleId: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                昵称
              </label>
              <input
                type="text"
                value={formData.nickname}
                onChange={(e) =>
                  setFormData({ ...formData, nickname: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="请输入昵称"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
