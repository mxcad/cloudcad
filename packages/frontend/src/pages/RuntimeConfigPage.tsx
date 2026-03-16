import React, { useState, useEffect, useCallback } from 'react';
import { runtimeConfigApi, RuntimeConfigItem } from '../services/runtimeConfigApi';
import { useNotification } from '../contexts/NotificationContext';

interface ConfigGroup {
  category: string;
  label: string;
  items: RuntimeConfigItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  mail: '邮件配置',
  support: '客服信息',
  file: '文件配置',
  user: '用户管理',
  system: '系统配置',
};

export const RuntimeConfigPage: React.FC = () => {
  const [configs, setConfigs] = useState<RuntimeConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string | number | boolean>>({});
  const { showToast, showConfirm } = useNotification();

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
  ).map(([category, items]) => ({
    category,
    label: CATEGORY_LABELS[category] || category,
    items,
  }));

  const handleValueChange = (key: string, value: string | number | boolean) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key: string) => {
    const value = editedValues[key];
    if (value === undefined) return;

    try {
      setSaving(key);
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
      setSaving(null);
    }
  };

  const handleReset = async (key: string) => {
    const confirmed = await showConfirm({
      title: '确认重置',
      message: '确定要将此配置重置为默认值吗？',
      confirmText: '确认重置',
      cancelText: '取消',
      type: 'warning',
    });

    if (!confirmed) return;

    try {
      setSaving(key);
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
      setSaving(null);
    }
  };

  const parseValue = (item: RuntimeConfigItem): string | number | boolean => {
    const edited = editedValues[item.key];
    if (edited !== undefined) {
      return edited;
    }
    return item.value as unknown as string | number | boolean;
  };

  const renderConfigInput = (item: RuntimeConfigItem) => {
    const value = parseValue(item);

    if (item.type === 'boolean') {
      return (
        <select
          value={value ? 'true' : 'false'}
          onChange={(e) => handleValueChange(item.key, e.target.value === 'true')}
          className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="true">开启</option>
          <option value="false">关闭</option>
        </select>
      );
    }

    if (item.type === 'number') {
      return (
        <input
          type="number"
          value={value as number}
          onChange={(e) => handleValueChange(item.key, Number(e.target.value))}
          className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-32"
        />
      );
    }

    return (
      <input
        type="text"
        value={value as string}
        onChange={(e) => handleValueChange(item.key, e.target.value)}
        className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex-1 min-w-[200px]"
        placeholder="请输入..."
      />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-lg text-slate-600">加载中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">运行时配置</h1>
        <p className="text-sm text-slate-500">修改配置后立即生效，无需重启服务</p>
      </div>

      {groupedConfigs.map((group) => (
        <div key={group.category} className="bg-white rounded-lg shadow-sm border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-700">{group.label}</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {group.items.map((item) => {
              const hasChanges = editedValues[item.key] !== undefined;
              const isSaving = saving === item.key;

              return (
                <div key={item.key} className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">{item.key}</span>
                      {item.isPublic && (
                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                          公开
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-sm text-slate-500 mt-1">{item.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {renderConfigInput(item)}
                    <button
                      onClick={() => handleSave(item.key)}
                      disabled={!hasChanges || isSaving}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        hasChanges && !isSaving
                          ? 'bg-blue-500 text-white hover:bg-blue-600'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {isSaving ? '保存中...' : '保存'}
                    </button>
                    <button
                      onClick={() => handleReset(item.key)}
                      disabled={isSaving}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                    >
                      重置
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {groupedConfigs.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
          <p className="text-slate-500">暂无配置项</p>
        </div>
      )}
    </div>
  );
};

export default RuntimeConfigPage;
