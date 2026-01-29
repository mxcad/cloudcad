import { AlertCircle, Check, Plus, Trash2, Info } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { DescriptionText } from '../components/ui/TruncateText';
import { rolesApi, projectRolesApi } from '../services/rolesApi';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission, ProjectPermission } from '../constants/permissions';

// 权限依赖关系
const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
  'SYSTEM_USER_UPDATE': ['SYSTEM_USER_READ'],
  'SYSTEM_USER_DELETE': ['SYSTEM_USER_READ'],
  'SYSTEM_ROLE_UPDATE': ['SYSTEM_ROLE_READ'],
  'SYSTEM_ROLE_DELETE': ['SYSTEM_ROLE_READ'],
  'SYSTEM_FONT_UPLOAD': ['SYSTEM_FONT_READ'],
  'SYSTEM_FONT_DELETE': ['SYSTEM_FONT_READ'],
  'SYSTEM_FONT_DOWNLOAD': ['SYSTEM_FONT_READ'],
  'FILE_DELETE': ['FILE_OPEN'],
  'FILE_EDIT': ['FILE_OPEN'],
  'FILE_SHARE': ['FILE_OPEN'],
  'FILE_DOWNLOAD': ['FILE_OPEN'],
  'FILE_COMMENT': ['FILE_OPEN'],
  'FILE_PRINT': ['FILE_OPEN'],
  'FILE_COMPARE': ['FILE_OPEN'],
  'CAD_SAVE': ['FILE_OPEN'],
  'CAD_EXPORT': ['FILE_OPEN'],
  'CAD_EXTERNAL_REFERENCE': ['FILE_OPEN'],
  'VERSION_CREATE': ['VERSION_READ'],
  'VERSION_DELETE': ['VERSION_READ'],
  'VERSION_RESTORE': ['VERSION_READ'],
};

// 检查权限是否满足依赖条件
const isPermissionEnabled = (perm: string, selected: string[]): boolean => {
  const dependencies = PERMISSION_DEPENDENCIES[perm];
  if (!dependencies) return true;

  return dependencies.every((dep) => selected.includes(dep));
};

// 获取权限缺失的依赖
const getMissingDependencies = (perm: string, selected: string[]): string[] => {
  const dependencies = PERMISSION_DEPENDENCIES[perm];
  if (!dependencies) return [];

  return dependencies.filter((dep) => !selected.includes(dep));
};

const togglePermission = (perm: string, selected: string[], setSelected: (perms: string[]) => void) => {
  if (selected.includes(perm)) {
    setSelected(selected.filter((p) => p !== perm));
  } else {
    setSelected([...selected, perm]);
  }
};

