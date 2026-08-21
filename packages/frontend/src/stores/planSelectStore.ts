import { create } from 'zustand';
import {
  QUOTA_GUIDE_EVENT,
  type QuotaGuideReason,
} from '@/utils/quotaUpgradeGuide';

export type { QuotaGuideReason } from '@/utils/quotaUpgradeGuide';

interface PaymentOrder {
  orderNo: string;
  payParams: Record<string, any> | null;
  codeUrl: string | null;
  redirectUrl: string | null;
  amount: number;
}

interface PlanSelectState {
  isOpen: boolean;
  purchasing: boolean;
  paymentOrder: PaymentOrder | null;
  reason: QuotaGuideReason | null;
  initialTierLevel: number | null;
  open: (reason?: QuotaGuideReason, tierLevel?: number) => void;
  close: () => void;
  setPurchasing: (v: boolean) => void;
  setPaymentOrder: (order: PaymentOrder | null) => void;
}

export const usePlanSelectStore = create<PlanSelectState>((set) => ({
  isOpen: false,
  purchasing: false,
  paymentOrder: null,
  reason: null,
  initialTierLevel: null,
  open: (reason, tierLevel) =>
    set({
      isOpen: true,
      reason: reason ?? null,
      initialTierLevel: tierLevel ?? null,
      paymentOrder: null,
      purchasing: false,
    }),
  close: () =>
    set({
      isOpen: false,
      purchasing: false,
      paymentOrder: null,
      reason: null,
      initialTierLevel: null,
    }),
  setPurchasing: (v) => set({ purchasing: v }),
  setPaymentOrder: (order) => set({ paymentOrder: order }),
}));

window.addEventListener(QUOTA_GUIDE_EVENT, (e) => {
  usePlanSelectStore
    .getState()
    .open((e as CustomEvent<QuotaGuideReason>).detail);
});
