///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { t } from '@/languages';
import type { IpBlacklistEntry } from '../types';

interface RemoveEntryModalProps {
  /** 待移除条目（单条或批量选中；null = 关闭） */
  entries: IpBlacklistEntry[] | null;
  removing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * 移除确认弹窗（移除即物理删除，不可撤销）
 * 单条展示具体 IP，批量展示数量（ADR-0052 批量动作复用同一弹窗）。
 */
export function RemoveEntryModal({
  entries,
  removing,
  onClose,
  onConfirm,
}: RemoveEntryModalProps) {
  const isBatch = (entries?.length ?? 0) > 1;
  return (
    <Modal
      isOpen={entries !== null && entries.length > 0}
      onClose={onClose}
      title={t('移除 IP 黑名单条目')}
      size="sm"
      closeOnOverlayClick={!removing}
    >
      <p style={{ color: 'var(--text-secondary)' }}>
        {isBatch
          ? t('确定要移除选中的 {count} 条记录吗？移除操作不可撤销。', {
              count: String(entries?.length ?? 0),
            })
          : t('确定要移除 {ip} 吗？移除操作不可撤销。', {
              ip: entries?.[0]?.ip ?? '',
            })}
      </p>
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="outline" onClick={onClose} disabled={removing}>
          {t('取消')}
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={removing}>
          {t('确认移除')}
        </Button>
      </div>
    </Modal>
  );
}