// 权限分组定义
const PERMISSION_GROUPS = {
  system: [
    {
      label: '用户权限',
      items: [
        { key: 'SYSTEM_USER_READ', label: '查看用户' },
        { key: 'SYSTEM_USER_CREATE', label: '创建用户' },
        { key: 'SYSTEM_USER_UPDATE', label: '编辑用户' },
        { key: 'SYSTEM_USER_DELETE', label: '删除用户' },
      ],
    },
    {
      label: '角色权限管理',
      items: [
        { key: 'SYSTEM_ROLE_READ', label: '查看角色' },
        { key: 'SYSTEM_ROLE_CREATE', label: '创建角色' },
        { key: 'SYSTEM_ROLE_UPDATE', label: '编辑角色' },
        { key: 'SYSTEM_ROLE_DELETE', label: '删除角色' },
        { key: 'SYSTEM_ROLE_PERMISSION_MANAGE', label: '角色权限管理' },
      ],
    },
    {
      label: '字体管理',
      items: [
        { key: 'SYSTEM_FONT_READ', label: '查看字体' },
        { key: 'SYSTEM_FONT_UPLOAD', label: '上传字体' },
        { key: 'SYSTEM_FONT_DELETE', label: '删除字体' },
        { key: 'SYSTEM_FONT_DOWNLOAD', label: '下载字体' },
      ],
    },
    {
      label: '系统权限',
      items: [
        { key: 'SYSTEM_ADMIN', label: '系统管理' },
        { key: 'SYSTEM_MONITOR', label: '系统监控' },
      ],
    },
  ],
  project: [
    {
      label: '项目权限',
      items: [
        { key: 'PROJECT_CREATE', label: '创建项目' },
        { key: 'PROJECT_READ', label: '查看项目' },
        { key: 'PROJECT_UPDATE', label: '编辑项目' },
        { key: 'PROJECT_DELETE', label: '删除项目' },
        { key: 'PROJECT_MEMBER_MANAGE', label: '成员管理' },
        { key: 'PROJECT_MEMBER_ASSIGN', label: '成员分配' },
        { key: 'PROJECT_ROLE_MANAGE', label: '角色管理' },
        { key: 'PROJECT_ROLE_PERMISSION_MANAGE', label: '角色权限管理' },
        { key: 'PROJECT_TRANSFER', label: '转让所有权' },
        { key: 'PROJECT_SETTINGS_MANAGE', label: '项目设置' },
      ],
    },
    {
      label: '文件权限',
      items: [
        { key: 'FILE_CREATE', label: '创建文件' },
        { key: 'FILE_UPLOAD', label: '上传文件' },
        { key: 'FILE_OPEN', label: '查看文件' },
        { key: 'FILE_EDIT', label: '编辑文件' },
        { key: 'FILE_DELETE', label: '删除文件' },
        { key: 'FILE_TRASH_MANAGE', label: '回收站管理' },
        { key: 'FILE_DOWNLOAD', label: '下载文件' },
        { key: 'FILE_SHARE', label: '分享文件' },
        { key: 'FILE_COMMENT', label: '批注文件' },
        { key: 'FILE_PRINT', label: '打印文件' },
        { key: 'FILE_COMPARE', label: '图纸比对' },
      ],
    },
    {
      label: 'CAD 图纸权限',
      items: [
        { key: 'CAD_SAVE', label: '保存图纸' },
        { key: 'CAD_EXPORT', label: '导出图纸' },
        { key: 'CAD_EXTERNAL_REFERENCE', label: '管理外部参照' },
      ],
    },
    {
      label: '图库权限',
      items: [
        { key: 'GALLERY_USE', label: '使用图库' },
        { key: 'GALLERY_ADD', label: '添加到图库' },
      ],
    },
    {
      label: '版本管理',
      items: [
        { key: 'VERSION_READ', label: '查看版本' },
        { key: 'VERSION_CREATE', label: '创建版本' },
        { key: 'VERSION_DELETE', label: '删除版本' },
        { key: 'VERSION_RESTORE', label: '恢复版本' },
      ],
    },
  ],
};

type SystemRole = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

type ProjectRole = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  _count: {
    members: number;
  };
};

// 通用权限配置Modal组件
interface PermissionConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  roleName: string;
  roleDesc: string;
  onNameChange: (value: string) => void;
  onDescChange: (value: string) => void;
  permissions: string[];
  onPermissionsChange: (perms: string[]) => void;
  onSave: () => void;
  isSystemRole: boolean;
  isEditingSystemRole: boolean;
  permissionType: 'system' | 'project';
}

