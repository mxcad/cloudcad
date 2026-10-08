///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 协同详细日志卡片：开关（引擎 mxcad_ini.json 的 coordinate_log_enable）+ 日志位置。
 *
 * 数据走独立 admin 端点——单一事实源是引擎目录下的 ini 文件本身，不进
 * runtime-config 键体系，手动编辑 ini 也能在这里如实显示。
 * 协同（cooperate）是 PM2 长驻进程、仅在启动时读 ini，因此保存成功后必须
 * 提示「需重启协同服务才对协同编辑生效」。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';
import {
  adminControllerGetMxcadEngineConfig,
  adminControllerUpdateCoordinateLog,
} from '@/api-sdk';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { useCopy } from '@/hooks/useCopy';
import { useNotification } from '@/contexts/NotificationContext';
import { getErrorMessage, handleError } from '@/utils/errorHandler';
import styles from './RuntimeConfigPage.module.css';
import { t } from '@/languages';

interface CoordinateLogCardProps {
  /** 与页面其他行一致：无 SYSTEM_CONFIG_WRITE 时开关与保存只读 */
  canManage: boolean;
}

export const CoordinateLogCard: React.FC<CoordinateLogCardProps> = ({
  canManage,
}) => {
  const { showToast } = useNotification();
  const { copiedMarker, copy } = useCopy({
    successMessage: t('已复制'),
    failMessage: t('复制失败，请手动复制'),
  });

  /** null = 首次加载中 */
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await adminControllerGetMxcadEngineConfig();
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出
      if (result.error || !result.data) throw result.error;
      setEnabled(result.data.enabled);
      setLogPath(result.data.logPath);
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error) || t('获取协同日志配置失败'));
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const handleToggle = useCallback(
    async (next: boolean) => {
      setSaving(true);
      try {
        const result = await adminControllerUpdateCoordinateLog({
          body: { enabled: next },
        });
        if (result.error || !result.data) throw result.error;
        setEnabled(result.data.enabled);
        if (result.data.logPath !== null) setLogPath(result.data.logPath);
        showToast(
          t('协同日志开关已保存，需重启协同服务后才会对协同编辑生效。'),
          'success'
        );
      } catch (error: unknown) {
        handleError(error, t('保存协同日志开关失败'));
        showToast(getErrorMessage(error) || t('保存协同日志开关失败'), 'error');
      } finally {
        setSaving(false);
      }
    },
    [showToast]
  );

  const loading = enabled === null;
  const copied = copiedMarker === 'coordinate-log';

  return (
    <div className={styles.configItem} data-testid="rc-coordinate-log">
      {/* 第一行：标题 + 开关（与页面布尔项同款 switchRow） */}
      <div className={styles.itemHeader}>
        <div className={styles.itemTitle}>
          <span className={styles.configName}>{t('启用协同详细日志')}</span>
          <span className={styles.configKey}>coordinate_log_enable</span>
        </div>
        <div className={styles.itemActions}>
          <div
            className={styles.switchRow}
            data-testid="rc-coordinate-log-switch"
          >
            <Checkbox
              size="sm"
              checked={enabled === true}
              disabled={loading || saving || !canManage}
              onChange={(e) => {
                void handleToggle(e.target.checked);
              }}
            />
            <span className={styles.switchText}>
              {loading ? t('加载中...') : enabled ? t('已开启') : t('已关闭')}
            </span>
          </div>
        </div>
      </div>

      {/* 第二行：说明 + 日志位置 */}
      <div className={styles.itemBody}>
        <div className={styles.impactRow}>
          <AlertCircle size={13} />
          <span>
            {t(
              '开启后引擎将输出协同运行的详细诊断日志，用于排查协同问题。修改后需重启协同服务才会对协同编辑生效。'
            )}
          </span>
        </div>

        <div className={styles.controlRow} data-testid="rc-coordinate-log-path">
          <Input
            size="md"
            value={logPath ?? ''}
            readOnly
            aria-label={t('日志位置')}
            placeholder={
              loading
                ? ''
                : t('未能获取日志目录（引擎探测失败），请确认引擎已安装。')
            }
          />
          <Button
            variant="secondary"
            size="sm"
            icon={copied ? Check : Copy}
            disabled={logPath === null}
            onClick={() => {
              if (logPath) void copy(logPath, 'coordinate-log');
            }}
            data-testid="rc-coordinate-log-copy"
          >
            {copied ? t('已复制') : t('复制')}
          </Button>
        </div>

        {loadError && (
          <div
            className={styles.fieldError}
            data-testid="rc-coordinate-log-error"
          >
            <AlertCircle size={13} />
            <span>{loadError}</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                void fetchConfig();
              }}
            >
              {t('重试')}
            </Button>
          </div>
        )}

        {!canManage && <span className={styles.readOnlyTag}>{t('只读')}</span>}
      </div>
    </div>
  );
};
