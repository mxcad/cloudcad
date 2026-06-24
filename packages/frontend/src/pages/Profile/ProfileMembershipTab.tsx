import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Crown, Check, X as XIcon, AlertTriangle, CheckCircle, AlertCircle, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import OrderHistory, { type Order } from '@/components/billing/OrderHistory';
import { type Plan } from '@/components/billing/PricingCard';
import WechatPayButton from '@/components/billing/WechatPayButton';
import PlanSelectOverlay from '@/components/billing/PlanSelectOverlay';
import {
  billingControllerGetPlans,
  billingControllerGetMembership,
  billingControllerGetOrders,
  billingControllerCreateOrder,
} from '@/api-sdk';

interface Membership {
  tier: string;
  expiresAt: string | null;
  daysRemaining: number;
}

const FREE_FEATURES: Record<string, number> = {
  maxStorage: 104857600,
  maxProjects: 5,
  maxCollaborators: 0,
  versionHistoryDays: 0,
};

const FEATURE_LABELS: Record<string, string> = {
  maxStorage: '存储空间',
  maxProjects: '项目数量',
  maxCollaborators: '协作者数量',
  versionHistoryDays: '版本历史',
};

const FEATURE_FMT: Record<string, (v: number) => string> = {
  maxStorage: (v) => {
    const gb = (v as number) / 1073741824;
    return gb >= 1024 ? `${(gb / 1024).toFixed(1)}TB` : `${gb.toFixed(0)}GB`;
  },
  maxProjects: (v) => `${v} 个`,
  maxCollaborators: (v) => `${v} 人`,
  versionHistoryDays: (v) => (v === 0 ? '无' : `${v} 天`),
};

const TIER_LABEL: Record<string, string> = {
  FREE: '免费用户',
  PRO: '专业版会员',
};

