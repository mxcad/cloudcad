import React, { useState, useEffect } from 'react';
import { Filter, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { DescriptionText } from '../components/ui/TruncateText';
import { apiService } from '../services/apiService';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission } from '../constants/permissions';

// 审计操作类型
const AuditAction = {
  PERMISSION_GRANT: 'PERMISSION_GRANT',
  PERMISSION_REVOKE: 'PERMISSION_REVOKE',
  ROLE_CREATE: 'ROLE_CREATE',
  ROLE_UPDATE: 'ROLE_UPDATE',
  ROLE_DELETE: 'ROLE_DELETE',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  PROJECT_CREATE: 'PROJECT_CREATE',
  PROJECT_DELETE: 'PROJECT_DELETE',
  FILE_UPLOAD: 'FILE_UPLOAD',
  FILE_DOWNLOAD: 'FILE_DOWNLOAD',
  FILE_DELETE: 'FILE_DELETE',
  FILE_SHARE: 'FILE_SHARE',
  ADD_MEMBER: 'ADD_MEMBER',
  UPDATE_MEMBER: 'UPDATE_MEMBER',
  REMOVE_MEMBER: 'REMOVE_MEMBER',
  TRANSFER_OWNERSHIP: 'TRANSFER_OWNERSHIP',
  ACCESS_DENIED: 'ACCESS_DENIED',
} as const;

type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

// 资源类型
const ResourceType = {
  USER: 'USER',
  ROLE: 'ROLE',
  PERMISSION: 'PERMISSION',
  PROJECT: 'PROJECT',
  FILE: 'FILE',
  FOLDER: 'FOLDER',
} as const;

type ResourceTypeType = (typeof ResourceType)[keyof typeof ResourceType];

