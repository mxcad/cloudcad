import React, { useState } from 'react';
import { Filter } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Pagination } from '../components/ui/Pagination';
import { Tag } from '../components/ui/Tag';
import { DescriptionText } from '../components/ui/TruncateText';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission } from '../constants/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { t } from '@/languages';
import { useAuditLogList, useAuditLogStats } from './AuditLogPage/hooks/useAuditLog';
import './AuditLogPage/AuditLogPage.css';

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
} as const;

type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

// 资源类型
const ResourceType = {
  SYSTEM: 'SYSTEM',
  USER: 'USER',
  ROLE: 'ROLE',
  PERMISSION: 'PERMISSION',
  PROJECT: 'PROJECT',
  FILE: 'FILE',
  FOLDER: 'FOLDER',
} as const;

type ResourceTypeType = (typeof ResourceType)[keyof typeof ResourceType];

// 操作类型中文映射
const ACTION_NAME_MAP: Record<string, string> = {
  PERMISSION_GRANT: t('授予权限'),
  PERMISSION_REVOKE: t('撤销权限'),
  ROLE_CREATE: t('创建角色'),
  ROLE_UPDATE: t('更新角色'),
  ROLE_DELETE: t('删除角色'),
  USER_LOGIN: t('用户登录'),
  USER_LOGOUT: t('用户登出'),
  PROJECT_CREATE: t('创建项目'),
  PROJECT_DELETE: t('删除项目'),
  FILE_UPLOAD: t('上传文件'),
  FILE_DOWNLOAD: t('下载文件'),
  FILE_DELETE: t('删除文件'),
  FILE_SHARE: t('分享文件'),
  ADD_MEMBER: t('添加成员'),
  UPDATE_MEMBER: t('更新成员'),
  REMOVE_MEMBER: t('移除成员'),
  TRANSFER_OWNERSHIP: t('转让所有权'),
};

// 资源类型中文映射
const RESOURCE_TYPE_MAP: Record<string, string> = {
  SYSTEM: t('系统'),
  USER: t('用户'),
  ROLE: t('角色'),
  PERMISSION: t('权限'),
  PROJECT: t('项目'),
  FILE: t('文件'),
  FOLDER: t('文件夹'),
};