export const ProfileMembershipTab: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [billingLoading, setBillingLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<{
    orderNo: string;
    payParams: Record<string, any> | null;
    codeUrl: string | null;
    redirectUrl: string | null;
    amount: number;
  } | null>(null);

  const [showPlanSelect, setShowPlanSelect] = useState(false);
  const [memSubTab, setMemSubTab] = useState<'compare' | 'orders'>('compare');

  const orderPageRef = useRef(orderPage);
  orderPageRef.current = orderPage;

  const prevRefundedIds = useRef<Set<string>>(new Set());

  const loadBillingData = useCallback(async () => {
    const currentPage = orderPageRef.current;
    try {
      const [planRes, memRes, ordRes]: any = await Promise.all([
        billingControllerGetPlans(),
        billingControllerGetMembership(),
        billingControllerGetOrders({ query: { page: currentPage, limit: 10 } }),
      ]);
      const list = planRes?.data;
      if (Array.isArray(list) && list.length > 0) setPlans(list as Plan[]);
      if (memRes?.data) setMembership(memRes.data as Membership);
      if (ordRes?.data) {
        const data = ordRes.data;
        const items = Array.isArray(data) ? data as Order[] : (data.items ?? []) as Order[];
        setOrders(items);
        if (!Array.isArray(data) && typeof data.total === 'number') {
          setOrderTotal(data.total);
        }

        const newRefunded = items.filter(
          (o: Order) => o.status === 'REFUNDED' && !prevRefundedIds.current.has(o.id),
        );
        if (newRefunded.length > 0) {
          newRefunded.forEach((o: Order) => prevRefundedIds.current.add(o.id));
          const desc = newRefunded.length === 1
            ? `订单 ${(newRefunded[0] as Order).orderNo.slice(-8)} 已退款`
            : `${newRefunded.length} 个订单已退款`;
          window.dispatchEvent(
            new CustomEvent('cloudcad:toast', { detail: { message: desc, type: 'info' } }),
          );
        }
      }
    } catch {
      // billing data is supplementary, don't block the page
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBillingData();
  }, [loadBillingData]);

  // Poll for pending orders (30s interval)
  useEffect(() => {
    const id = setInterval(() => { loadBillingData(); }, 30000);
    return () => { clearInterval(id); };
  }, [loadBillingData]);

  // MWEB 支付返回后自动刷新订单状态
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('paymentReturn') === '1') {
      // 清除 URL 参数防止刷新后重复触发
      const url = new URL(window.location.href);
      url.searchParams.delete('paymentReturn');
      window.history.replaceState({}, '', url.toString());
      // 立即刷新订单数据
      loadBillingData();
    }
  }, [loadBillingData]);

  const detectTradeType = (): 'JSAPI' | 'NATIVE' | 'MWEB' | 'APP' => {
    const ua = navigator.userAgent;
    if (/MicroMessenger/i.test(ua)) return 'JSAPI';
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return 'MWEB';
    return 'NATIVE';
  };

  const doCreateOrder = async (planId: string) => {
    // MWEB 需要传 redirectUrl，支付完成后微信跳转回来
    const tradeType = detectTradeType();
    const body: any = { planId, tradeType };
    if (tradeType === 'MWEB') {
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.set('paymentReturn', '1');
      body.redirectUrl = returnUrl.toString();
    }
    const res: any = await billingControllerCreateOrder({ body });
    const orderData = res?.data;
    if (res?.error || !orderData) {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '创建订单失败', type: 'error' } }),
      );
      return null;
    }

    if (orderData.status !== 'PENDING' || (!orderData.codeUrl && !orderData.payParams && !orderData.redirectUrl)) {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '获取支付信息失败', type: 'error' } }),
      );
      return null;
    }

    return {
      orderNo: orderData.orderNo,
      payParams: orderData.payParams || null,
      codeUrl: orderData.codeUrl || null,
      redirectUrl: orderData.redirectUrl || null,
      amount: orderData.amount,
    };
  };

  const handlePurchase = async (planId: string) => {
    setPurchasing(planId);
    try {
      const payment = await doCreateOrder(planId);
      if (payment) setPaymentOrder(payment);
    } catch {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '创建订单失败', type: 'error' } }),
      );
    } finally {
      setPurchasing(null);
    }
  };

  const handlePaymentSuccess = () => {
    setPaymentOrder(null);
    window.dispatchEvent(
      new CustomEvent('cloudcad:toast', {
        detail: { message: '支付成功！', type: 'success' },
      }),
    );
    loadBillingData();
  };

  const handlePaymentError = (msg: string) => {
    window.dispatchEvent(
      new CustomEvent('cloudcad:toast', {
        detail: { message: msg, type: 'error' },
      }),
    );
  };

  const handleContinuePayment = async (order: Order) => {
    try {
      const payment = await doCreateOrder(order.planId);
      if (payment) setPaymentOrder(payment);
    } catch {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '获取支付信息失败', type: 'error' } }),
      );
    }
  };

  return (
    <div className="p-6 space-y-6">
      {billingLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid var(--border-default)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : (
        <>
          {/* 会员状态卡片 */}
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Crown size={28} className={(!membership || membership.tier === 'FREE') ? 'text-gray-400' : 'text-yellow-500'} />
                <div>
                  <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {TIER_LABEL[membership?.tier || 'FREE']}
                  </p>
                  {membership && membership.tier !== 'FREE' && membership.expiresAt ? (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      有效期至 {new Date(membership.expiresAt).toLocaleDateString('zh-CN')}
                      {membership.daysRemaining > 0 && `（剩余 ${membership.daysRemaining} 天）`}
                    </p>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>开通会员解锁更多功能</p>
                  )}
                </div>
              </div>
              <Button
                variant={(!membership || membership.tier === 'FREE') ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setShowPlanSelect(true)}
              >
                {(!membership || membership.tier === 'FREE') ? '开通会员' : '续费'}
              </Button>
            </div>
            {membership && membership.tier !== 'FREE' && membership.daysRemaining > 0 && membership.daysRemaining <= 7 && (
              <div className="flex items-center gap-2 p-3 rounded-lg mt-3" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
                <AlertTriangle size={16} className="text-yellow-500 shrink-0" />
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>您的会员将在 <strong>{membership.daysRemaining}</strong> 天后到期，请及时续费</span>
                <Button variant="outline" size="sm" onClick={() => setShowPlanSelect(true)}>立即续费</Button>
              </div>
            )}
          </div>

          {/* 待支付提醒 */}
          {orders.some((o) => o.status === 'PENDING') && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg" style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <AlertTriangle size={16} className="text-yellow-500 shrink-0" />
              <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>您有待支付的订单，请尽快完成支付</span>
            </div>
          )}

          {/* 子 tab */}
          <div className="flex gap-4 border-b pb-3" style={{ borderColor: 'var(--border-default)' }}>
            <button
              className="text-sm font-medium pb-1 transition-colors"
              style={{
                color: memSubTab === 'compare' ? 'var(--accent-600)' : 'var(--text-secondary)',
                borderBottom: memSubTab === 'compare' ? '2px solid var(--accent-600)' : '2px solid transparent',
              }}
              onClick={() => setMemSubTab('compare')}
            >
              功能对比
            </button>
            <button
              className="text-sm font-medium pb-1 transition-colors"
              style={{
                color: memSubTab === 'orders' ? 'var(--accent-600)' : 'var(--text-secondary)',
                borderBottom: memSubTab === 'orders' ? '2px solid var(--accent-600)' : '2px solid transparent',
              }}
              onClick={() => setMemSubTab('orders')}
            >
              购买记录
            </button>
          </div>

          {/* 功能对比 */}
          {memSubTab === 'compare' && plans.length > 0 && (
            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border-default)' }}>
              <table className="w-full text-sm" style={{ color: 'var(--text-secondary)' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-tertiary)' }}>
                    <th className="text-left px-4 py-3 font-semibold text-text-primary">功能</th>
                    <th className="text-center px-4 py-3 font-semibold text-text-primary">免费</th>
                    {plans.map((p) => (
                      <th key={p.id} className="text-center px-4 py-3 font-semibold text-text-primary">
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(['maxStorage', 'maxProjects', 'maxCollaborators', 'versionHistoryDays'] as const).map((key) => (
                    <tr key={key} style={{ borderTop: '1px solid var(--border-default)' }}>
                      <td className="px-4 py-3 text-text-primary">{FEATURE_LABELS[key]}</td>
                      <td className="text-center px-4 py-3">{FEATURE_FMT[key]!(FREE_FEATURES[key]!)}</td>
                      {plans.map((p) => (
                        <td key={p.id} className="text-center px-4 py-3" style={{ color: 'var(--success-500)' }}>
                          {p.features ? FEATURE_FMT[key]!(p.features[key]) : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid var(--border-default)' }}>
                    <td className="px-4 py-3 text-text-primary">协作用户管理</td>
                    <td className="text-center px-4 py-3"><XIcon size={16} className="inline" style={{ color: 'var(--error-500)' }} /></td>
                    {plans.map((p) => (
                      <td key={p.id} className="text-center px-4 py-3"><Check size={16} className="inline" style={{ color: 'var(--success-500)' }} /></td>
                    ))}
                  </tr>
                  <tr style={{ borderTop: '1px solid var(--border-default)' }}>
                    <td className="px-4 py-3 text-text-primary">版本历史管理</td>
                    <td className="text-center px-4 py-3"><XIcon size={16} className="inline" style={{ color: 'var(--error-500)' }} /></td>
                    {plans.map((p) => (
                      <td key={p.id} className="text-center px-4 py-3"><Check size={16} className="inline" style={{ color: 'var(--success-500)' }} /></td>
                    ))}
                  </tr>
                  <tr style={{ borderTop: '1px solid var(--border-default)' }}>
                    <td className="px-4 py-3 text-text-primary">高级 API 调用</td>
                    <td className="text-center px-4 py-3"><XIcon size={16} className="inline" style={{ color: 'var(--error-500)' }} /></td>
                    {plans.map((p) => (
                      <td key={p.id} className="text-center px-4 py-3"><Check size={16} className="inline" style={{ color: 'var(--success-500)' }} /></td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* 购买记录 */}
          {memSubTab === 'orders' && (
            <OrderHistory
              orders={orders}
              loading={billingLoading}
              onRefresh={loadBillingData}
              onContinuePayment={handleContinuePayment}
              page={orderPage}
              total={orderTotal}
              onPageChange={(p) => {
                setOrderPage(p);
                orderPageRef.current = p;
                setBillingLoading(true);
                loadBillingData();
              }}
            />
          )}
        </>
      )}

      {/* 套餐选择浮层 */}
      <PlanSelectOverlay
        open={showPlanSelect}
        plans={plans}
        purchasing={purchasing}
        isAuthenticated={true}
        onPurchase={handlePurchase}
        onClose={() => setShowPlanSelect(false)}
      />

      {/* 支付弹窗 */}
      <Modal
        isOpen={paymentOrder !== null}
        onClose={() => setPaymentOrder(null)}
        title="微信支付"
      >
        {paymentOrder && (
          <WechatPayButton
            payParams={paymentOrder.payParams}
            codeUrl={paymentOrder.codeUrl}
            redirectUrl={paymentOrder.redirectUrl}
            orderNo={paymentOrder.orderNo}
            amount={paymentOrder.amount}
            onSuccess={handlePaymentSuccess}
            onError={handlePaymentError}
            onClose={() => setPaymentOrder(null)}
          />
        )}
      </Modal>
    </div>
  );
};
