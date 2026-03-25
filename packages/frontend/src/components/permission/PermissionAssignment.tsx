///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import Check from 'lucide-react/dist/esm/icons/check';
import Info from 'lucide-react/dist/esm/icons/info';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  PERMISSION_GROUPS,
  isPermissionEnabled,
  getMissingDependencies,
  togglePermission,
  PermissionGroup,
} from '../../constants/permissions';

/**
 * 权限配置组件属性
 */
export interface PermissionAssignmentProps {
  /** 当前选中的权限列表 */
  permissions: string[];
  /** 权限变更回调 */
  onPermissionsChange: (perms: string[]) => void;
  /** 权限类型：system 或 project */
  permissionType: 'system' | 'project';
  /** 是否禁用权限选择 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 权限分配组件 - CloudCAD
 * 
 * 设计特色：
 * - 使用 CSS 变量适配深色/亮色主题
 * - 分组折叠面板设计
 * - 权限依赖可视化提示
 * - 流畅的交互动画
 */
export const PermissionAssignment: React.FC<PermissionAssignmentProps> = ({
  permissions,
  onPermissionsChange,
  permissionType,
  disabled = false,
  className = '',
}) => {
  const groups = PERMISSION_GROUPS[permissionType] as unknown as readonly PermissionGroup[];

  // 防御性检查：如果 groups 为 undefined，显示错误信息
  if (!groups) {
    return (
      <div className="permission-error-state">
        <AlertCircle size={20} />
        <span>权限类型错误: {permissionType}。请检查配置。</span>
        <style>{`
          .permission-error-state {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-4);
            background: var(--error-dim);
            border: 1px solid var(--error);
            border-radius: var(--radius-lg);
            color: var(--error);
          }
        `}</style>
      </div>
    );
  }

  const allPermissions = groups.flatMap((group) => group.items);

  return (
    <div className={`permission-assignment-container ${className}`}>
      {groups.map((group, groupIndex) => (
        <div
          key={group.label}
          className="permission-group"
          style={{ animationDelay: `${groupIndex * 0.05}s` }}
        >
          <div className="group-header">
            <span className="group-label">{group.label}</span>
            <span className="group-count">
              {group.items.filter(item => permissions.includes(item.key)).length} / {group.items.length}
            </span>
          </div>
          <div className="group-items">
            {group.items.map((perm) => {
              const isEnabled = isPermissionEnabled(perm.key, permissions) && !disabled;
              const missingDeps = getMissingDependencies(perm.key, permissions);
              const hasPermission = permissions.includes(perm.key);

              return (
                <label
                  key={perm.key}
                  className={`permission-item ${hasPermission ? 'checked' : ''} ${!isEnabled ? 'disabled' : ''}`}
                  title={
                    !isEnabled && missingDeps.length > 0
                      ? `此权限需要先勾选：${missingDeps
                          .map((dep) => {
                            const depItem = allPermissions.find((i) => i.key === dep);
                            return depItem ? depItem.label : dep;
                          })
                          .join('、')}`
                      : perm.label
                  }
                >
                  <div className={`checkbox ${hasPermission ? 'checked' : ''}`}>
                    {hasPermission && <Check size={12} />}
                  </div>
                  <input
                    type="checkbox"
                    className="hidden-checkbox"
                    checked={hasPermission}
                    onChange={() =>
                      isEnabled &&
                      togglePermission(perm.key, permissions, onPermissionsChange)
                    }
                    disabled={!isEnabled}
                  />
                  <span className="permission-label">{perm.label}</span>
                  {!isEnabled && missingDeps.length > 0 && (
                    <Info size={14} className="dependency-hint" />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <style>{permissionStyles}</style>
    </div>
  );
};

/**
 * 权限配置弹窗组件属性
 */
export interface PermissionConfigModalProps {
  /** 是否显示弹窗 */
  isOpen: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 弹窗标题 */
  title: string;
  /** 角色名称 */
  roleName: string;
  /** 角色描述 */
  roleDesc: string;
  /** 角色名称变更回调 */
  onNameChange: (value: string) => void;
  /** 角色描述变更回调 */
  onDescChange: (value: string) => void;
  /** 当前选中的权限列表 */
  permissions: string[];
  /** 权限变更回调 */
  onPermissionsChange: (perms: string[]) => void;
  /** 保存回调 */
  onSave: () => void;
  /** 是否为系统角色 */
  isSystemRole: boolean;
  /** 是否正在编辑系统角色 */
  isEditingSystemRole: boolean;
  /** 权限类型：system 或 project */
  permissionType: 'system' | 'project';
  /** 是否正在保存 */
  loading?: boolean;
}

/**
 * 权限配置弹窗组件 - CloudCAD
 * 
 * 设计特色：
 * - 大尺寸模态框，方便权限配置
 * - 分区域展示基本信息和权限设置
 * - 使用 CSS 变量适配主题
 */
export const PermissionConfigModal: React.FC<PermissionConfigModalProps> = ({
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
  loading = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="max-w-5xl"
      footer={
        <div className="config-modal-footer">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={onSave} disabled={loading} data-tour="role-save-btn">
            {loading ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                保存中...
              </>
            ) : (
              '保存配置'
            )}
          </Button>
        </div>
      }
    >
      <div className="config-modal-content">
        {/* 基本信息区域 */}
        <div className="basic-info-section">
          <h4 className="section-label">基本信息</h4>
          <div className="form-grid">
            <div className="form-field">
              <label className="field-label">角色名称</label>
              <input
                data-tour="role-name-input"
                type="text"
                placeholder="请输入角色名称"
                className="field-input"
                value={roleName}
                onChange={(e) => onNameChange(e.target.value)}
                disabled={isSystemRole && isEditingSystemRole}
              />
            </div>
            <div className="form-field">
              <label className="field-label">角色描述</label>
              <input
                type="text"
                placeholder="请输入角色描述（可选）"
                className="field-input"
                value={roleDesc}
                onChange={(e) => onDescChange(e.target.value)}
                disabled={isSystemRole && isEditingSystemRole}
              />
            </div>
          </div>
          {isSystemRole && isEditingSystemRole && (
            <div className="system-role-hint">
              <AlertCircle size={16} />
              <span>系统角色不允许修改名称和描述，但可以修改权限</span>
            </div>
          )}
        </div>

        {/* 权限分配区域 */}
        <div className="permissions-section" data-tour="role-permissions">
          <div className="permissions-header">
            <h4 className="section-label">权限分配</h4>
            <span className="permissions-count">
              已选择 {permissions.length} 项权限
            </span>
          </div>
          <PermissionAssignment
            permissions={permissions}
            onPermissionsChange={onPermissionsChange}
            permissionType={permissionType}
          />
        </div>
      </div>

      <style>{configModalStyles}</style>
    </Modal>
  );
};

// 权限分配组件样式
const permissionStyles = `
  .permission-assignment-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-height: 600px;
    overflow-y: auto;
    padding-right: var(--space-2);
    padding-bottom: var(--space-4);
  }

  /* 自定义滚动条 */
  .permission-assignment-container::-webkit-scrollbar {
    width: 6px;
  }

  .permission-assignment-container::-webkit-scrollbar-track {
    background: var(--bg-tertiary);
    border-radius: var(--radius-full);
  }

  .permission-assignment-container::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: var(--radius-full);
    transition: background 0.2s ease;
  }

  .permission-assignment-container::-webkit-scrollbar-thumb:hover {
    background: var(--primary-400);
  }

  /* 权限分组 */
  .permission-group {
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    overflow: visible;
    animation: groupFadeIn 0.4s ease-out backwards;
    transition: all 0.3s ease;
    background: var(--bg-secondary);
    margin-bottom: var(--space-2);
  }

  .permission-group:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-md);
  }

  @keyframes groupFadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    background: linear-gradient(135deg, var(--bg-tertiary), var(--bg-secondary));
    border-bottom: 1px solid var(--border-default);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .group-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .group-count {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--primary-600);
    padding: 0.25rem 0.75rem;
    background: var(--primary-100);
    border-radius: var(--radius-full);
    transition: all 0.2s ease;
  }

  [data-theme="dark"] .group-count {
    background: rgba(99, 102, 241, 0.2);
    color: var(--primary-400);
  }

  .group-items {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
    padding: var(--space-4);
    min-height: fit-content;
  }

  @media (max-width: 1200px) {
    .group-items {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 900px) {
    .group-items {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* 权限项 */
  .permission-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid var(--border-default);
    background: var(--bg-primary);
    min-height: 48px;
    box-sizing: border-box;
  }

  .permission-item:not(.disabled):hover {
    background: var(--bg-tertiary);
    border-color: var(--border-strong);
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }

  .permission-item.checked:not(.disabled) {
    background: linear-gradient(135deg, var(--primary-100), rgba(99, 102, 241, 0.08));
    border-color: var(--primary-400);
    box-shadow: 0 0 0 1px var(--primary-200);
  }

  [data-theme="dark"] .permission-item.checked:not(.disabled) {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.08));
    border-color: var(--primary-500);
    box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.3);
  }

  .permission-item.disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: var(--bg-tertiary);
  }

  /* 复选框 */
  .checkbox {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-default);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
    background: var(--bg-secondary);
  }

  .permission-item:hover .checkbox:not(.checked) {
    border-color: var(--primary-400);
    box-shadow: 0 0 0 3px var(--primary-100);
  }

  .checkbox.checked {
    background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
    border-color: var(--primary-500);
    color: white;
    box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
  }

  [data-theme="dark"] .checkbox.checked {
    box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
  }

  .hidden-checkbox {
    display: none;
  }

  /* 权限标签 */
  .permission-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
    white-space: nowrap;
    transition: color 0.2s ease;
    flex: 1;
    min-width: 0;
  }

  .permission-item.checked .permission-label {
    color: var(--primary-600);
    font-weight: 500;
  }

  [data-theme="dark"] .permission-item.checked .permission-label {
    color: var(--primary-400);
  }

  /* 依赖提示 */
  .dependency-hint {
    color: var(--warning);
    flex-shrink: 0;
    margin-left: auto;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* 响应式 - 适配各种屏幕尺寸 */
  @media (max-width: 1200px) {
    .group-items {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 900px) {
    .group-items {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 640px) {
    .permission-assignment-container {
      max-height: 70vh;
      padding-right: var(--space-1);
    }

    .group-items {
      grid-template-columns: 1fr;
      gap: var(--space-2);
      padding: var(--space-2);
    }

    .permission-item {
      padding: var(--space-3);
      min-height: 44px;
    }

    .permission-label {
      font-size: 0.9375rem;
    }

    .group-header {
      padding: var(--space-2) var(--space-3);
    }

    .group-label {
      font-size: 0.8125rem;
    }
  }

  /* 小屏手机适配 */
  @media (max-width: 375px) {
    .permission-item {
      padding: var(--space-2) var(--space-3);
    }

    .permission-label {
      font-size: 0.875rem;
    }
  }
`;

// 配置弹窗样式
const configModalStyles = `
  .config-modal-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    min-height: 500px;
    max-height: calc(90vh - 200px);
    overflow-y: auto;
  }

  .config-modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  /* 基本信息区域 */
  .basic-info-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--bg-tertiary);
    border-radius: var(--radius-xl);
    border: 1px solid var(--border-default);
  }

  .section-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-4);
  }

  @media (max-width: 640px) {
    .form-grid {
      grid-template-columns: 1fr;
    }

    .config-modal-content {
      min-height: auto;
      max-height: calc(100vh - 120px);
      gap: var(--space-4);
    }

    .basic-info-section {
      padding: var(--space-3);
    }

    .permissions-section {
      padding: var(--space-3);
      min-height: auto;
    }

    .config-modal-footer {
      flex-direction: column-reverse;
      gap: var(--space-2);
    }

    .config-modal-footer button {
      width: 100%;
    }

    /* 移动端 Modal 适配 - 覆盖 max-w-5xl */
    [class*="max-w-5xl"] {
      max-width: 100vw !important;
      margin: 0 var(--space-2) !important;
    }
  }

  /* 小屏手机进一步调整 */
  @media (max-width: 375px) {
    [class*="max-w-5xl"] {
      margin: 0 var(--space-1) !important;
    }
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .field-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .field-input {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    font-size: 0.9375rem;
    transition: all 0.25s ease;
    outline: none;
  }

  .field-input::placeholder {
    color: var(--text-muted);
  }

  .field-input:hover:not(:disabled) {
    border-color: var(--border-strong);
    background: var(--bg-primary);
  }

  .field-input:focus {
    border-color: var(--primary-500);
    box-shadow: 0 0 0 3px var(--primary-100), var(--shadow-sm);
  }

  [data-theme="dark"] .field-input:focus {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2), var(--shadow-sm);
  }

  .field-input:disabled {
    background: var(--bg-tertiary);
    color: var(--text-muted);
    cursor: not-allowed;
    opacity: 0.7;
  }

  .system-role-hint {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: linear-gradient(135deg, var(--warning-dim), rgba(245, 158, 11, 0.05));
    border: 1px solid var(--warning);
    border-radius: var(--radius-lg);
    color: var(--warning);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  /* 权限区域 */
  .permissions-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    overflow: visible;
    min-height: 300px;
  }

  .permissions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border-subtle);
  }

  .permissions-count {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--primary-600);
    padding: 0.375rem 1rem;
    background: var(--primary-100);
    border-radius: var(--radius-full);
    transition: all 0.2s ease;
  }

  [data-theme="dark"] .permissions-count {
    background: rgba(99, 102, 241, 0.2);
    color: var(--primary-400);
  }

  /* 动画 */
  .animate-spin {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

export default PermissionAssignment;