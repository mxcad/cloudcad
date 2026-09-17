///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 后台任务名称常量（#210 定案：全任务执行记录 + 手动触发注册表 key）
 * 命名约定：`<调度器>:<动作>`，与 runtime-config 开关一一对应
 */
export const TASK_NAMES = {
  STORAGE_CLEANUP: {
    EXPIRED_STORAGE: 'storage-cleanup:expired-storage',
    TRASH: 'storage-cleanup:trash',
    LOCKS: 'storage-cleanup:locks',
    DISK_MONITOR: 'storage-cleanup:disk-monitor',
    ORPHANS: 'storage-cleanup:orphans',
  },
  CACHE_CLEANUP: {
    WARNING_CHECK: 'cache-cleanup:warning-check',
    STATS_LOG: 'cache-cleanup:stats-log',
    HEALTH_CHECK: 'cache-cleanup:health-check',
  },
  AUDIT_CLEANUP: {
    LOGS: 'audit-cleanup:logs',
    RUNS: 'audit-cleanup:task-runs',
  },
  BATCH_DOWNLOAD: {
    ZIP_CLEANUP: 'batch-download:zip-cleanup',
    DB_CLEANUP: 'batch-download:db-cleanup',
    CONVERSION_CACHE_CLEANUP: 'batch-download:conversion-cache-cleanup',
  },
  BILLING: {
    DOWNGRADE_MEMBERSHIPS: 'billing:downgrade-memberships',
    TIMEOUT_ORDERS: 'billing:timeout-orders',
  },
  USER_CLEANUP: {
    USERS: 'user-cleanup:users',
  },
  CACHE_MONITOR: {
    PERFORMANCE_DATA: 'cache-monitor:performance-data',
  },
  BACKUP: {
    DATABASE: 'backup:database',
    RESTORE_DRILL: 'backup:restore-drill',
    REMOTE_PUSH: 'backup:remote-push',
    /** 本地轮转清理（#325 cleanup_* 指标 task 标签；无独立运行时开关） */
    ROTATE: 'backup:rotate',
    /** 审计归档目录异地同步（#420，随每日备份后执行；无独立运行时开关） */
    AUDIT_ARCHIVE_SYNC: 'backup:audit-archive-sync',
  },
} as const;

/**
 * 后台任务 runtime-config 开关 key（#210 定案：沿用 storageCleanupEnabled 模式）
 */
export const TASK_ENABLED_KEYS = {
  STORAGE: 'storageCleanupEnabled',
  TRASH: 'trashCleanupEnabled',
  LOCKS: 'lockCleanupEnabled',
  DISK_MONITOR: 'diskMonitorEnabled',
  ORPHANS: 'orphanCleanupEnabled',
  CACHE_CLEANUP: 'cacheCleanupEnabled',
  AUDIT_CLEANUP: 'auditCleanupEnabled',
  BATCH_DOWNLOAD: 'batchDownloadCleanupEnabled',
  BILLING: 'billingCronEnabled',
  USER_CLEANUP: 'userCleanupEnabled',
  CACHE_MONITOR: 'cacheMonitorEnabled',
  BACKUP: 'backupEnabled',
} as const;