const PermissionConfigModal: React.FC<PermissionConfigModalProps> = ({
  isOpen,
  onClose,
  title,
  roleName,
  roleDesc,
  onNameChange,
  onDescChange,
  permissions,
  onPermissionsChange,
  onSave,
  isSystemRole,
  isEditingSystemRole,
  permissionType,
}) => {
  const groups = PERMISSION_GROUPS[permissionType];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={onSave}>保存配置</Button>
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
            placeholder="角色名称"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50 disabled:text-slate-400"
            value={roleName}
            onChange={(e) => onNameChange(e.target.value)}
            disabled={isSystemRole && isEditingSystemRole}
          />
          <input
            type="text"
            placeholder="描述"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50 disabled:text-slate-400"
            value={roleDesc}
            onChange={(e) => onDescChange(e.target.value)}
            disabled={isSystemRole && isEditingSystemRole}
          />
          {isSystemRole && isEditingSystemRole && (
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
            {groups.map((group) => (
              <div
                key={group.label}
                className="border border-slate-200 rounded-lg overflow-hidden"
              >
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                  {group.label}
                </div>
                <div className="p-3 grid grid-cols-1 gap-2">
                  {group.items.map((perm) => {
                    const isEnabled = isPermissionEnabled(perm.key, permissions);
                    const dependencies = PERMISSION_DEPENDENCIES[perm.key];
                    const missingDeps = dependencies
                      ? dependencies.filter(dep => !permissions.includes(dep))
                      : [];

                    return (
                      <label
                        key={perm.key}
                        className={`flex items-center gap-3 p-2 rounded transition-colors ${
                          isEnabled ? 'hover:bg-slate-50 cursor-pointer' : 'opacity-50 cursor-not-allowed'
                        }`}
                        title={!isEnabled && missingDeps.length > 0
                          ? `⚠️ 此权限需要先勾选：${missingDeps.map(dep => {
                              const depItem = groups
                                .flatMap(g => g.items)
                                .find(i => i.key === dep);
                              return depItem ? depItem.label : dep;
                            }).join('、')}`
                          : perm.label
                        }
                      >
                        <div
                          className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                            permissions.includes(perm.key)
                              ? 'bg-indigo-600 border-indigo-600'
                              : isEnabled
                                ? 'border-slate-300 bg-white'
                                : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          {permissions.includes(perm.key) && (
                            <Check size={12} className="text-white" />
                          )}
                        </div>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={permissions.includes(perm.key)}
                          onChange={() =>
                            isEnabled &&
                            togglePermission(
                              perm.key,
                              permissions,
                              onPermissionsChange
                            )
                          }
                          disabled={!isEnabled}
                        />
                        <span className="text-sm text-slate-700">{perm.label}</span>
                        {/* Info图标：只在依赖权限未勾选时显示 */}
                        {!isEnabled && dependencies && dependencies.length > 0 && (
                          <Info size={14} className="text-amber-500" />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export const RoleManagement = () => {
  const { hasPermission, hasRole } = usePermission();
  const [activeTab, setActiveTab] = useState<'system' | 'project'>('project');

  // 系统角色状态
  const [systemRoles, setSystemRoles] = useState<SystemRole[]>([]);
  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [editingSystemRole, setEditingSystemRole] = useState<SystemRole | null>(null);
  const [systemRoleName, setSystemRoleName] = useState('');
  const [systemRoleDesc, setSystemRoleDesc] = useState('');
  const [selectedSystemPerms, setSelectedSystemPerms] = useState<string[]>([]);

  // 项目角色状态
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProjectRole, setEditingProjectRole] = useState<ProjectRole | null>(null);
  const [projectRoleName, setProjectRoleName] = useState('');
  const [projectRoleDesc, setProjectRoleDesc] = useState('');
  const [selectedProjectPerms, setSelectedProjectPerms] = useState<string[]>([]);

  // 获取当前用户信息
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    loadCurrentUser();
    loadSystemRoles();
    loadProjectRoles();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const response = await fetch('/api/auth/profile', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      const data = await response.json();
      setCurrentUser(data.data);
    } catch (error) {
      console.error('加载用户信息失败:', error);
    }
  };

  const loadSystemRoles = async () => {
    try {
      const response = await rolesApi.list();
      setSystemRoles(response.data);
    } catch (error) {
      console.error('加载系统角色失败:', error);
    }
  };

  const loadProjectRoles = async () => {
    try {
      const response = await projectRolesApi.list();
      setProjectRoles(response.data);
    } catch (error) {
      console.error('加载项目角色失败:', error);
    }
  };

  // 系统角色操作
  const handleCreateSystemRole = () => {
    setEditingSystemRole(null);
    setSystemRoleName('');
    setSystemRoleDesc('');
    setSelectedSystemPerms([]);
    setSystemModalOpen(true);
  };

  const handleEditSystemRole = (role: SystemRole) => {
    setEditingSystemRole(role);
    setSystemRoleName(role.name);
    setSystemRoleDesc(role.description || '');
    // 提取权限值（可能是字符串数组或对象数组）
    const permissions = Array.isArray(role.permissions)
      ? role.permissions
          .map((p: any) => {
            if (typeof p === 'string') return p;
            if (p && p.permission) return p.permission;
            return null;
          })
          .filter((p): p is string => p !== null)
      : [];
    setSelectedSystemPerms(permissions);
    setSystemModalOpen(true);
  };

  const handleSaveSystemRole = async () => {
    if (!systemRoleName) {
      alert('请输入角色名称');
      return;
    }

    try {
      if (editingSystemRole) {
        await rolesApi.update(editingSystemRole.id, {
          name: systemRoleName,
          description: systemRoleDesc,
          permissions: selectedSystemPerms,
        });
      } else {
        await rolesApi.create({
          name: systemRoleName,
          description: systemRoleDesc,
          permissions: selectedSystemPerms,
          category: 'CUSTOM',
          level: 0,
        });
      }

      setSystemModalOpen(false);
      loadSystemRoles();
    } catch (error) {
      alert(
        (error as any).response?.data?.message ||
          (error as Error).message ||
          '保存失败'
      );
    }
  };

  const handleDeleteSystemRole = async (id: string) => {
    if (
      window.confirm(
        '确认删除该角色？删除后，属于该角色的用户将需要重新分配角色。'
      )
    ) {
      try {
        await rolesApi.delete(id);
        loadSystemRoles();
      } catch (error) {
        console.error('删除角色失败:', error);
        alert((error as any).response?.data?.message || '删除失败');
      }
    }
  };

  // 项目角色操作
  const handleCreateProjectRole = () => {
    setEditingProjectRole(null);
    setProjectRoleName('');
    setProjectRoleDesc('');
    setSelectedProjectPerms([]);
    setProjectModalOpen(true);
  };

  const handleEditProjectRole = (role: ProjectRole) => {
    setEditingProjectRole(role);
    setProjectRoleName(role.name);
    setProjectRoleDesc(role.description || '');
    // 提取权限值（可能是字符串数组或对象数组）
    const permissions = Array.isArray(role.permissions)
      ? role.permissions
          .map((p: any) => {
            if (typeof p === 'string') return p;
            if (p && p.permission) return p.permission;
            return null;
          })
          .filter((p): p is string => p !== null)
      : [];
    setSelectedProjectPerms(permissions);
    setProjectModalOpen(true);
  };

  const handleSaveProjectRole = async () => {
    if (!projectRoleName) {
      alert('请输入角色名称');
      return;
    }

    try {
      if (editingProjectRole) {
        await projectRolesApi.update(editingProjectRole.id, {
          name: projectRoleName,
          description: projectRoleDesc,
          permissions: selectedProjectPerms,
        });
      } else {
        await projectRolesApi.create({
          ownerId: currentUser?.id || '',
          name: projectRoleName,
          description: projectRoleDesc,
          permissions: selectedProjectPerms,
        });
      }

      setProjectModalOpen(false);
      loadProjectRoles();
    } catch (error) {
      alert(
        (error as any).response?.data?.message ||
          (error as Error).message ||
          '保存失败'
      );
    }
  };

  const handleDeleteProjectRole = async (id: string) => {
    if (
      window.confirm(
        '确认删除该角色？删除后，属于该角色的用户将需要重新分配角色。'
      )
    ) {
      try {
        await projectRolesApi.delete(id);
        loadProjectRoles();
      } catch (error) {
        console.error('删除角色失败:', error);
        alert((error as any).response?.data?.message || '删除失败');
      }
    }
  };

  // 权限依赖关系
const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
  'SYSTEM_USER_UPDATE': ['SYSTEM_USER_READ'],
  'SYSTEM_USER_DELETE': ['SYSTEM_USER_READ'],
  'SYSTEM_ROLE_UPDATE': ['SYSTEM_ROLE_READ'],
  'SYSTEM_ROLE_DELETE': ['SYSTEM_ROLE_READ'],
};

// 检查权限是否满足依赖条件
const isPermissionEnabled = (perm: string, selected: string[]): boolean => {
  const dependencies = PERMISSION_DEPENDENCIES[perm];
  if (!dependencies) return true;

  return dependencies.every((dep) => selected.includes(dep));
};

// 获取权限缺失的依赖
const getMissingDependencies = (perm: string, selected: string[]): string[] => {
  const dependencies = PERMISSION_DEPENDENCIES[perm];
  if (!dependencies) return [];

  return dependencies.filter((dep) => !selected.includes(dep));
};

const togglePermission = (perm: string, selected: string[], setSelected: (perms: string[]) => void) => {
  if (selected.includes(perm)) {
    setSelected(selected.filter((p) => p !== perm));
  } else {
    setSelected([...selected, perm]);
  }
};

  // 判断是否是管理员
  const isAdmin = hasRole('ADMIN') || hasRole('USER_MANAGER');

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">角色与权限</h1>
          <p className="text-slate-500 mt-1">管理系统角色和项目角色及其操作权限</p>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="mb-6">
        <div className="flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('project')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'project'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            项目角色
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('system')}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'system'
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              系统角色
            </button>
          )}
        </div>
      </div>

      {/* 项目角色模块 */}
      {activeTab === 'project' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">项目角色</h2>
              <p className="text-sm text-slate-500 mt-1">
                管理项目成员的角色和权限，系统默认角色不可删除
              </p>
            </div>
            <Button icon={Plus} onClick={handleCreateProjectRole}>
              新建角色
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projectRoles.map((role) => (
              <div
                key={role.id}
                className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow flex flex-col ${
                  role.isSystem ? 'border-slate-200' : 'border-2 border-emerald-200'
                }`}
              >
                <div
                  className={`p-6 border-b border-slate-100 flex items-start justify-between ${
                    role.isSystem ? '' : 'bg-emerald-50/30'
                  }`}
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
                    <p className="text-xs text-slate-400 mt-2">
                      {role._count.members} 个成员
                    </p>
                  </div>
                  {!role.isSystem && (
                    <button
                      onClick={() => handleDeleteProjectRole(role.id)}
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
                    {role.permissions.slice(0, 6).map((p: any) => {
                      const permKey = typeof p === 'string' ? p : (p?.permission || '');
                      const allPermissions = [
                        ...PERMISSION_GROUPS.system.flatMap(g => g.items),
                        ...PERMISSION_GROUPS.project.flatMap(g => g.items)
                      ];
                      const permItem = allPermissions.find(item => item.key === permKey);
                      const label = permItem ? permItem.label : permKey.split('_').slice(1).join('_');

                      return (
                        <span
                          key={p.id || p}
                          className="text-xs px-2 py-1 bg-white border border-slate-200 rounded text-slate-600"
                        >
                          {label}
                        </span>
                      );
                    })}
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
                    onClick={() => handleEditProjectRole(role)}
                  >
                    配置权限
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 系统角色模块（仅管理员可见） */}
      {activeTab === 'system' && isAdmin && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">系统角色</h2>
              <p className="text-sm text-slate-500 mt-1">
                管理系统用户的角色和权限，系统默认角色不可删除
              </p>
            </div>
            <Button icon={Plus} onClick={handleCreateSystemRole}>
              新建角色
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {systemRoles.map((role) => (
              <div
                key={role.id}
                className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow flex flex-col ${
                  role.isSystem ? 'border-slate-200' : 'border-2 border-emerald-200'
                }`}
              >
                <div
                  className={`p-6 border-b border-slate-100 flex items-start justify-between ${
                    role.isSystem ? '' : 'bg-emerald-50/30'
                  }`}
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
                      onClick={() => handleDeleteSystemRole(role.id)}
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
                    {role.permissions.slice(0, 6).map((p: any) => {
                      const permKey = typeof p === 'string' ? p : (p?.permission || '');
                      const allPermissions = [
                        ...PERMISSION_GROUPS.system.flatMap(g => g.items),
                        ...PERMISSION_GROUPS.project.flatMap(g => g.items)
                      ];
                      const permItem = allPermissions.find(item => item.key === permKey);
                      const label = permItem ? permItem.label : permKey.split('_').slice(1).join('_');

                      return (
                        <span
                          key={p.id || p}
                          className="text-xs px-2 py-1 bg-white border border-slate-200 rounded text-slate-600"
                        >
                          {label}
                        </span>
                      );
                    })}
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
                    onClick={() => handleEditSystemRole(role)}
                  >
                    配置权限
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 系统角色权限配置弹窗 */}
      <PermissionConfigModal
        isOpen={systemModalOpen}
        onClose={() => setSystemModalOpen(false)}
        title={editingSystemRole ? '配置系统角色权限' : '新建系统角色'}
        roleName={systemRoleName}
        roleDesc={systemRoleDesc}
        onNameChange={setSystemRoleName}
        onDescChange={setSystemRoleDesc}
        permissions={selectedSystemPerms}
        onPermissionsChange={setSelectedSystemPerms}
        onSave={handleSaveSystemRole}
        isSystemRole={editingSystemRole?.isSystem || false}
        isEditingSystemRole={!!editingSystemRole && editingSystemRole.isSystem}
        permissionType="system"
      />

      {/* 项目角色权限配置弹窗 */}
      <PermissionConfigModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title={editingProjectRole ? '配置项目角色权限' : '新建项目角色'}
        roleName={projectRoleName}
        roleDesc={projectRoleDesc}
        onNameChange={setProjectRoleName}
        onDescChange={setProjectRoleDesc}
        permissions={selectedProjectPerms}
        onPermissionsChange={setSelectedProjectPerms}
        onSave={handleSaveProjectRole}
        isSystemRole={editingProjectRole?.isSystem || false}
        isEditingSystemRole={!!editingProjectRole && editingProjectRole.isSystem}
        permissionType="project"
      />
    </div>
  );
};