// 审计日志接口
interface AuditLog {
  id: string;
  action: AuditActionType;
  resourceType: ResourceTypeType;
  resourceId: string | null;
  userId: string;
  user: {
    id: string;
    email: string;
    username: string;
    nickname: string | null;
  };
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

// 操作类型中文映射
const ACTION_NAME_MAP: Record<string, string> = {
  PERMISSION_GRANT: '授予权限',
  PERMISSION_REVOKE: '撤销权限',
  ROLE_CREATE: '创建角色',
  ROLE_UPDATE: '更新角色',
  ROLE_DELETE: '删除角色',
  USER_LOGIN: '用户登录',
  USER_LOGOUT: '用户登出',
  PROJECT_CREATE: '创建项目',
  PROJECT_DELETE: '删除项目',
  FILE_UPLOAD: '上传文件',
  FILE_DOWNLOAD: '下载文件',
  FILE_DELETE: '删除文件',
  FILE_SHARE: '分享文件',
  ADD_MEMBER: '添加成员',
  UPDATE_MEMBER: '更新成员',
  REMOVE_MEMBER: '移除成员',
  TRANSFER_OWNERSHIP: '转让所有权',
  ACCESS_DENIED: '访问拒绝',
};

// 资源类型中文映射
const RESOURCE_TYPE_MAP: Record<string, string> = {
  USER: '用户',
  ROLE: '角色',
  PERMISSION: '权限',
  PROJECT: '项目',
  FILE: '文件',
  FOLDER: '文件夹',
};

export const AuditLogPage: React.FC = () => {
  const { hasPermission } = usePermission();

  // 检查是否有系统管理员权限
  if (!hasPermission(SystemPermission.SYSTEM_ADMIN)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500">您没有访问审计日志的权限</p>
        </div>
      </div>
    );
  }

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);

  // 筛选条件
  const [filters, setFilters] = useState({
    userId: '',
    action: '',
    resourceType: '',
    resourceId: '',
    startDate: '',
    endDate: '',
    success: '',
  });

  // 统计信息
  const [statistics, setStatistics] = useState({
    total: 0,
    successCount: 0,
    failureCount: 0,
    successRate: 0,
  });

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params: any = {
        page,
        limit,
      };

      // 添加筛选条件
      if (filters.userId) params.userId = filters.userId;
      if (filters.action) params.action = filters.action;
      if (filters.resourceType) params.resourceType = filters.resourceType;
      if (filters.resourceId) params.resourceId = filters.resourceId;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.success !== '') params.success = filters.success === 'true';

      const response = await apiService.get('/audit/logs', { params });
      setLogs(response.data.logs || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('加载审计日志失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const params: any = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.userId) params.userId = filters.userId;

      const response = await apiService.get('/audit/statistics', { params });
      setStatistics(response.data);
    } catch (error) {
      console.error('加载统计信息失败:', error);
    }
  };

  useEffect(() => {
    loadLogs();
    loadStatistics();
  }, [page, filters]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1); // 重置到第一页
  };

  const handleResetFilters = () => {
    setFilters({
      userId: '',
      action: '',
      resourceType: '',
      resourceId: '',
      startDate: '',
      endDate: '',
      success: '',
    });
    setPage(1);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionDisplayName = (action: string): string => {
    return ACTION_NAME_MAP[action] || action;
  };

  const getResourceTypeDisplayName = (resourceType: string): string => {
    return RESOURCE_TYPE_MAP[resourceType] || resourceType;
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">审计日志</h1>
        <p className="text-gray-600">查看系统操作审计日志</p>
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">总记录数</div>
          <div className="text-2xl font-bold text-gray-900">
            {statistics.total}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">成功次数</div>
          <div className="text-2xl font-bold text-green-600">
            {statistics.successCount}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">失败次数</div>
          <div className="text-2xl font-bold text-red-600">
            {statistics.failureCount}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">成功率</div>
          <div className="text-2xl font-bold text-blue-600">
            {statistics.successRate.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* 筛选条件 */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">筛选条件</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              用户 ID
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入用户 ID"
              value={filters.userId}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              操作类型
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
            >
              <option value="">全部</option>
              {Object.values(AuditAction).map((action) => (
                <option key={action} value={action}>
                  {getActionDisplayName(action)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              资源类型
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.resourceType}
              onChange={(e) =>
                handleFilterChange('resourceType', e.target.value)
              }
            >
              <option value="">全部</option>
              {Object.values(ResourceType).map((type) => (
                <option key={type} value={type}>
                  {getResourceTypeDisplayName(type)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              资源 ID
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入资源 ID"
              value={filters.resourceId}
              onChange={(e) => handleFilterChange('resourceId', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              开始日期
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              结束日期
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              状态
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.success}
              onChange={(e) => handleFilterChange('success', e.target.value)}
            >
              <option value="">全部</option>
              <option value="true">成功</option>
              <option value="false">失败</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={handleResetFilters} variant="outline" size="sm">
            重置筛选
          </Button>
          <Button
            onClick={loadLogs}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`}
            />
            刷新
          </Button>
        </div>
      </div>

      {/* 审计日志列表 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  时间
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  用户
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  资源类型
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  资源 ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  详情
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    加载中...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    暂无数据
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div className="font-medium">{log.user.username}</div>
                        <div className="text-gray-500 text-xs">
                          {log.user.email}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getActionDisplayName(log.action)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getResourceTypeDisplayName(log.resourceType)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <DescriptionText
                        text={log.resourceId || '-'}
                        maxLength={20}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {log.success ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          成功
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          失败
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <DescriptionText
                        text={log.details || '-'}
                        maxLength={30}
                      />
                      {log.errorMessage && (
                        <div className="text-red-600 text-xs mt-1">
                          {log.errorMessage}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                显示第 {(page - 1) * limit + 1} 到{' '}
                {Math.min(page * limit, total)} 条，共 {total} 条
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  variant="outline"
                  size="sm"
                >
                  上一页
                </Button>
                <span className="px-3 py-1 text-sm text-gray-700">
                  第 {page} / {totalPages} 页
                </span>
                <Button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  variant="outline"
                  size="sm"
                >
                  下一页
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
