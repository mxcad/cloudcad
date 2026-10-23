///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 安全模式切换确认：应用前先展示「将改动这 N 项」的预览列表，
 * 并对当前由系统预置的项单独提示（切换不会改变它们的实际生效值）。
 */

import React from 'react';
import { ShieldAlert, ShieldCheck, TerminalSquare } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import styles from './RuntimeConfigPage.module.css';
import type { RuntimeProfilePreviewResponseDto } from '@/api-sdk';
import type { ConfigItem } from './types';
import { t } from '@/languages';

interface ModeSwitchModalProps {
  /** 目标模式；null 表示对话框未打开 */
  target: 'secure' | 'normal' | null;
  /** 预览请求进行中（点击切换后尚未拿到受影响清单） */
  previewing: boolean;
  preview: RuntimeProfilePreviewResponseDto[];
  /** key → 配置项：预览只返回 key，中文说明从这里取 */
  configsByKey: Map<string, ConfigItem>;
  saving: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const ModeSwitchModal: React.FC<ModeSwitchModalProps> = ({
  target,
  previewing,
  preview,
  configsByKey,
  saving,
  onConfirm,
  onCancel,
}) => {
  const toSecure = target === 'secure';
  const targetLabel = toSecure ? t('安全模式') : t('普通模式');
  const envShaded = preview.filter((e) => e.envValue !== null);
  const changing = preview.filter((e) => e.willChange);

  return (
    <Modal
      isOpen={target !== null}
      onClose={onCancel}
      size="lg"
      title={t('切换到{mode}', { mode: targetLabel })}
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
            variant={toSecure ? 'outline' : 'danger'}
            size="sm"
            icon={toSecure ? ShieldCheck : ShieldAlert}
            loading={saving}
            disabled={previewing || preview.length === 0}
            onClick={() => {
              void onConfirm();
            }}
            data-testid="rc-confirm-mode-apply"
          >
            {t('确认切换到{mode}（{n} 项）', {
              mode: targetLabel,
              n: String(changing.length),
            })}
          </Button>
        </div>
      }
    >
      {target && (
        <>
          {previewing ? (
            <div className={styles.modalLead}>
              <span data-testid="rc-mode-preview-loading">
                {t('正在计算将改动的配置项...')}
              </span>
            </div>
          ) : preview.length === 0 ? (
            <div className={styles.modalLead} data-testid="rc-mode-no-change">
              {t('无需改动：所有受该模式管理的配置项已在目标取值上。')}
            </div>
          ) : (
            <>
              <p className={styles.modalLead}>
                {t('切换到{mode}将改动以下 {n} 项配置。', {
                  mode: targetLabel,
                  n: String(preview.length),
                })}
              </p>

              {envShaded.length > 0 && (
                <div className={styles.envNote}>
                  <TerminalSquare size={13} />
                  <span>
                    {t(
                      '其中 {n} 项由系统预置：切换模式后它们的实际生效值不变。',
                      { n: String(envShaded.length) }
                    )}
                  </span>
                </div>
              )}

              <div className={styles.previewList} data-testid="rc-mode-preview">
                {preview.map((entry) => {
                  // 预览接口只回 key：用配置列表里的 description 作主标题，
                  // 原始 key 降为副标签保留可追溯性（.env 排查仍按 key 找）
                  const description = configsByKey.get(entry.key)?.description;
                  return (
                    <div
                      key={entry.key}
                      className={`${styles.previewRow} ${entry.isModified ? styles.previewRowModified : ''}`}
                      data-key={entry.key}
                    >
                      <div className={styles.previewMain}>
                        <span className={styles.previewName}>
                          {description || entry.key}
                        </span>
                        {description && (
                          <span className={styles.configKey}>{entry.key}</span>
                        )}
                      </div>
                      <span className={styles.previewValues}>
                        {`${String(entry.currentValue)} → ${String(
                          entry.targetValue
                        )}`}
                      </span>
                      {!entry.willChange && (
                        <span className={styles.previewTag}>{t('不变动')}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
};