export const AuditLogPage: React.FC = () => {
  useDocumentTitle(t("审计日志"));
  const { hasPermission } = usePermission();

  const [page, setPage] = useState(1);
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

  // 构建查询参数（仅传递有值的筛选项）
  const queryParams = {
    page: String(page),
    limit: String(limit),
    ...(filters.userId && { userId: filters.userId }),
    ...(filters.action && { action: filters.action }),
    ...(filters.resourceType && { resourceType: filters.resourceType }),
    ...(filters.resourceId && { resourceId: filters.resourceId }),
    ...(filters.startDate && { startDate: filters.startDate }),
    ...(filters.endDate && { endDate: filters.endDate }),
    ...(filters.success !== '' && {
      success: filters.success === 'true' ? 'true' : 'false',
    }),
  };

  // 检查是否有系统管理员权限
  const hasAdminPermission = hasPermission(SystemPermission.SYSTEM_ADMIN);

  const {
    logs,
    total,
    loading,
    error: logsError,
    refetch: refetchLogs,
  } = useAuditLogList(queryParams);

  const {
    statistics,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useAuditLogStats();

  // 如果没有权限，在所有 Hooks 调用之后再返回
  if (!hasAdminPermission) {
    return (
      <div className="audit-permission-denied">
        <div className="text-center">
          <p>{t("您没有访问审计日志的权限")}</p>
        </div>
      </div>
    );
  }

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

  const handleRefresh = () => {
    refetchLogs();
    refetchStats();
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
    return t(ACTION_NAME_MAP[action] || action);
  };

  const getResourceTypeDisplayName = (resourceType: string): string => {
    return t(RESOURCE_TYPE_MAP[resourceType] || resourceType);
  };

  const totalPages = Math.ceil((total || 0) / limit);

  return (
    <div className="audit-page">
      <div className="audit-page-header">
        <h1 className="audit-page-title">{t("审计日志")}</h1>
        <p className="audit-page-subtitle">{t("查看系统操作审计日志")}</p>
      </div>

      {/* 统计信息 */}
      <div className="audit-stat-grid">
        <div className="audit-stat-card">
          <div className="audit-stat-label">{t("总记录数")}</div>
          <div className="audit-stat-value">
            {statistics.total}
          </div>
        </div>
        <div className="audit-stat-card">
          <div className="audit-stat-label">{t("成功次数")}</div>
          <div className="audit-stat-value audit-stat-value--success">
            {statistics.successCount}
          </div>
        </div>
        <div className="audit-stat-card">
          <div className="audit-stat-label">{t("失败次数")}</div>
          <div className="audit-stat-value audit-stat-value--error">
            {statistics.failureCount}
          </div>
        </div>
        <div className="audit-stat-card">
          <div className="audit-stat-label">{t("成功率")}</div>
          <div className="audit-stat-value audit-stat-value--info">
            {(statistics.successRate ?? 0).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* 筛选条件 */}
      <div className="audit-filter-section">
        <div className="audit-filter-title">
          <Filter className="w-5 h-5" />
          <h2>{t("筛选条件")}</h2>
        </div>
        <div className="audit-filter-grid">
          <div>
            <label className="audit-label">
              {t("用户 ID")}
            </label>
            <Input
              type="text"
              placeholder={t("输入用户 ID")}
              value={filters.userId}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
            />
          </div>
          <div>
            <label className="audit-label">
              {t("操作类型")}
            </label>
            <Select
              value={filters.action}
              onChange={(value) => handleFilterChange('action', value)}
              options={Object.values(AuditAction).map((action) => ({
                value: action,
                label: getActionDisplayName(action),
              }))}
              placeholder={t("全部")}
              clearable
            />
          </div>
          <div>
            <label className="audit-label">
              {t("资源类型")}
            </label>
            <Select
              value={filters.resourceType}
              onChange={(value) => handleFilterChange('resourceType', value)}
              options={Object.values(ResourceType).map((type) => ({
                value: type,
                label: getResourceTypeDisplayName(type),
              }))}
              placeholder={t("全部")}
              clearable
            />
          </div>
          <div>
            <label className="audit-label">
              {t("资源 ID")}
            </label>
            <Input
              type="text"
              placeholder={t("输入资源 ID")}
              value={filters.resourceId}
              onChange={(e) => handleFilterChange('resourceId', e.target.value)}
            />
          </div>
          <div>
            <label className="audit-label">
              {t("开始日期")}
            </label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
            />
          </div>
          <div>
            <label className="audit-label">
              {t("结束日期")}
            </label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
            />
          </div>
          <div>
            <label className="audit-label">
              {t("状态")}
            </label>
            <Select
              value={filters.success}
              onChange={(value) => handleFilterChange('success', value)}
              options={[
                { value: 'true', label: t("成功") },
                { value: 'false', label: t("失败") },
              ]}
              placeholder={t("全部")}
              clearable
            />
          </div>
        </div>
        <div className="audit-filter-actions">
          <Button onClick={handleResetFilters} variant="outline" size="sm">
            {t("重置筛选")}
          </Button>
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`}
            />
            {t("刷新")}
          </Button>
        </div>
      </div>

      {/* 审计日志列表 */}
      <div className="audit-table-container">
        <div className="audit-table-scroll">
          <table className="audit-table">
            <thead>
              <tr>
                <th>{t("时间")}</th>
                <th>{t("用户")}</th>
                <th>{t("操作")}</th>
                <th>{t("资源类型")}</th>
                <th>{t("资源 ID")}</th>
                <th>{t("状态")}</th>
                <th>{t("详情")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="audit-table-empty"
                  >
                    <span className="audit-loading-text">{t("加载中...")}</span>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                    <td
                      colSpan={7}
                      className="audit-table-empty"
                    >
                      {t("暂无数据")}
                    </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      {formatDate(log.createdAt)}
                    </td>
                    <td>
                      <div className="audit-user-cell">
                        <div className="audit-user-name">{log.user.username}</div>
                        <div className="audit-user-email">
                          {log.user.email}
                        </div>
                      </div>
                    </td>
                    <td>
                      {getActionDisplayName(log.action)}
                    </td>
                    <td>
                      {getResourceTypeDisplayName(log.resourceType)}
                    </td>
                    <td>
                      <DescriptionText maxWidth={20}>
                        {log.resourceId || '-'}
                      </DescriptionText>
                    </td>
                    <td>
                      {log.success ? (
                        <Tag variant="success">{t("成功")}</Tag>
                      ) : (
                        <Tag variant="error">{t("失败")}</Tag>
                      )}
                    </td>
                    <td>
                      <DescriptionText maxWidth={30}>
                        {log.details || '-'}
                      </DescriptionText>
                      {log.errorMessage && (
                        <div className="audit-error-msg">
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
          <Pagination
            meta={{
              total: total || 0,
              page: page,
              limit: limit,
              totalPages: totalPages,
            }}
            onPageChange={(p) => setPage(p)}
            simple
          />
        )}
      </div>
    </div>
  );
};

export default AuditLogPage;
