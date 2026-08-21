import { useState, useEffect, useCallback } from 'react';
import {
  billingAdminControllerRefund,
  billingAdminControllerManualComplete,
  billingAdminControllerGetAllOrders,
} from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { globalShowToast } from '@/utils/notificationEvents';
import { PAGE_SIZE } from '../constants';
import type { AdminOrder, OrderStatus } from '../types';

export function useOrderManagement(enabled: boolean) {
  const [allOrders, setAllOrders] = useState<AdminOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderSearchKeyword, setOrderSearchKeyword] = useState('');
  const [orderSearchStatus, setOrderSearchStatus] = useState('');

  const [refundTarget, setRefundTarget] = useState<AdminOrder | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [mockTarget, setMockTarget] = useState<AdminOrder | null>(null);
  const [mockModalOpen, setMockModalOpen] = useState(false);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error') => {
      globalShowToast(message, type);
    },
    []
  );

  const loadAllOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await billingAdminControllerGetAllOrders({
        query: {
          page: orderPage,
          limit: PAGE_SIZE,
          keyword: orderSearchKeyword || undefined,
          status: (orderSearchStatus || undefined) as OrderStatus | undefined,
        },
        throwOnError: true,
      });
      const body = res?.data as
        { items?: AdminOrder[]; total?: number } | undefined;
      if (body) {
        setAllOrders(body.items ?? []);
        setOrderTotal(body.total ?? 0);
      }
    } catch (error) {
      // 透传后端真实原因（此前静默，用户以为没数据/搜索无结果）
      showToast(getErrorMessage(error) || t('加载订单列表失败'), 'error');
    } finally {
      setOrdersLoading(false);
    }
  }, [orderPage, orderSearchKeyword, orderSearchStatus]);

  useEffect(() => {
    if (enabled) loadAllOrders();
  }, [enabled, loadAllOrders]);

  const openRefundModal = useCallback((order: AdminOrder) => {
    setRefundTarget(order);
    setRefundReason('');
    setRefundModalOpen(true);
  }, []);

  const closeRefundModal = useCallback(() => {
    setRefundModalOpen(false);
    setRefundTarget(null);
    setRefundReason('');
  }, []);

  const handleRefund = useCallback(async () => {
    if (!refundTarget) return;
    try {
      await billingAdminControllerRefund({
        body: {
          orderNo: refundTarget.orderNo,
          reason: refundReason || undefined,
        },
        throwOnError: true,
      });
      showToast(t('退款成功'), 'success');
      closeRefundModal();
      loadAllOrders();
    } catch (error) {
      showToast(getErrorMessage(error) || t('退款失败'), 'error');
    }
  }, [refundTarget, refundReason, closeRefundModal, loadAllOrders, showToast]);

  const openMockModal = useCallback((order: AdminOrder) => {
    setMockTarget(order);
    setMockModalOpen(true);
  }, []);

  const closeMockModal = useCallback(() => {
    setMockModalOpen(false);
    setMockTarget(null);
  }, []);

  const handleMockCallback = useCallback(async () => {
    if (!mockTarget) return;
    try {
      await billingAdminControllerManualComplete({
        body: { orderNo: mockTarget.orderNo },
        throwOnError: true,
      });
      showToast(t('模拟回调成功'), 'success');
      closeMockModal();
      loadAllOrders();
    } catch (error) {
      showToast(getErrorMessage(error) || t('模拟回调失败'), 'error');
    }
  }, [mockTarget, closeMockModal, loadAllOrders, showToast]);

  return {
    allOrders,
    ordersLoading,
    orderPage,
    orderTotal,
    orderSearchKeyword,
    orderSearchStatus,
    refundTarget,
    refundReason,
    refundModalOpen,
    mockTarget,
    mockModalOpen,
    setOrderPage,
    setOrderSearchKeyword,
    setOrderSearchStatus,
    loadAllOrders,
    openRefundModal,
    closeRefundModal,
    setRefundReason,
    handleRefund,
    openMockModal,
    closeMockModal,
    handleMockCallback,
  };
}
