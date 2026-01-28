import { AlertCircle, Check, Plus, Trash2 } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { DescriptionText } from '../components/ui/TruncateText';
import { rolesApi, authApi } from '../services/apiService';
import { usePermission } from '../hooks/usePermission';

const PERMISSION_GROUPS = [
  {
    label: '用户权限',
    items: [
      { key: 'system:user:read', label: '查看用户' },
      { key: 'system:user:create', label: '创建用户' },
      { key: 'system:user:update', label: '编辑用户' },
      { key: 'system:user:delete', label: '删除用户' },
    ],
  },
  {
    label: '角色权限管理',
    items: [
      { key: 'system:role:read', label: '查看角色' },
      { key: 'system:role:create', label: '创建角色' },
      { key: 'system:role:update', label: '编辑角色' },
      { key: 'system:role:delete', label: '删除角色' },
      { key: 'system:role:permission:manage', label: '角色权限管理' },
    ],
  },
  {
    label: '项目权限',
    items: [
      { key: 'project:project:create', label: '创建项目' },
      { key: 'project:project:read', label: '查看项目' },
      { key: 'project:project:update', label: '编辑项目' },
      { key: 'project:project:delete', label: '删除项目' },
      { key: 'project:member:manage', label: '成员管理' },
    ],
  },
  {
    label: '文件权限',
    items: [
      { key: 'project:file:create', label: '创建文件' },
      { key: 'project:file:open', label: '查看文件' },
      { key: 'project:file:edit', label: '打开编辑器' },
      { key: 'project:file:delete', label: '删除文件' },
      { key: 'project:file:share', label: '分享文件' },
      { key: 'project:file:download', label: '下载文件' },
      { key: 'project:file:comment', label: '批注文件' },
      { key: 'project:file:print', label: '打印文件' },
      { key: 'project:file:compare', label: '图纸比对' },
      { key: 'project:file:trash:manage', label: '回收站管理' },
    ],
  },
  {
    label: 'CAD 图纸权限',
    items: [
      { key: 'project:cad:save', label: '保存图纸' },
      { key: 'project:cad:export', label: '导出图纸' },
      { key: 'project:cad:external_reference', label: '管理外部参照' },
    ],
  },
  {
    label: '图库权限',
    items: [
      { key: 'project:gallery:use', label: '使用图库' },
      { key: 'project:gallery:add', label: '添加到图库' },
    ],
  },
  {
    label: '版本管理',
    items: [
      { key: 'project:version:read', label: '查看版本' },
      { key: 'project:version:create', label: '创建版本' },
      { key: 'project:version:delete', label: '删除版本' },
      { key: 'project:version:restore', label: '恢复版本' },
    ],
  },
  {
    label: '字体管理',
    items: [
      { key: 'system:font:read', label: '查看字体' },
      { key: 'system:font:upload', label: '上传字体' },
      { key: 'system:font:delete', label: '删除字体' },
      { key: 'system:font:download', label: '下载字体' },
    ],
  },
  {
    label: '系统权限',
    items: [
      { key: 'system:admin', label: '系统管理' },
      { key: 'system:monitor', label: '系统监控' },
    ],
  },
];

type Role = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[]; // 后端返回的是字符串数组（大写格式）
  createdAt: string;
  updatedAt: string;
};

export const RoleManagement = () => {
  const { hasPermission: checkUserPermission, hasRole } = usePermission();
  const [hasPermission, setHasPermission] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Edit State
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const response = await authApi.getProfile();
      // 只有具有 ADMIN 或 USER_MANAGER 角色的用户可以管理角色
      const hasAccess = hasRole(['ADMIN', 'USER_MANAGER']);
      setHasPermission(hasAccess);
      if (hasAccess) {
        loadRoles();
      }
    } catch (error) {
      setHasPermission(false);
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

  const handleCreate = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDesc('');
    setSelectedPerms([]);
    setIsModalOpen(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDesc(role.description || '');
    // 后端返回的是字符串数组，直接使用
    setSelectedPerms(Array.isArray(role.permissions) ? role.permissions : []);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!roleName) {
      alert('请输入角色名称');
      return;
    }

    try {
      if (editingRole) {
        await rolesApi.update(editingRole.id, {
          name: roleName,
          description: roleDesc,
          permissions: selectedPerms,
        });
      } else {
        await rolesApi.create({
          name: roleName,
          description: roleDesc,
          permissions: selectedPerms,
        });
      }

      setIsModalOpen(false);
      loadRoles();
    } catch (error) {
      alert(
        (error as Error & { response?: { data?: { message?: string } } })
          .response?.data?.message ||
          (error as Error).message ||
          '保存失败'
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (
      window.confirm(
        '确认删除该角色？删除后，属于该角色的用户将需要重新分配角色。'
      )
    ) {
      try {
        await rolesApi.delete(id);
        loadRoles();
      } catch (error) {
        console.error('删除角色失败:', error);
        // 如果是 404 错误，可能是角色已被删除，尝试刷新列表
        if (error.response?.status === 404) {
          loadRoles();
        } else {
          alert(error.response?.data?.message || '删除失败');
        }
      }
    }
  };

  const togglePermission = (perm: string) => {
    if (selectedPerms.includes(perm)) {
      setSelectedPerms(selectedPerms.filter((p) => p !== perm));
    } else {
      setSelectedPerms([...selectedPerms, perm]);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* 权限不足状态 */}
      {!hasPermission && (
        <div className="flex flex-col items-center justify-center h-full text-slate-500">
          <AlertCircle size={48} className="text-red-400 mb-4" />
          <h2 className="text-xl font-bold text-slate-800">访问被拒绝</h2>
          <p>您没有权限访问此页面。</p>
        </div>
      )}

      {/* 正常内容 */}
      {hasPermission && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">角色与权限</h1>
              <p className="text-slate-500 mt-1">定义系统角色及其操作权限</p>
            </div>
            <Button icon={Plus} onClick={handleCreate}>
              新建角色
            </Button>
          </div>

          {/* 所有角色列表 */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold text-slate-900">系统角色</h2>
              <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
                {roles.length} 个角色
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              角色用于管理系统用户的权限，可在用户管理和项目成员管理中分配
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow flex flex-col ${
                    role.isSystem
                      ? 'border-slate-200'
                      : 'border-2 border-emerald-200'
                  }`}
                >
                  <div
                    className={`p-6 border-b border-slate-100 flex items-start justify-between ${role.isSystem ? '' : 'bg-emerald-50/30'}`}
                  >
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
                        <DescriptionText>{role.description}</DescriptionText>
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50 disabled:text-slate-400"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  disabled={editingRole && editingRole.isSystem}
                />
                <input
                  type="text"
                  placeholder="描述"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50 disabled:text-slate-400"
                  value={roleDesc}
                  onChange={(e) => setRoleDesc(e.target.value)}
                  disabled={editingRole && editingRole.isSystem}
                />
                {editingRole && editingRole.isSystem && (
                  <p className="text-xs text-amber-600">
                    系统角色不允许修改名称和描述，但可以修改权限
                  </p>
                )}
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
        </>
      )}
    </div>
  );
};
