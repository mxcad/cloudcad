import { Plus, RefreshCw, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { t } from '@/languages';
import { bpsToDecimal, discountPercent } from '../constants';
import type { DurationItem } from '../types';

interface DurationsTabProps {
  durations: DurationItem[];
  loading: boolean;
  /** 是否有 SYSTEM_BILLING_WRITE 权限（无则禁用所有写操作按钮） */
  canWrite: boolean;
  onRefresh: () => void;
  onCreate: () => void;
  onEdit: (item: DurationItem) => void;
  onDeactivate: (item: DurationItem) => void;
}

export function DurationsTab({
  durations,
  loading,
  canWrite,
  onRefresh,
  onCreate,
  onEdit,
  onDeactivate,
}: DurationsTabProps) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={onRefresh}
          >
            {t('刷新')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={onCreate}
            disabled={!canWrite}
          >
            {t('新增时长')}
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-16">
          <div
            className="w-8 h-8 rounded-full animate-spin"
            style={{
              border: '3px solid var(--border-default)',
              borderTopColor: 'var(--primary-500)',
            }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {durations.map((item) => {
            const decimal = bpsToDecimal(item.multiplierBps);
            const disc = discountPercent(item.multiplierBps);
            return (
              <Card key={item.id} variant="outlined" padding="md" radius="xl">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text-primary">
                        {item.label} ({item.months}个月)
                      </span>
                      {item.isActive ? (
                        <Tag variant="success">{t('上架')}</Tag>
                      ) : (
                        <Tag variant="neutral">{t('已下架')}</Tag>
                      )}
                    </div>
                    <p
                      className="text-sm mt-1"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {t('倍率')}: {decimal.toFixed(2)}x
                      {disc > 0 &&
                        `（${t('省{discount}%', { discount: String(disc) })}）`}
                      {' | '}
                      {t('排序')}: {item.sortOrder}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Edit2}
                      onClick={() => onEdit(item)}
                      disabled={!canWrite}
                    >
                      {t('编辑')}
                    </Button>
                    {item.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        onClick={() => onDeactivate(item)}
                        disabled={!canWrite}
                      >
                        {t('下架')}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          {durations.length === 0 && (
            <p
              className="text-center py-8"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {t('暂无数据')}
            </p>
          )}
        </div>
      )}
    </>
  );
}
