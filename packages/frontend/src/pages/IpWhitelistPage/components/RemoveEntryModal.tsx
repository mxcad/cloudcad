/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { t } from '@/languages';
import type { IpWhitelistEntry } from '../types';
import { FILE_ENTRY_ID_PREFIX } from '../constants';

interface RemoveEntryModalProps {
  /** 待移除条目（单条或批量选中；null = 关闭） */
  entries: IpWhitelistEntry[] | null;
  removing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * 移除确认弹窗（移除即物理删除，不可撤销）
 * 单条展示具体 IP，批量展示数量。本地文件条目（id 以 file: 开头）不参与移除。
 */
export function RemoveEntryModal({
  entries,
  removing,
  onClose,
  onConfirm,
}: RemoveEntryModalProps) {
  // 过滤掉本地文件条目（不可经接口移除），其余为可移除目标
  const removable = (entries ?? []).filter(
    (entry) => !entry.id.startsWith(FILE_ENTRY_ID_PREFIX)
  );
  const isBatch = removable.length > 1;

  return (
    <Modal
      isOpen={entries !== null && removable.length > 0}
      onClose={onClose}
      title={t('移除管理员 IP 白名单条目')}
      size="sm"
      closeOnOverlayClick={!removing}
    >
      <p style={{ color: 'var(--text-secondary)' }}>
        {isBatch
          ? t('确定要移除选中的 {count} 条记录吗？移除操作不可撤销。', {
              count: String(removable.length),
            })
          : t('确定要移除 {ip} 吗？移除后该 IP 将无法通过管理员登录，请谨慎操作。', {
              ip: removable[0]?.ip ?? '',
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
