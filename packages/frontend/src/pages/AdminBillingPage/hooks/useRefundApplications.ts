import { useState, useEffect, useCallback } from 'react';
import {
  billingAdminControllerGetRefundApplications,
  billingAdminControllerApproveRefundApplication,
  billingAdminControllerRejectRefundApplication,
} from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { globalShowToast } from '@/utils/notificationEvents';
import { PAGE_SIZE } from '../constants';
import type { RefundApplicationItem, RefundApplicationStatus } from '../types';

export function useRefundApplications(enabled: boolean) {
  const [applications, setApplications] = useState<RefundApplicationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchStatus, setSearchStatus] = useState('');

  const [reviewTarget, setReviewTarget] =
    useState<RefundApplicationItem | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>(
    'approve'
  );
  const [reviewNote, setReviewNote] = useState('');
  const [reviewRevertMembership, setReviewRevertMembership] = useState(true);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error') => {
      globalShowToast(message, type);
    },
    []
  );

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await billingAdminControllerGetRefundApplications({
        query: {
          page,
          limit: PAGE_SIZE,
          status: (searchStatus || undefined) as
            RefundApplicationStatus | undefined,
        },
        throwOnError: true,
      });
      const body = res?.data as
        { items?: RefundApplicationItem[]; total?: number } | undefined;
      if (body) {
        setApplications(body.items ?? []);
        setTotal(body.total ?? 0);
      }
    } catch (error) {
      // 透传后端真实原因（此前静默，用户以为没数据）
      showToast(getErrorMessage(error) || t('加载退款申请失败'), 'error');
    } finally {
      setLoading(false);
    }
  }, [page, searchStatus, showToast]);

  useEffect(() => {
    if (enabled) loadApplications();
  }, [enabled, loadApplications]);

  const openReviewModal = useCallback(
    (application: RefundApplicationItem, action: 'approve' | 'reject') => {
      setReviewTarget(application);
      setReviewAction(action);
      setReviewNote('');
      setReviewRevertMembership(true);
      setReviewModalOpen(true);
    },
    []
  );

  const closeReviewModal = useCallback(() => {
    setReviewModalOpen(false);
    setReviewTarget(null);
  }, []);

  const handleReview = useCallback(async () => {
    if (!reviewTarget) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { note: reviewNote.trim() || undefined };
      if (reviewAction === 'approve') {
        body.revertMembership = reviewRevertMembership;
        await billingAdminControllerApproveRefundApplication({
          path: { id: reviewTarget.id },
          body,
          throwOnError: true,
        });
        showToast(t('审核通过，退款已执行'), 'success');
      } else {
        await billingAdminControllerRejectRefundApplication({
          path: { id: reviewTarget.id },
          body,
          throwOnError: true,
        });
        showToast(t('已驳回退款申请'), 'success');
      }
      closeReviewModal();
      loadApplications();
    } catch (error) {
      // 审核通过可能因网关退款失败而保持待审核，透传真实原因供重试
      showToast(getErrorMessage(error) || t('审核操作失败'), 'error');
    } finally {
      setSubmitting(false);
    }
  }, [
    reviewTarget,
    reviewAction,
    reviewNote,
    reviewRevertMembership,
    closeReviewModal,
    loadApplications,
    showToast,
  ]);

  return {
    applications,
    loading,
    page,
    total,
    searchStatus,
    reviewTarget,
    reviewAction,
    reviewNote,
    reviewRevertMembership,
    reviewModalOpen,
    submitting,
    setPage,
    setSearchStatus,
    loadApplications,
    openReviewModal,
    closeReviewModal,
    setReviewNote,
    setReviewRevertMembership,
    handleReview,
  };
}
