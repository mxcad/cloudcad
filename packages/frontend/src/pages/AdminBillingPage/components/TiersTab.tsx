import { Plus, RefreshCw, Edit2, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { t } from '@/languages';
import { formatYuan } from '../constants';
import { FREE_TIER_LEVEL } from '@/constants/vip';
import type { VipTierItem } from '../types';

interface TiersTabProps {
  tiers: VipTierItem[];
  loading: boolean;
  /** 是否有 SYSTEM_BILLING_WRITE 权限（无则禁用所有写操作按钮） */
  canWrite: boolean;
  onRefresh: () => void;
  onCreate: () => void;
  onEdit: (item: VipTierItem) => void;
  onDeactivate: (item: VipTierItem) => void;
  onDelete: (item: VipTierItem) => void;
}

export function TiersTab({
  tiers,
  loading,
  canWrite,
  onRefresh,
  onCreate,
  onEdit,
  onDeactivate,
  onDelete,
}: TiersTabProps) {
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
            {t('新增等级')}
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
          {tiers.map((item) => (
            <Card key={item.id} variant="outlined" padding="md" radius="xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-primary">
                      {item.name} (VIP{item.level})
                    </span>
                    {item.level === FREE_TIER_LEVEL ? (
                      <Tag variant="info">{t('系统默认')}</Tag>
                    ) : item.isActive ? (
                      <Tag variant="success">{t('上架')}</Tag>
                    ) : (
                      <Tag variant="neutral">{t('已下架')}</Tag>
                    )}
                  </div>
                  <p
                    className="text-sm mt-1"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {t('月基础价')}: {formatYuan(item.baseMonthlyPrice)}
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
                  {/* 系统默认等级（level 0）不可下架/删除，仅可编辑权益配置 */}
                  {item.level !== FREE_TIER_LEVEL && item.isActive && (
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
                  {item.level !== FREE_TIER_LEVEL && !item.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={XCircle}
                      onClick={() => onDelete(item)}
                      disabled={!canWrite}
                    >
                      {t('删除')}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
          {tiers.length === 0 && (
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
