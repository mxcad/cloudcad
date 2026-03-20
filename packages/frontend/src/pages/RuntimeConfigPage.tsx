import React, { useState, useEffect, useCallback } from 'react';
import { runtimeConfigApi, RuntimeConfigItem } from '../services/runtimeConfigApi';
import { useNotification } from '../contexts/NotificationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTheme } from '../contexts/ThemeContext';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission } from '../constants/permissions';

// Lucide 图标导入
import Settings from 'lucide-react/dist/esm/icons/settings';
import Save from 'lucide-react/dist/esm/icons/save';
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw';
import CheckCircle from 'lucide-react/dist/esm/icons/check-circle';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import Shield from 'lucide-react/dist/esm/icons/shield';
import Globe from 'lucide-react/dist/esm/icons/globe';
import Mail from 'lucide-react/dist/esm/icons/mail';
import Users from 'lucide-react/dist/esm/icons/users';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Cpu from 'lucide-react/dist/esm/icons/cpu';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Eye from 'lucide-react/dist/esm/icons/eye';
import EyeOff from 'lucide-react/dist/esm/icons/eye-off';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';

interface ConfigGroup {
  category: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: RuntimeConfigItem[];
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  mail: { label: '邮件配置', icon: Mail },
  support: { label: '客服信息', icon: Globe },
  file: { label: '文件配置', icon: FileText },
  user: { label: '用户管理', icon: Users },
  system: { label: '系统配置', icon: Cpu },
};

/**
 * 运行时配置页面 - CloudCAD
 *
 * 设计特色：
 * - 专业工程美学风格
 * - 卡片式分组布局
 * - 实时状态反馈
 * - 平滑的动画过渡效果
 * - 完美深浅主题适配
 */
