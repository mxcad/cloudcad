import { Check } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export interface Plan {
  id: string;
  name: string;
  durationDays: number;
  priceYuan: number;
  originalPriceYuan: number | null;
  tier: string;
  sortOrder: number;
  features: Record<string, any> | null;
  isActive: boolean;
}

interface PricingCardProps {
  plan: Plan;
  isPopular?: boolean;
  isCurrentPlan?: boolean;
  purchasing?: boolean;
  isAuthenticated: boolean;
  onPurchase: (planId: string) => void;
}

const FEATURE_LABELS: Record<string, string> = {
  maxStorage: '存储空间',
  maxProjects: '项目数量',
  maxCollaborators: '协作者数量',
  versionHistoryDays: '版本历史',
};

function formatFeatureValue(key: string, value: any): string {
  if (key === 'maxStorage') {
    const gb = (value as number) / 1073741824;
    return gb >= 1024 ? `${(gb / 1024).toFixed(1)}TB` : `${gb.toFixed(0)}GB`;
  }
  if (typeof value === 'number') return String(value);
  return String(value);
}

export default function PricingCard({
  plan,
  isPopular = false,
  isCurrentPlan = false,
  purchasing = false,
  isAuthenticated,
  onPurchase,
}: PricingCardProps) {
  const durationLabel =
    plan.durationDays >= 365 ? '每年' : plan.durationDays >= 180 ? '每半年' : '每月';

  return (
    <Card
      variant="outlined"
      padding="lg"
      radius="2xl"
      className={`
        relative flex flex-col transition-all duration-300 hover:-translate-y-1
        ${isPopular ? 'ring-2 ring-[var(--accent-500)] shadow-lg' : ''}
      `}
    >
      {isPopular && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-sm font-medium"
          style={{ background: 'var(--accent-600)', color: '#fff' }}
        >
          推荐
        </div>
      )}

      <div className="text-center mb-6">
        <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          {plan.name}
        </h3>
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-4xl font-bold" style={{ color: 'var(--text-primary)' }}>
            ¥{plan.priceYuan.toFixed(2)}
          </span>
          {plan.originalPriceYuan && (
            <span className="text-lg line-through" style={{ color: 'var(--text-tertiary)' }}>
              ¥{plan.originalPriceYuan.toFixed(2)}
            </span>
          )}
        </div>
        <div style={{ color: 'var(--text-tertiary)' }}>{durationLabel}</div>
      </div>

      <div className="flex-1 space-y-3 mb-8">
        <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Check size={16} style={{ color: 'var(--success-500)' }} />
          <span>{plan.tier === 'PRO' ? '专业版' : '企业版'}功能</span>
        </div>
        {plan.features &&
          Object.entries(plan.features).map(([key, value]) => (
            <div
              key={key}
              className="flex items-center gap-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Check size={16} style={{ color: 'var(--success-500)' }} />
              <span>
                {FEATURE_LABELS[key] || key}: {formatFeatureValue(key, value)}
              </span>
            </div>
          ))}
      </div>

      {isCurrentPlan ? (
        <div
          className="w-full py-3 rounded-xl text-center text-sm font-medium cursor-default"
          style={{
            background: 'var(--accent-100)',
            color: 'var(--accent-700)',
            border: '1px solid var(--accent-200)',
          }}
        >
          当前方案
        </div>
      ) : (
        <Button
          variant={isPopular ? 'primary' : 'outline'}
          size="lg"
          className="w-full"
          onClick={() => onPurchase(plan.id)}
          loading={purchasing}
        >
          {purchasing ? '处理中...' : isAuthenticated ? '立即开通' : '登录后开通'}
        </Button>
      )}
    </Card>
  );
}
