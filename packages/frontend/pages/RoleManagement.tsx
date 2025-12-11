import { AlertCircle, Check, Plus, Shield, Trash2 } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Permission, Role } from '../types';
import { mockApi } from '../services/api';

const PERMISSION_GROUPS = [
  {
    label: '系统管理',
    items: [
      { key: Permission.MANAGE_USERS, label: '用户管理 (增删改)' },
      { key: Permission.MANAGE_ROLES, label: '角色权限管理' },
      { key: Permission.VIEW_DASHBOARD, label: '查看工作台' },
    ],
  },
  {
    label: '项目管理',
    items: [
      { key: Permission.PROJECT_CREATE, label: '创建新项目' },
      { key: Permission.PROJECT_DELETE, label: '删除项目' },
      { key: Permission.PROJECT_VIEW_ALL, label: '查看所有项目 (全局权限)' },
    ],
  },
  {
    label: '资源库管理',
    items: [
      { key: Permission.LIBRARY_MANAGE, label: '管理图块/字体库' },
      { key: Permission.ASSET_UPLOAD, label: '上传资源' },
    ],
  },
];

export const RoleManagement = () => {
  const [hasPermission, setHasPermission] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Edit State
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Permission[]>([]);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const role = await mockApi.auth.getRole();
    if (!role?.permissions.includes(Permission.MANAGE_ROLES)) {
      setHasPermission(false);
      return;
    }
    loadRoles();
  };

  const loadRoles = async () => {
    const data = await mockApi.roles.list();
    setRoles(data);
  };

  const handleCreate = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDesc('');
    setSelectedPerms([Permission.VIEW_DASHBOARD]);
    setIsModalOpen(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDesc(role.description);
    setSelectedPerms(role.permissions);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!roleName) return;

    if (editingRole) {
      await mockApi.roles.update(editingRole.id, {
        name: roleName,
        description: roleDesc,
        permissions: selectedPerms,
      });
    } else {
      await mockApi.roles.create(roleName, roleDesc, selectedPerms);
    }

    setIsModalOpen(false);
    loadRoles();
  };

  const handleDelete = async (id: string) => {
    if (
      window.confirm(
        '确认删除该角色？删除后，属于该角色的用户将需要重新分配角色。'
      )
    ) {
      try {
        await mockApi.roles.delete(id);
        loadRoles();
      } catch (e: any) {
        alert(e.message);
      }
    }
  };

  const togglePermission = (perm: Permission) => {
    if (selectedPerms.includes(perm)) {
      setSelectedPerms(selectedPerms.filter((p) => p !== perm));
    } else {
      setSelectedPerms([...selectedPerms, perm]);
    }
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
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">角色与权限</h1>
          <p className="text-slate-500 mt-1">定义系统角色及其操作权限</p>
        </div>
        <Button icon={Plus} onClick={handleCreate}>
          新建角色
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roles.map((role) => (
          <div
            key={role.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col"
          >
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  {role.name}
                  {role.isSystem && (
                    <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
                      系统
                    </span>
                  )}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {role.description}
                </p>
              </div>
              {!role.isSystem && (
                <button
                  onClick={() => handleDelete(role.id)}
                  className="text-slate-400 hover:text-red-500"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="p-6 flex-1 bg-slate-50/50">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                拥有权限
              </h4>
              <div className="flex flex-wrap gap-2">
                {role.permissions.slice(0, 6).map((p) => (
                  <span
                    key={p}
                    className="text-xs px-2 py-1 bg-white border border-slate-200 rounded text-slate-600"
                  >
                    {p.split('_')[1] || p}
                  </span>
                ))}
                {role.permissions.length > 6 && (
                  <span className="text-xs px-2 py-1 text-slate-400">
                    +{role.permissions.length - 6}
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleEdit(role)}
              >
                配置权限
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRole ? '配置角色权限' : '新建角色'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存配置</Button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              基本信息
            </label>
            <input
              type="text"
              placeholder="角色名称 (如: 设计主管)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
            />
            <input
              type="text"
              placeholder="描述"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              value={roleDesc}
              onChange={(e) => setRoleDesc(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              权限分配
            </label>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {PERMISSION_GROUPS.map((group) => (
                <div
                  key={group.label}
                  className="border border-slate-200 rounded-lg overflow-hidden"
                >
                  <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                    {group.label}
                  </div>
                  <div className="p-3 grid grid-cols-1 gap-2">
                    {group.items.map((perm) => (
                      <label
                        key={perm.key}
                        className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer"
                      >
                        <div
                          className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedPerms.includes(perm.key) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}
                        >
                          {selectedPerms.includes(perm.key) && (
                            <Check size={12} className="text-white" />
                          )}
                        </div>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={selectedPerms.includes(perm.key)}
                          onChange={() => togglePermission(perm.key)}
                        />
                        <span className="text-sm text-slate-700">
                          {perm.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
