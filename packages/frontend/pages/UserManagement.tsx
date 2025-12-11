import {
  AlertCircle,
  Database,
  Edit,
  MoreHorizontal,
  Shield,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Permission, type Role, type User } from '../types';
import { mockApi } from '../services/api';

export const UserManagement = () => {
  const [hasPermission, setHasPermission] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    roleId: '',
    storageGB: 1,
  });

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const role = await mockApi.auth.getRole();
    setHasPermission(role.permissions.includes(Permission.MANAGE_USERS));
  };

  const loadData = async () => {
    try {
      const [usersData, rolesData] = await Promise.all([
        mockApi.users.list(),
        mockApi.roles.list(),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      // setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      roleId: roles[0]?.id || '',
      storageGB: 1,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.username,
      email: user.email,
      roleId: user.role,
      storageGB: 1, // Default value
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formData.name,
      email: formData.email,
      roleId: formData.roleId,
      totalStorage: formData.storageGB * 1024 * 1024 * 1024,
    };

    if (editingUser) {
      await mockApi.users.update(editingUser.id, payload);
    } else {
      await mockApi.users.create(payload);
    }

    setIsModalOpen(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('确定要删除该用户吗？相关数据可能无法恢复。')) {
      await mockApi.users.delete(id);
      loadData();
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">用户管理</h1>
          <p className="text-slate-500 mt-1">
            管理团队成员、分配角色及存储配额
          </p>
        </div>
        <Button onClick={handleOpenCreate}>添加用户</Button>
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
                存储空间
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
                    <img
                      className="h-10 w-10 rounded-full bg-slate-100"
                      src={user.avatar}
                      alt=""
                    />
                    <div className="ml-4">
                      <div className="text-sm font-medium text-slate-900">
                        {user.name}
                      </div>
                      <div className="text-sm text-slate-500">
                        {user.email || 'No email'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    <Shield size={12} /> {getRoleName(user.roleId)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="w-full max-w-xs">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-600 font-medium">
                        {(user.usedStorage / 1024 / 1024 / 1024).toFixed(2)} GB
                        已用
                      </span>
                      <span className="text-slate-400">
                        / {(user.totalStorage / 1024 / 1024 / 1024).toFixed(0)}{' '}
                        GB
                      </span>
                    </div>
                    <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${user.usedStorage / user.totalStorage > 0.9 ? 'bg-red-500' : 'bg-indigo-500'}`}
                        style={{
                          width: `${Math.min(100, (user.usedStorage / user.totalStorage) * 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
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
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit}>
              {editingUser ? '保存' : '创建'}
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              姓名
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              邮箱
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                角色
              </label>
              <select
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
                存储配额 (GB)
              </label>
              <input
                type="number"
                min="1"
                value={formData.storageGB}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    storageGB: parseInt(e.target.value) || 1,
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