export const RuntimeConfigPage: React.FC = () => {
  useDocumentTitle('运行时配置');
  const { isDark } = useTheme();
  const { showToast, showConfirm } = useNotification();
  const { hasPermission } = usePermission();

  const [configs, setConfigs] = useState<RuntimeConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [editedValues, setEditedValues] = useState<Record<string, string | number | boolean>>({});

  const [hiddenValues, setHiddenValues] = useState<Set<string>>(new Set());

  // 检查权限
  const canManageConfig = hasPermission(SystemPermission.SYSTEM_CONFIG_WRITE);

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await runtimeConfigApi.getAllConfigs();
      setConfigs(response.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取配置失败';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // 按分类分组
  const groupedConfigs: ConfigGroup[] = Object.entries(
    configs.reduce<Record<string, RuntimeConfigItem[]>>((acc, config) => {
      const category = config.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category]!.push(config);
      return acc;
    }, {})
  )
    .map(([category, items]) => ({
      category,
      label: CATEGORY_CONFIG[category]?.label || category,
      icon: CATEGORY_CONFIG[category]?.icon || Settings,
      items,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const handleValueChange = (key: string, value: string | number | boolean) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key: string) => {
    const value = editedValues[key];
    if (value === undefined) return;

    try {
      setSaving((prev) => new Set(prev).add(key));
      await runtimeConfigApi.updateConfig(key, value);
      showToast('配置已保存', 'success');
      setEditedValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await fetchConfigs();
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败';
      showToast(message, 'error');
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleReset = async (key: string) => {
    const confirmed = await showConfirm({
      title: '确认重置',
      message: '确定要将此配置重置为默认值吗？此操作不可撤销。',
      confirmText: '确认重置',
      cancelText: '取消',
      type: 'warning',
    });

    if (!confirmed) return;

    try {
      setSaving((prev) => new Set(prev).add(key));
      await runtimeConfigApi.resetConfig(key);
      showToast('已重置为默认值', 'success');
      setEditedValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await fetchConfigs();
    } catch (error) {
      const message = error instanceof Error ? error.message : '重置失败';
      showToast(message, 'error');
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const toggleValueVisibility = (key: string) => {
    setHiddenValues((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const parseValue = (item: RuntimeConfigItem): string | number | boolean => {
    const edited = editedValues[item.key];
    if (edited !== undefined) {
      return edited;
    }
    return item.value as unknown as string | number | boolean;
  };

  const isSensitiveKey = (key: string): boolean => {
    const sensitivePatterns = ['password', 'secret', 'token', 'key', 'api'];
    return sensitivePatterns.some((pattern) => key.toLowerCase().includes(pattern));
  };

  const renderConfigInput = (item: RuntimeConfigItem) => {
    const value = parseValue(item);
    const isSensitive = isSensitiveKey(item.key);
    const isHidden = hiddenValues.has(item.key);

    if (item.type === 'boolean') {
      return (
        <button
          type="button"
          onClick={() => handleValueChange(item.key, !value)}
          className={`toggle-switch ${value ? 'active' : ''}`}
          disabled={!canManageConfig}
        >
          <span className="toggle-handle" />
        </button>
      );
    }

    if (item.type === 'number') {
      return (
        <input
          type="number"
          value={value as number}
          onChange={(e) => handleValueChange(item.key, Number(e.target.value))}
          className="config-input number-input"
          disabled={!canManageConfig}
        />
      );
    }

    if (isSensitive) {
      return (
        <div className="sensitive-input-wrapper">
          <input
            type={isHidden ? 'password' : 'text'}
            value={value as string}
            onChange={(e) => handleValueChange(item.key, e.target.value)}
            className="config-input sensitive-input"
            disabled={!canManageConfig}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => toggleValueVisibility(item.key)}
            className="visibility-toggle"
            tabIndex={-1}
          >
            {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      );
    }

    return (
      <input
        type="text"
        value={value as string}
        onChange={(e) => handleValueChange(item.key, e.target.value)}
        className="config-input"
        disabled={!canManageConfig}
        placeholder="请输入..."
      />
    );
  };

  // 计算有多少个配置项有修改
  const modifiedCount = Object.keys(editedValues).length;

  // 计算配置统计
  const configStats = {
    total: configs.length,
    public: configs.filter((c) => c.isPublic).length,
    modified: modifiedCount,
  };

  if (loading) {
    return (
      <div className="config-page" data-theme={isDark ? 'dark' : 'light'}>
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>正在加载配置...</p>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="config-page" data-theme={isDark ? 'dark' : 'light'}>
      {/* 页面头部 */}
      <header className="page-header">
        <div className="header-left">
          <div className="title-icon">
            <Settings size={28} />
          </div>
          <div className="title-content">
            <h1 className="page-title">运行时配置</h1>
            <p className="page-subtitle">管理系统运行参数，修改后立即生效</p>
          </div>
        </div>
        <div className="header-right">
          <div className="stats-bar">
            <div className="stat-item">
              <span className="stat-value">{configStats.total}</span>
              <span className="stat-label">配置项</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value public">{configStats.public}</span>
              <span className="stat-label">公开</span>
            </div>
            {modifiedCount > 0 && (
              <>
                <div className="stat-divider" />
                <div className="stat-item">
                  <span className="stat-value modified">{configStats.modified}</span>
                  <span className="stat-label">待保存</span>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 提示信息 */}
      {!canManageConfig && (
        <div className="info-banner">
          <Shield size={18} />
          <span>您当前处于只读模式，需要系统管理权限才能修改配置</span>
        </div>
      )}

      {/* 配置分组卡片 */}
      <div className="config-grid">
        {groupedConfigs.map((group, groupIndex) => {
          const Icon = group.icon;
          const modifiedItems = group.items.filter((item) => editedValues[item.key] !== undefined);

          return (
                          <div
                          key={group.category}
                          className="config-card"
                          style={{ animationDelay: `${groupIndex * 0.05}s` }}
                        >              {/* 卡片头部 */}
              <div className="card-header">
                <div className="card-title-wrapper">
                  <div className="card-icon">
                    <Icon size={20} />
                  </div>
                  <div className="card-title-content">
                    <h2 className="card-title">{group.label}</h2>
                    <span className="card-count">{group.items.length} 项配置</span>
                  </div>
                </div>
                <div className="card-actions">
                  {modifiedItems.length > 0 && (
                    <span className="modified-badge">{modifiedItems.length} 项修改</span>
                  )}
                </div>
              </div>

              {/* 配置项列表 */}
              <div className="card-content">
                <div className="config-list">
                  {group.items.map((item, itemIndex) => {
                    const hasChanges = editedValues[item.key] !== undefined;
                    const isSavingItem = saving.has(item.key);

                    return (
                      <div
                        key={item.key}
                        className={`config-item ${hasChanges ? 'modified' : ''}`}
                        style={{ animationDelay: `${itemIndex * 0.03}s` }}
                      >
                        <div className="config-info">
                          <div className="config-key-wrapper">
                            <span className="config-key">{item.key}</span>
                            <div className="config-badges">
                              {item.isPublic && (
                                <span className="badge public-badge" title="对外公开">
                                  <Eye size={12} />
                                  公开
                                </span>
                              )}
                              {hasChanges && (
                                <span className="badge modified-badge">
                                  <Sparkles size={12} />
                                  已修改
                                </span>
                              )}
                            </div>
                          </div>
                          {item.description && (
                            <p className="config-description">{item.description}</p>
                          )}
                        </div>

                        <div className="config-controls">
                          <div className="input-wrapper">{renderConfigInput(item)}</div>

                          <div className="action-buttons">
                            <button
                              type="button"
                              onClick={() => handleSave(item.key)}
                              disabled={!hasChanges || isSavingItem || !canManageConfig}
                              className={`action-btn save-btn ${hasChanges && !isSavingItem ? 'active' : ''}`}
                              title="保存"
                            >
                              {isSavingItem ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Save size={16} />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleReset(item.key)}
                              disabled={isSavingItem || !canManageConfig}
                              className="action-btn reset-btn"
                              title="重置为默认值"
                            >
                              <RotateCcw size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 空状态 */}
      {groupedConfigs.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <Settings size={48} />
          </div>
          <h3>暂无配置项</h3>
          <p>系统尚未配置任何运行时参数</p>
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
};

export default RuntimeConfigPage;

// 样式定义
const styles = `
  /* ===== 基础布局 ===== */
  .config-page {
    min-height: 100%;
    padding: var(--space-6);
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-family: var(--font-family-base);
  }

  /* ===== 页面头部 ===== */
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: var(--space-6);
    padding-bottom: var(--space-6);
    border-bottom: 1px solid var(--border-default);
  }

  .header-left {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
  }

  .title-icon {
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: var(--shadow-md), var(--glow-primary);
  }

  .title-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .page-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }

  .page-subtitle {
    font-size: 0.875rem;
    color: var(--text-tertiary);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  /* ===== 统计栏 ===== */
  .stats-bar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
  }

  .stat-value.public {
    color: var(--success);
  }

  .stat-value.modified {
    color: var(--warning);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-divider {
    width: 1px;
    height: 32px;
    background: var(--border-default);
  }

  /* ===== 提示横幅 ===== */
  .info-banner {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    background: var(--info-dim);
    border: 1px solid var(--info);
    border-radius: var(--radius-lg);
    color: var(--info);
    margin-bottom: var(--space-6);
    animation: slide-up 0.3s ease-out;
  }

  /* ===== 配置网格 ===== */
  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
    gap: var(--space-5);
  }

  @media (max-width: 640px) {
    .config-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ===== 配置卡片 ===== */
  .config-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    overflow: hidden;
    transition: all 0.3s ease;
    animation: card-enter 0.4s ease-out forwards;
    opacity: 0;
    transform: translateY(10px);
  }

  @keyframes card-enter {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .config-card:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-lg);
  }

  /* ===== 卡片头部 ===== */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-5);
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-default);
  }

  .card-title-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .card-icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: var(--shadow-sm);
  }

  .card-title-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .card-count {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .modified-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--warning-dim);
    color: var(--warning);
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 500;
    animation: pulse-soft 2s ease-in-out infinite;
  }

  /* ===== 卡片内容 ===== */
  .card-content {
    display: block;
  }

  .config-list {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  /* ===== 配置项 ===== */
  .config-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--bg-primary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    transition: all 0.2s ease;
    animation: item-enter 0.3s ease-out forwards;
    opacity: 0;
    transform: translateX(-10px);
  }

  @keyframes item-enter {
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .config-item:hover {
    border-color: var(--border-default);
    box-shadow: var(--shadow-sm);
  }

  .config-item.modified {
    border-color: var(--warning);
    background: linear-gradient(135deg, var(--bg-primary), var(--warning-dim));
  }

  .config-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .config-key-wrapper {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .config-key {
    font-family: var(--font-family-mono);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .config-badges {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 0.6875rem;
    font-weight: 500;
  }

  .public-badge {
    background: var(--success-dim);
    color: var(--success);
  }

  .modified-badge {
    background: var(--warning-dim);
    color: var(--warning);
  }

  .config-description {
    font-size: 0.8125rem;
    color: var(--text-tertiary);
    line-height: 1.5;
    margin: 0;
  }

  .config-controls {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
  }

  .input-wrapper {
    min-width: 200px;
  }

  /* ===== 输入控件 ===== */
  .config-input {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: var(--font-family-mono);
    transition: all 0.2s ease;
  }

  .config-input:hover:not(:disabled) {
    border-color: var(--border-strong);
  }

  .config-input:focus:not(:disabled) {
    outline: none;
    border-color: var(--primary-500);
    box-shadow: 0 0 0 3px var(--primary-100);
  }

  .config-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--bg-tertiary);
  }

  .number-input {
    width: 120px;
    text-align: right;
  }

  .sensitive-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .sensitive-input {
    padding-right: 40px;
  }

  .visibility-toggle {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
  }

  .visibility-toggle:hover {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  /* ===== 开关控件 ===== */
  .toggle-switch {
    width: 52px;
    height: 28px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-full);
    position: relative;
    cursor: pointer;
    border: none;
    padding: 0;
    transition: all 0.2s ease;
  }

  .toggle-switch:hover:not(:disabled) {
    background: var(--border-strong);
  }

  .toggle-switch.active {
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
  }

  [data-theme="dark"] .toggle-switch.active {
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
  }

  .toggle-switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-handle {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 24px;
    height: 24px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: var(--shadow-sm);
  }

  .toggle-switch.active .toggle-handle {
    transform: translateX(24px);
  }

  /* ===== 操作按钮 ===== */
  .action-buttons {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .action-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border-color: var(--border-strong);
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .save-btn.active {
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
    color: white;
    border-color: transparent;
  }

  .save-btn.active:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: var(--shadow-md), var(--glow-primary);
  }

  .reset-btn:hover:not(:disabled) {
    color: var(--error);
    border-color: var(--error);
    background: var(--error-dim);
  }

  /* ===== 加载状态 ===== */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    gap: var(--space-4);
    color: var(--text-tertiary);
  }

  .loading-spinner {
    width: 48px;
    height: 48px;
    border: 3px solid var(--border-default);
    border-top-color: var(--primary-500);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .animate-spin {
    animation: spin 0.8s linear infinite;
  }

  /* ===== 空状态 ===== */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-16);
    text-align: center;
    color: var(--text-tertiary);
  }

  .empty-icon {
    width: 80px;
    height: 80px;
    background: var(--bg-tertiary);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-4);
    color: var(--text-muted);
  }

  .empty-state h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0 0 var(--space-2);
  }

  .empty-state p {
    margin: 0;
    font-size: 0.875rem;
  }

  /* ===== 动画 ===== */
  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pulse-soft {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  /* ===== 深色主题特殊调整 ===== */
  [data-theme="dark"] .config-input:focus {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }

  [data-theme="dark"] .config-item.modified {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), var(--bg-primary));
  }

  [data-theme="dark"] .card-icon {
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
  }

  [data-theme="dark"] .title-icon {
    box-shadow: 0 0 30px rgba(99, 102, 241, 0.4);
  }

  /* ===== 响应式调整 ===== */
  @media (max-width: 768px) {
    .config-page {
      padding: var(--space-4);
    }

    .page-header {
      flex-direction: column;
      gap: var(--space-4);
    }

    .header-right {
      width: 100%;
      justify-content: flex-start;
    }

    .config-item {
      flex-direction: column;
      gap: var(--space-3);
    }

    .config-controls {
      width: 100%;
    }

    .input-wrapper {
      flex: 1;
      min-width: 0;
    }
  }
`;