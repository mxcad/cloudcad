import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import PricingCard, { type Plan } from './PricingCard';
import { Z_LAYERS } from '@/constants/layers';
import { t } from '@/languages';

interface PlanSelectOverlayProps {
  open: boolean;
  plans: Plan[];
  purchasing: string | null;
  isAuthenticated: boolean;
  onPurchase: (planId: string) => void;
  onClose: () => void;
}

export default function PlanSelectOverlay({
  open,
  plans,
  purchasing,
  isAuthenticated,
  onPurchase,
  onClose,
}: PlanSelectOverlayProps) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0"
      style={{ zIndex: Z_LAYERS.MODAL }}
    >
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0, 0, 0, 0.5)' }}
        onClick={onClose}
      />

      <div className="absolute inset-0 flex flex-col">
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{
            background: 'var(--bg-primary)',
            borderBottom: '1px solid var(--border-default)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('选择套餐')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-all duration-200 hover:scale-110"
            style={{
              color: 'var(--text-muted)',
              background: 'var(--bg-tertiary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            <X size={24} />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto"
          style={{
            background: 'var(--bg-primary)',
            animation: 'planSlideUp 0.3s ease-out',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 pb-8 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {plans.map((plan, index) => (
                <PricingCard
                  key={plan.id}
                  plan={plan}
                  isPopular={index === 1}
              isCurrentPlan={false}
                  purchasing={purchasing === plan.id}
                  isAuthenticated={isAuthenticated}
                  onPurchase={onPurchase}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes planSlideUp {
          from {
            transform: translateY(30px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
