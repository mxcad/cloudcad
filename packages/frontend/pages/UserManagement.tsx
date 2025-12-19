import {
  AlertCircle,
  Edit,
  Shield,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Permission, type Role } from '../types';
import { usersApi, authApi } from '../services/apiService';
import { components } from '../types/api';

// 使用API类型
type UserDto = components['schemas']['UserDto'];
type CreateUserDto = components['schemas']['CreateUserDto'];
type UpdateUserDto = components['schemas']['UpdateUserDto'];

export const UserManagement = () => {
  const [hasPermission, setHasPermission] = useState(false);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 静态角色列表（后端只有ADMIN和USER两种角色）
  const [roles] = useState<Role[]>([
    {
      id: 'ADMIN',
      name: '管理员',
      description: '系统管理员，拥有所有权限',
      permissions: [
        Permission.MANAGE_USERS,
        Permission.MANAGE_ROLES,
        Permission.VIEW_DASHBOARD,
      ],
      isSystem: true,
    },
    {
      id: 'USER',
      name: '用户',
      description: '普通用户，基础权限',
      permissions: [Permission.VIEW_DASHBOARD],
      isSystem: true,
    },
  ]);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    roleId: 'USER',
    nickname: '',
  });

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const hasAccess = await checkAccess();
    if (hasAccess) {
      await loadData();
    }
  };

  const checkAccess = async (): Promise<boolean> => {
    try {
      const response = await authApi.getProfile();
      const currentUser = response.data;
      // 只有ADMIN角色可以管理用户
      const hasAccess = currentUser.role === 'ADMIN';
      setHasPermission(hasAccess);
      return hasAccess;
    } catch (error) {
      console.error('Failed to check access:', error);
      setHasPermission(false);
      return false;
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await usersApi.list();
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to load users:', error);
      setError('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      email: '',
      password: '',
      roleId: 'USER',
      nickname: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: UserDto) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '', // 编辑时不显示密码
      roleId: user.role,
      nickname: user.nickname || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingUser) {
        // 更新用户
        const updateData: UpdateUserDto = {
          username: formData.username,
          email: formData.email,
          role: formData.roleId as 'ADMIN' | 'USER',
          nickname: formData.nickname,
        };
        // 只有在输入密码时才更新密码
        if (formData.password) {
          updateData.password = formData.password;
        }
        await usersApi.update(editingUser.id, updateData);
      } else {
        // 创建用户
        const createData: CreateUserDto = {
          username: formData.username,
          email: formData.email,
          password: formData.password,
          role: formData.roleId as 'ADMIN' | 'USER',
          nickname: formData.nickname,
        };
        await usersApi.create(createData);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (error) {
      console.error('Failed to save user:', error);
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
        console.error('Failed to delete user:', error);
        setError('删除用户失败');
      } finally {
        setLoading(false);
      }
    }
  };

  const getRoleName = (roleId: string) => {
    return roles.find((r) => r.id === roleId)?.name || '未知角色';
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
              required
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500"
              placeholder="请输入用户名"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              邮箱 *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500"
              placeholder="请输入邮箱地址"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {editingUser ? '新密码（留空则不修改）' : '密码 *'}
            </label>
            <input
              type="password"
              required={!editingUser}
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500"
              placeholder={editingUser ? '留空保持原密码' : '请输入密码'}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                角色 *
              </label>
              <select
                required
                value={formData.roleId}
                onChange={(e) =>
                  setFormData({ ...formData, roleId: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 bg-white"
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
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500"
                placeholder="请输入昵称"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
