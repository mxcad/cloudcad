import React, { useState, useEffect } from 'react';
import { Activity, Database, HardDrive, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { apiService } from '../services/api';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission } from '../constants/permissions';

// 健康状态接口
interface HealthStatus {
  status: 'up' | 'down';
  message: string;
  timestamp: string;
}

// 系统健康状态接口
interface SystemHealth {
  database: HealthStatus;
  storage: HealthStatus;
}

export const SystemMonitorPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionChecked, setPermissionChecked] = useState(false);

  // 延迟检查权限，确保用户数据已加载
  useEffect(() => {
    setPermissionChecked(true);
  }, []);

  // 获取系统健康状态
  const fetchSystemHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.get('/health');
      // 后端返回的是 NestJS Terminus 的 HealthCheckResult 格式
      // { status: 'ok', info: { database: {...}, storage: {...} } }
      const healthData = response.data;
      if (healthData && healthData.info) {
        // 添加 timestamp
        const timestamp = new Date().toISOString();
        setSystemHealth({
          database: {
            ...healthData.info.database,
            timestamp,
          },
          storage: {
            ...healthData.info.storage,
            timestamp,
          },
        });
      } else {
        throw new Error('无效的响应数据格式');
      }
    } catch (err) {
      setError('获取系统健康状态失败');
      console.error('获取系统健康状态失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 仅在有权限时才执行健康状态检查
  useEffect(() => {
    if (!permissionChecked || !hasPermission(SystemPermission.SYSTEM_MONITOR)) {
      return;
    }
    fetchSystemHealth();
    // 每 30 秒自动刷新
    const interval = setInterval(fetchSystemHealth, 30000);
    return () => clearInterval(interval);
  }, [permissionChecked]);

  // 等待权限检查完成
  if (!permissionChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  // 检查是否有系统监控权限
  if (!hasPermission(SystemPermission.SYSTEM_MONITOR)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500">您没有访问系统监控的权限</p>
        </div>
      </div>
    );
  }

  // 获取状态图标
  const getStatusIcon = (status: 'up' | 'down') => {
    return status === 'up' ? (
      <CheckCircle size={24} className="text-green-500" />
    ) : (
      <XCircle size={24} className="text-red-500" />
    );
  };

  // 获取状态文本
  const getStatusText = (status: 'up' | 'down') => {
    return status === 'up' ? '正常' : '异常';
  };

  // 获取状态背景色
  const getStatusBg = (status: 'up' | 'down') => {
    return status === 'up' ? 'bg-green-50' : 'bg-red-50';
  };

  // 获取状态边框色
  const getStatusBorder = (status: 'up' | 'down') => {
    return status === 'up' ? 'border-green-200' : 'border-red-200';
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* 页面标题 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Activity size={28} className="text-blue-600" />
              系统监控
            </h1>
            <p className="text-gray-500 mt-1">实时监控系统健康状态</p>
          </div>
          <button
            onClick={fetchSystemHealth}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertTriangle size={20} className="text-red-500" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* 加载状态 */}
        {loading && !systemHealth && (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">加载中...</div>
          </div>
        )}

        {/* 系统健康状态 */}
        {systemHealth && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 数据库状态 */}
            <div
              className={`bg-white rounded-lg shadow-sm p-6 ${getStatusBg(systemHealth.database.status)} border ${getStatusBorder(systemHealth.database.status)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Database size={32} className="text-blue-600" />
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">数据库</h3>
                    <p className="text-sm text-gray-500">PostgreSQL 数据库连接</p>
                  </div>
                </div>
                {getStatusIcon(systemHealth.database.status)}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">状态</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {getStatusText(systemHealth.database.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-gray-600">消息</span>
                  <span className="text-sm text-gray-700">
                    {systemHealth.database.message}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-gray-600">检查时间</span>
                  <span className="text-sm text-gray-700">
                    {new Date(systemHealth.database.timestamp).toLocaleString('zh-CN')}
                  </span>
                </div>
              </div>
            </div>

            {/* 存储服务状态 */}
            <div
              className={`bg-white rounded-lg shadow-sm p-6 ${getStatusBg(systemHealth.storage.status)} border ${getStatusBorder(systemHealth.storage.status)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <HardDrive size={32} className="text-purple-600" />
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">存储服务</h3>
                    <p className="text-sm text-gray-500">本地文件存储</p>
                  </div>
                </div>
                {getStatusIcon(systemHealth.storage.status)}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">状态</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {getStatusText(systemHealth.storage.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-gray-600">消息</span>
                  <span className="text-sm text-gray-700">
                    {systemHealth.storage.message}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-gray-600">检查时间</span>
                  <span className="text-sm text-gray-700">
                    {new Date(systemHealth.storage.timestamp).toLocaleString('zh-CN')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 系统信息 */}
        <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">系统信息</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <span className="text-sm text-gray-500">系统名称</span>
              <p className="text-sm font-semibold text-gray-900">CloudCAD</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">环境</span>
              <p className="text-sm font-semibold text-gray-900">
                {import.meta.env.MODE === 'production' ? '生产环境' : '开发环境'}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-500">自动刷新</span>
              <p className="text-sm font-semibold text-gray-900">30 秒</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};