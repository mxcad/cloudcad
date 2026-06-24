import { useState, useEffect, useCallback } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tag } from '@/components/ui/Tag';
import { Pagination } from '@/components/ui/Pagination';
import {
  Plus, Edit2, Trash2, RefreshCw, DollarSign, Smartphone,
} from 'lucide-react';
import {
  billingAdminControllerGetAllPlans,
  billingAdminControllerCreatePlan,
  billingAdminControllerUpdatePlan,
  billingAdminControllerDeactivatePlan,
  billingAdminControllerRefund,
  billingAdminControllerMockCallback,
  billingAdminControllerGetAllOrders,
} from '@/api-sdk';
import type { Plan } from '@/components/billing/PricingCard';

const PAGE_SIZE = 10;

type AdminTab = 'plans' | 'operations';

interface PlanFormData {
  name: string;
  durationDays: number;
  price: number;
  originalPrice: number | null;
  tier: string;
  sortOrder: number;
  features: string;
}

const EMPTY_FORM: PlanFormData = {
  name: '',
  durationDays: 30,
  price: 0,
  originalPrice: null,
  tier: 'PRO',
  sortOrder: 1,
  features: '{}',
};

export default function AdminBillingPage() {
  useDocumentTitle('支付管理');

  const [tab, setTab] = useState<AdminTab>('plans');
  const [plans, setPlans] = useState<(Plan & { isActive: boolean })[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showMockCallbackModal, setShowMockCallbackModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<PlanFormData>(EMPTY_FORM);
  const [refundOrderNo, setRefundOrderNo] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [mockOrderNo, setMockOrderNo] = useState('');

  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);

  const loadAllOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res: any = await billingAdminControllerGetAllOrders({ query: { page: orderPage, limit: PAGE_SIZE } });
      const body = res?.data;
      if (body) {
        setAllOrders(Array.isArray(body.items) ? body.items : []);
        setOrderTotal(body.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setOrdersLoading(false);
    }
  }, [orderPage]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await billingAdminControllerGetAllPlans();
      const list = res?.data;
      if (Array.isArray(list)) setPlans(list);
    } catch (err) {
      console.error('Failed to load admin plans', err);
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '加载套餐列表失败', type: 'error' } }),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      let features: any = {};
      try { features = JSON.parse(form.features); } catch { features = {}; }
      await (billingAdminControllerCreatePlan as any)({
        body: {
          name: form.name,
          durationDays: form.durationDays,
          price: form.price,
          originalPrice: form.originalPrice || null,
          tier: form.tier,
          sortOrder: form.sortOrder,
          features,
        },
      });
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '创建成功', type: 'success' } }),
      );
      setShowCreateModal(false);
      setForm(EMPTY_FORM);
      loadPlans();
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '创建失败', type: 'error' } }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      let features: any = {};
      try { features = JSON.parse(form.features); } catch { features = {}; }
      await (billingAdminControllerUpdatePlan as any)({
        path: { id: editingId },
        body: {
          name: form.name,
          durationDays: form.durationDays,
          price: form.price,
          originalPrice: form.originalPrice || null,
          tier: form.tier,
          sortOrder: form.sortOrder,
          features,
        },
      });
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '修改成功', type: 'success' } }),
      );
      setShowEditModal(false);
      setEditingId(null);
      loadPlans();
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '修改失败', type: 'error' } }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingId) return;
    try {
      await billingAdminControllerDeactivatePlan({ path: { id: deactivatingId } });
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '已下架', type: 'success' } }),
      );
      setShowDeactivateConfirm(false);
      setDeactivatingId(null);
      loadPlans();
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '下架失败', type: 'error' } }),
      );
    }
  };

  const handleRefund = async () => {
    if (!refundOrderNo) return;
    try {
      await billingAdminControllerRefund({
        body: { orderNo: refundOrderNo, reason: refundReason || undefined },
      });
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '退款成功', type: 'success' } }),
      );
      setShowRefundModal(false);
      setRefundOrderNo('');
      setRefundReason('');
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '退款失败', type: 'error' } }),
      );
    }
  };

  const handleMockCallback = async () => {
    if (!mockOrderNo) return;
    try {
      await billingAdminControllerMockCallback({ body: { orderNo: mockOrderNo } });
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '模拟回调成功', type: 'success' } }),
      );
      setShowMockCallbackModal(false);
      setMockOrderNo('');
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '模拟回调失败', type: 'error' } }),
      );
    }
  };

  const openEdit = (plan: any) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name || '',
      durationDays: plan.durationDays || 30,
      price: Math.round((plan.priceYuan || 0) * 100),
      originalPrice: plan.originalPriceYuan ? Math.round(plan.originalPriceYuan * 100) : null,
      tier: plan.tier || 'PRO',
      sortOrder: plan.sortOrder || 1,
      features: JSON.stringify(plan.features || {}, null, 2),
    });
    setShowEditModal(true);
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setShowCreateModal(true);
  };

  useEffect(() => { if (tab === 'operations') loadAllOrders(); }, [tab, loadAllOrders]);

  return (
    <div className="page-content-theme min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary">支付管理</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={loadPlans}>
              刷新
            </Button>
            <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
              新增套餐
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--bg-tertiary)' }}>
          <button
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'plans' ? 'bg-[var(--bg-elevated)] shadow-sm text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
            }`}
            onClick={() => setTab('plans')}
          >
            套餐管理
          </button>
          <button
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'operations' ? 'bg-[var(--bg-elevated)] shadow-sm text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
            }`}
            onClick={() => setTab('operations')}
          >
            订单操作
          </button>
        </div>

        {/* 套餐管理 Tab */}
        {tab === 'plans' && (
          <>
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
                {plans.map((plan) => (
                  <Card key={plan.id} variant="outlined" padding="md" radius="xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text-primary">{plan.name}</span>
                          {plan.isActive ? (
                            <Tag variant="success">上架</Tag>
                          ) : (
                            <Tag variant="neutral">已下架</Tag>
                          )}
                        </div>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                          ¥{plan.priceYuan.toFixed(2)}
                          {plan.originalPriceYuan && (
                            <span className="line-through ml-1">¥{plan.originalPriceYuan.toFixed(2)}</span>
                          )}
                          {' · '}
                          专业版
                          {' · '}
                          {plan.durationDays >= 365 ? `${(plan.durationDays / 365).toFixed(0)}年` : `${plan.durationDays}天`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" icon={Edit2} onClick={() => openEdit(plan)}>
                          编辑
                        </Button>
                        {plan.isActive && (
                          <Button
                            variant="danger"
                            size="sm"
                            icon={Trash2}
                            onClick={() => {
                              setDeactivatingId(plan.id);
                              setShowDeactivateConfirm(true);
                            }}
                          >
                            下架
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
                {plans.length === 0 && (
                  <div className="text-center py-16" style={{ color: 'var(--text-tertiary)' }}>
                    <p>暂无套餐</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* 订单操作 Tab */}
        {tab === 'operations' && (
          <>
            {/* 订单列表 */}
            <Card variant="outlined" padding="lg" radius="xl" className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-text-primary">全部订单</h3>
                <Button variant="outline" size="sm" icon={RefreshCw} onClick={loadAllOrders}>
                  刷新
                </Button>
              </div>
              {ordersLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 rounded-full animate-spin" style={{ border: '2px solid var(--border-default)', borderTopColor: 'var(--primary-500)' }} />
                </div>
              ) : allOrders.length === 0 ? (
                <p className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>暂无订单</p>
              ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                          <th className="text-left px-3 py-2 text-text-secondary">订单号</th>
                          <th className="text-left px-3 py-2 text-text-secondary">用户</th>
                          <th className="text-left px-3 py-2 text-text-secondary">套餐</th>
                          <th className="text-right px-3 py-2 text-text-secondary">金额</th>
                          <th className="text-center px-3 py-2 text-text-secondary">状态</th>
                          <th className="text-right px-3 py-2 text-text-secondary">时间</th>
                          <th className="text-center px-3 py-2 text-text-secondary">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allOrders.map((o: any) => (
                          <tr key={o.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                            <td className="px-3 py-2 font-mono text-xs text-text-primary">{o.orderNo}</td>
                            <td className="px-3 py-2 text-text-primary">{o.user?.email || o.user?.username || o.userId}</td>
                            <td className="px-3 py-2 text-text-primary">{o.plan?.name || '-'}</td>
                            <td className="px-3 py-2 text-right text-text-primary">¥{(o.amount / 100).toFixed(2)}</td>
                            <td className="px-3 py-2 text-center">
                              <Tag variant={
                                o.status === 'SUCCEEDED' ? 'success' :
                                o.status === 'PENDING' ? 'warning' :
                                o.status === 'REFUNDED' ? 'neutral' : 'error'
                              }>
                                {o.status}
                              </Tag>
                            </td>
                            <td className="px-3 py-2 text-right text-text-tertiary">{new Date(o.createdAt).toLocaleDateString('zh-CN')}</td>
                            <td className="px-3 py-2 text-center">
                              {o.status === 'SUCCEEDED' && (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => {
                                    setRefundOrderNo(o.orderNo);
                                    setShowRefundModal(true);
                                  }}
                                >
                                  退款
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  {orderTotal > PAGE_SIZE && (
                    <div className="mt-4 flex justify-center">
                      <Pagination
                        meta={{ total: orderTotal, page: orderPage, limit: PAGE_SIZE, totalPages: Math.ceil(orderTotal / PAGE_SIZE) }}
                        onPageChange={(p) => setOrderPage(p)}
                      />
                    </div>
                  )}
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card variant="outlined" padding="lg" radius="xl">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign size={20} style={{ color: 'var(--warning-500)' }} />
                <h3 className="font-semibold text-text-primary">退款</h3>
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
                输入订单号执行退款操作。仅已完成的订单可退款。
              </p>
              <div className="space-y-3">
                <Input
                  placeholder="输入订单号"
                  value={refundOrderNo}
                  onChange={(e) => setRefundOrderNo(e.target.value)}
                />
                <Input
                  placeholder="退款原因（可选）"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={handleRefund}
                  disabled={!refundOrderNo}
                >
                  执行退款
                </Button>
              </div>
            </Card>

            <Card variant="outlined" padding="lg" radius="xl">
              <div className="flex items-center gap-2 mb-4">
                <Smartphone size={20} style={{ color: 'var(--accent-500)' }} />
                <h3 className="font-semibold text-text-primary">模拟支付回调</h3>
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
                输入订单号模拟支付成功回调。仅 mock 模式下可用，PENDING 状态订单可用。
              </p>
              <div className="space-y-3">
                <Input
                  placeholder="输入订单号"
                  value={mockOrderNo}
                  onChange={(e) => setMockOrderNo(e.target.value)}
                />
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={handleMockCallback}
                  disabled={!mockOrderNo}
                >
                  执行模拟回调
                </Button>
              </div>
            </Card>
          </div>
          </>
        )}
      </div>

      {/* 创建套餐 Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="新增套餐"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>取消</Button>
            <Button variant="primary" onClick={handleCreate} loading={saving}>
              {saving ? '创建中...' : '创建'}
            </Button>
          </>
        }
      >
        <PlanForm form={form} onChange={setForm} />
      </Modal>

      {/* 编辑套餐 Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="修改套餐"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>取消</Button>
            <Button variant="primary" onClick={handleEdit} loading={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </>
        }
      >
        <PlanForm form={form} onChange={setForm} />
      </Modal>

      {/* 下架确认 */}
      <Modal
        isOpen={showDeactivateConfirm}
        onClose={() => setShowDeactivateConfirm(false)}
        title="确认下架"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeactivateConfirm(false)}>取消</Button>
            <Button variant="danger" onClick={handleDeactivate}>确认下架</Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          下架后新用户将无法购买此套餐，已有 PENDING 订单仍可完成支付。确定要下架吗？
        </p>
      </Modal>

      {/* 退款确认 */}
      <Modal
        isOpen={showRefundModal}
        onClose={() => setShowRefundModal(false)}
        title="退款确认"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowRefundModal(false)}>取消</Button>
            <Button variant="danger" onClick={handleRefund}>确认退款</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p style={{ color: 'var(--text-secondary)' }}>
            确定对订单 <span className="font-mono text-text-primary">{refundOrderNo}</span> 执行退款？
          </p>
          <Input
            placeholder="退款原因（可选）"
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}

function PlanForm({
  form,
  onChange,
}: {
  form: PlanFormData;
  onChange: (f: PlanFormData) => void;
}) {
  const set = (key: keyof PlanFormData, value: any) => onChange({ ...form, [key]: value });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 text-text-primary">套餐名称</label>
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="月度会员" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-text-primary">时长（天）</label>
          <Input type="number" value={String(form.durationDays)} onChange={(e) => set('durationDays', Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-text-primary">排序</label>
          <Input type="number" value={String(form.sortOrder)} onChange={(e) => set('sortOrder', Number(e.target.value))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-text-primary">价格（分 = 元 × 100，如 2400 = ¥24.00）</label>
          <Input type="number" value={String(form.price)} onChange={(e) => set('price', Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-text-primary">原价（分，选填）</label>
          <Input type="number" value={form.originalPrice != null ? String(form.originalPrice) : ''} onChange={(e) => set('originalPrice', e.target.value ? Number(e.target.value) : null)} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-text-primary">会员等级</label>
        <Select
          value={form.tier}
          onChange={(v) => set('tier', v)}
          options={[
            { label: '专业版 (PRO)', value: 'PRO' },
          ]}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-text-primary">
          功能配置（JSON）
        </label>
        <textarea
          className="w-full px-3 py-2 rounded-lg text-sm font-mono"
          rows={5}
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
          value={form.features}
          onChange={(e) => set('features', e.target.value)}
        />
      </div>
    </div>
  );
}
