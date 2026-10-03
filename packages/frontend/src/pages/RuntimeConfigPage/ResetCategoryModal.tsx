///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 分类级批量恢复默认：确认前展示「将恢复这 N 项」的预览列表，
 * 并对已由环境变量注入的项单独提示（恢复默认不会回到代码默认值）。
 */

import React from 'react';
import { RotateCcw, TerminalSquare } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import styles from './RuntimeConfigPage.module.css';
import type { ConfigGroup } from './types';
import { t } from '@/languages';

interface ResetCategoryModalProps {
  group: ConfigGroup | null;
  saving: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const ResetCategoryModal: React.FC<ResetCategoryModalProps> = ({
  group,
  saving,
  onConfirm,
  onCancel,
}) => {
  const envItems = group
    ? group.items.filter((i) => i.envValue !== null && i.envValue !== undefined)
    : [];

  return (
    <Modal
      isOpen={group !== null}
      onClose={onCancel}
      size="lg"
      title={
        group
          ? t('恢复「{label}」为默认值', { label: group.label })
          : t('恢复默认')
      }
      footer={
        <div className={styles.modalFooter}>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            {t('取消')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={RotateCcw}
            loading={saving}
            onClick={() => {
              void onConfirm();
            }}
            data-testid="rc-confirm-reset-category"
          >
            {t('确认恢复 {n} 项', { n: String(group?.items.length ?? 0) })}
          </Button>
        </div>
      }
    >
      {group && (
        <>
          <p className={styles.modalLead}>
            {t('将恢复以下 {n} 项配置的显式修改，恢复后取值回到代码默认值。', {
              n: String(group.items.length),
            })}
          </p>

          {envItems.length > 0 && (
            <div className={styles.envNote}>
              <TerminalSquare size={13} />
              <span>
                {t(
                  '其中 {n} 项已由环境变量注入，恢复默认后生效值将变为环境变量值，而不是代码默认值。',
                  {
                    n: String(envItems.length),
                  }
                )}
              </span>
            </div>
          )}

          <div className={styles.previewList} data-testid="rc-reset-preview">
            {group.items.map((item) => (
              <div
                key={item.key}
                className={`${styles.previewRow} ${item.isModified ? styles.previewRowModified : ''}`}
              >
                <span className={styles.configKey}>{item.key}</span>
                <span className={styles.previewDesc}>
                  {item.description ?? ''}
                </span>
                {item.isModified && (
                  <span className={styles.previewTag}>{t('将恢复')}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
};
