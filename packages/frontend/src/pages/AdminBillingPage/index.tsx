import { useState } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { t } from '@/languages';
import { usePermission } from '@/hooks/usePermission';
import { SystemPermission } from '@/constants/permissions';
import { useTierManagement } from './hooks/useTierManagement';
import { useOrderManagement } from './hooks/useOrderManagement';
import { useRefundApplications } from './hooks/useRefundApplications';
import { TiersTab } from './components/TiersTab';
import { DurationsTab } from './components/DurationsTab';
import { OrdersTab } from './components/OrdersTab';
import { RefundApplicationsTab } from './components/RefundApplicationsTab';
import { TierFormModal } from './components/TierFormModal';
import { DurationFormModal } from './components/DurationFormModal';
import { DeactivateModal } from './components/DeactivateModal';
import { DeleteTierModal } from './components/DeleteTierModal';
import { RefundModal } from './components/RefundModal';
import { MockCallbackModal } from './components/MockCallbackModal';
import { ReviewRefundModal } from './components/ReviewRefundModal';
import type { AdminTab } from './types';

const ADMIN_TABS: AdminTab[] = [
  'tiers',
  'durations',
  'orders',
  'refund-applications',
];

export default function AdminBillingPage() {
  useDocumentTitle(t('支付管理'));

  const [tab, setTab] = useState<AdminTab>('tiers');

  // 只有 SYSTEM_BILLING_READ 的用户可查看页面，但写操作（增删改/退款等）需 SYSTEM_BILLING_WRITE
  const { hasPermission } = usePermission();
  const canWrite = hasPermission(SystemPermission.SYSTEM_BILLING_WRITE);

  const tierMgmt = useTierManagement();
  const orderMgmt = useOrderManagement(tab === 'orders');
  const refundApps = useRefundApplications(tab === 'refund-applications');

  const tabLabels: Record<AdminTab, string> = {
    tiers: t('VIP等级'),
    durations: t('时长定价'),
    orders: t('订单管理'),
    'refund-applications': t('退款申请'),
  };

  return (
    <div className="min-h-screen p-6 text-text-secondary">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary">
            {t('支付管理')}
          </h1>
        </div>

        <div
          className="flex gap-1 mb-6 p-1 rounded-xl"
          style={{ background: 'var(--bg-tertiary)' }}
        >
          {ADMIN_TABS.map((key) => (
            <button
              key={key}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === key
                  ? 'bg-[var(--bg-elevated)] shadow-sm text-text-primary'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
              onClick={() => setTab(key)}
            >
              {tabLabels[key]}
            </button>
          ))}
        </div>

        {tab === 'tiers' && (
          <TiersTab
            tiers={tierMgmt.tiers}
            loading={tierMgmt.loading}
            canWrite={canWrite}
            onRefresh={tierMgmt.loadTiers}
            onCreate={tierMgmt.openCreateTier}
            onEdit={tierMgmt.openEditTier}
            onDeactivate={(item) =>
              tierMgmt.setDeactivateConfirm({ type: 'tier', id: item.id })
            }
            onDelete={(item) => tierMgmt.setDeleteTierConfirm({ id: item.id })}
          />
        )}

        {tab === 'durations' && (
          <DurationsTab
            durations={tierMgmt.durations}
            loading={tierMgmt.loading}
            canWrite={canWrite}
            onRefresh={tierMgmt.loadTiers}
            onCreate={tierMgmt.openCreateDuration}
            onEdit={tierMgmt.openEditDuration}
            onDeactivate={(item) =>
              tierMgmt.setDeactivateConfirm({ type: 'duration', id: item.id })
            }
          />
        )}

        {tab === 'orders' && (
          <OrdersTab
            orders={orderMgmt.allOrders}
            loading={orderMgmt.ordersLoading}
            page={orderMgmt.orderPage}
            total={orderMgmt.orderTotal}
            keyword={orderMgmt.orderSearchKeyword}
            status={orderMgmt.orderSearchStatus}
            canWrite={canWrite}
            onPageChange={orderMgmt.setOrderPage}
            onKeywordChange={orderMgmt.setOrderSearchKeyword}
            onStatusChange={orderMgmt.setOrderSearchStatus}
            onSearch={orderMgmt.loadAllOrders}
            onRefund={orderMgmt.openRefundModal}
            onMockCallback={orderMgmt.openMockModal}
          />
        )}

        {tab === 'refund-applications' && (
          <RefundApplicationsTab
            applications={refundApps.applications}
            loading={refundApps.loading}
            page={refundApps.page}
            total={refundApps.total}
            status={refundApps.searchStatus}
            canWrite={canWrite}
            onPageChange={refundApps.setPage}
            onStatusChange={refundApps.setSearchStatus}
            onRefresh={refundApps.loadApplications}
            onApprove={(application) =>
              refundApps.openReviewModal(application, 'approve')
            }
            onReject={(application) =>
              refundApps.openReviewModal(application, 'reject')
            }
          />
        )}

        <TierFormModal
          isOpen={tierMgmt.tierModalOpen}
          editingId={tierMgmt.tierEditingId}
          freeTier={tierMgmt.tierEditingFreeTier}
          form={tierMgmt.tierForm}
          saving={tierMgmt.saving}
          registryEntries={tierMgmt.registeredConfigKeys}
          registryLoading={tierMgmt.registryLoading}
          onClose={() => tierMgmt.setTierModalOpen(false)}
          onFormChange={tierMgmt.setTierForm}
          onSave={tierMgmt.handleSaveTier}
        />

        <DurationFormModal
          isOpen={tierMgmt.durationModalOpen}
          editingId={tierMgmt.durationEditingId}
          form={tierMgmt.durationForm}
          saving={tierMgmt.saving}
          onClose={() => tierMgmt.setDurationModalOpen(false)}
          onFormChange={tierMgmt.setDurationForm}
          onSave={tierMgmt.handleSaveDuration}
        />

        <DeactivateModal
          confirm={tierMgmt.deactivateConfirm}
          onClose={() => tierMgmt.setDeactivateConfirm(null)}
          onConfirm={tierMgmt.handleDeactivate}
        />

        <DeleteTierModal
          confirm={tierMgmt.deleteTierConfirm}
          onClose={() => tierMgmt.setDeleteTierConfirm(null)}
          onConfirm={tierMgmt.handleDeleteTier}
        />

        <RefundModal
          isOpen={orderMgmt.refundModalOpen}
          order={orderMgmt.refundTarget}
          reason={orderMgmt.refundReason}
          onClose={orderMgmt.closeRefundModal}
          onReasonChange={orderMgmt.setRefundReason}
          onConfirm={orderMgmt.handleRefund}
        />

        <MockCallbackModal
          isOpen={orderMgmt.mockModalOpen}
          order={orderMgmt.mockTarget}
          onClose={orderMgmt.closeMockModal}
          onConfirm={orderMgmt.handleMockCallback}
        />

        <ReviewRefundModal
          isOpen={refundApps.reviewModalOpen}
          application={refundApps.reviewTarget}
          action={refundApps.reviewAction}
          note={refundApps.reviewNote}
          revertMembership={refundApps.reviewRevertMembership}
          submitting={refundApps.submitting}
          onClose={refundApps.closeReviewModal}
          onNoteChange={refundApps.setReviewNote}
          onRevertMembershipChange={refundApps.setReviewRevertMembership}
          onConfirm={refundApps.handleReview}
        />
      </div>
    </div>
  );
}
