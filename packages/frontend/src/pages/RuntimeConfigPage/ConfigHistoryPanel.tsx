///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 修改历史抽屉：按 `GET /api/runtime-config/:key/history` 拉取，
 * 展示时间 / 操作者 / IP / 旧值 → 新值。
 */

import React from 'react';
import {
  History,
  Loader2,
  AlertCircle,
  UserCircle,
  MapPin,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import styles from './RuntimeConfigPage.module.css';
import { formatDateTimeWithSeconds } from '@/utils/dateUtils';
import { formatValue } from './meta';
import type { ConfigHistoryEntry, ConfigItem, ConfigValue } from './types';
import { t } from '@/languages';

interface ConfigHistoryPanelProps {
  item: ConfigItem | null;
  entries: ConfigHistoryEntry[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

/**
 * 历史里存的是值的 JSON 编码（`JSON.stringify(value)`），
 * 需先解一层再走 formatValue，否则字符串值会带多余引号。
 */
function formatStoredValue(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  try {
    return formatValue(JSON.parse(raw) as ConfigValue);
  } catch {
    return raw;
  }
}

export const ConfigHistoryPanel: React.FC<ConfigHistoryPanelProps> = ({
  item,
  entries,
  loading,
  error,
  onClose,
}) => {
  return (
    <Modal
      isOpen={item !== null}
      onClose={onClose}
      size="lg"
      title={
        item ? (
          <span className={styles.historyTitle}>
            <History size={16} />
            <span className={styles.configKey}>{item.key}</span>
            <span className={styles.historyTitleSub}>
              {item.description ?? ''}
            </span>
          </span>
        ) : (
          t('修改历史')
        )
      }
    >
      {loading && (
        <div className={styles.loadingState} data-testid="rc-history-loading">
          <Loader2 size={20} className="animate-spin" />
          <span>{t('正在加载修改历史...')}</span>
        </div>
      )}

      {!loading && error && (
        <div className={styles.fieldError} data-testid="rc-history-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className={styles.historyEmpty}>{t('该配置项暂无修改记录')}</p>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className={styles.historyList} data-testid="rc-history-list">
          {entries.map((entry) => (
            <div key={entry.id} className={styles.historyEntry}>
              <div className={styles.historyTime}>
                <span>{formatDateTimeWithSeconds(entry.createdAt)}</span>
                {entry.operatorId && (
                  <span className={styles.historyOperator}>
                    <UserCircle size={12} />
                    <span>{entry.operatorId}</span>
                  </span>
                )}
                {entry.operatorIp && (
                  <span className={styles.historyOperator}>
                    <MapPin size={12} />
                    <span>{entry.operatorIp}</span>
                  </span>
                )}
              </div>
              <div className={styles.historyDiff}>
                <span className={styles.diffLabel}>{t('旧值')}</span>
                <code className={styles.diffValue}>
                  {formatStoredValue(entry.oldValue)}
                </code>
                <span className={styles.diffArrow}>→</span>
                <span className={styles.diffLabel}>{t('新值')}</span>
                <code className={`${styles.diffValue} ${styles.diffCurrent}`}>
                  {formatStoredValue(entry.newValue)}
                </code>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};
