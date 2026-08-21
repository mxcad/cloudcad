import { t } from '@/languages';
import { triggerBlobDownload } from '@/utils/download';
import { getActionDescription } from '@/utils/auditActionTemplates';
import type { AuditLog } from '@/utils/auditActionTemplates';
import { formatDate, getResourceTypeDisplayName } from '../constants';

/** CSV 字段转义：含逗号/引号/换行时包裹双引号并转义内部引号 */
function escapeCsvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * 将选中的审计日志导出为 CSV 文件（前端生成，零后端改动）
 *
 * - 含 UTF-8 BOM，Excel 打开不乱码；
 * - 列：时间/用户/操作/资源类型/资源/资源ID/状态/详情/IP 地址/失败原因；
 * - 详情列为结构化参数 JSON 摘要（与表格内联展示一致）。
 */
export function exportAuditLogsCsv(logs: AuditLog[]): void {
  if (logs.length === 0) return;

  const header = [
    t('时间'),
    t('用户'),
    t('操作'),
    t('资源类型'),
    t('资源'),
    t('资源 ID'),
    t('状态'),
    t('详情'),
    t('IP 地址'),
    t('失败原因'),
  ];

  const rows = logs.map((log) => [
    formatDate(log.createdAt),
    log.user.nickname || log.user.username || log.user.email || '',
    getActionDescription(log),
    getResourceTypeDisplayName(log.resourceType),
    log.resourceName ?? '',
    log.resourceId ?? '',
    log.success ? t('成功') : t('失败'),
    log.params && Object.keys(log.params).length > 0
      ? JSON.stringify(log.params)
      : '',
    log.ipAddress ?? '',
    log.errorMessage ?? '',
  ]);

  const csv =
    '\uFEFF' +
    [header, ...rows]
      .map((row) => row.map(escapeCsvField).join(','))
      .join('\r\n');

  // 统一 blob 下载工具（含 appendChild 到 body，Firefox 兼容）
  triggerBlobDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  );
}
