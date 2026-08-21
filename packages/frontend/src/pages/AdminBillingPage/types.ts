export type AdminTab =
  | 'tiers'
  | 'durations'
  | 'orders'
  | 'refund-applications';

export interface AdminOrder {
  id: string;
  orderNo: string;
  userId: string;
  amount: number;
  status: string;
  gateway: string;
  createdAt: string;
  user?: { id: string; email?: string; username?: string };
  vipTierId?: string;
}

export interface VipTierItem {
  id: string;
  level: number;
  name: string;
  baseMonthlyPrice: number;
  isActive: boolean;
  configs: Record<string, unknown>;
}

export interface DurationItem {
  id: string;
  months: number;
  multiplierBps: number;
  label: string;
  isActive: boolean;
  sortOrder: number;
}

export type OrderStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CLOSED' | 'TIMEOUT';

export type RefundApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface RefundApplicationItem {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  reason: string;
  status: RefundApplicationStatus;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  user?: { id: string; email?: string; username?: string };
  reviewer?: { id: string; email?: string; username?: string };
  order?: {
    orderNo: string;
    description?: string | null;
    status?: string;
    gateway?: string;
  };
}
