///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { OrderStatus } from './enums/billing.enum';
import { PaymentOrder, PENDING_ORDER_TTL_MS } from './payment-order';

interface BuildTxOptions {
  updateMany?: jest.Mock;
  findUnique?: jest.Mock;
}

function buildTx(opts: BuildTxOptions = {}) {
  return {
    paymentOrder: {
      updateMany:
        opts.updateMany ?? jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: opts.findUnique ?? jest.fn().mockResolvedValue(null),
    },
  };
}

const baseOrder = {
  id: 'order-1',
  orderNo: 'PAYtest123',
  status: OrderStatus.PENDING,
  amount: 2400,
  userId: 'user-1',
  months: 1,
  vipTier: { level: 1, baseMonthlyPrice: 1500 },
};

const paidOutcome = {
  gatewayPaidId: 'txn-001',
  amount: 2400,
  paidAt: new Date('2026-01-01T00:00:00Z'),
};

describe('PaymentOrder', () => {
  let paymentOrder: PaymentOrder;
  let membershipService: { activate: jest.Mock };

  beforeEach(() => {
    membershipService = { activate: jest.fn() };
    paymentOrder = new PaymentOrder(membershipService as any);
  });

  it('PENDING_ORDER_TTL_MS 是 2 小时', () => {
    expect(PENDING_ORDER_TTL_MS).toBe(2 * 60 * 60 * 1000);
  });

  describe('applyGatewayOutcome', () => {
    it('PENDING + 金额一致 → SUCCEEDED（带 PENDING 守卫）+ 激活会员', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = buildTx({ updateMany });

      const result = await paymentOrder.applyGatewayOutcome(
        tx as any,
        baseOrder,
        paidOutcome
      );

      expect(result).toBe('succeeded');
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: OrderStatus.PENDING },
        data: {
          status: OrderStatus.SUCCEEDED,
          gatewayPaidId: 'txn-001',
          paidAt: paidOutcome.paidAt,
        },
      });
      expect(membershipService.activate).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        { level: 1, baseMonthlyPrice: 1500 },
        30
      );
    });

    it('PENDING + 金额不符 → 标 FAILED（带 PENDING 守卫），绝不激活', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = buildTx({ updateMany });

      const result = await paymentOrder.applyGatewayOutcome(
        tx as any,
        baseOrder,
        { ...paidOutcome, amount: 100 }
      );

      expect(result).toBe('amount-mismatch');
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: OrderStatus.PENDING },
        data: expect.objectContaining({
          status: OrderStatus.FAILED,
          description: '金额不匹配: order=2400 gateway=100',
        }),
      });
      expect(membershipService.activate).not.toHaveBeenCalled();
    });

    it('PENDING + 守卫 count=0 且最新态为 SUCCEEDED → already-terminal，不激活', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      const findUnique = jest
        .fn()
        .mockResolvedValue({ ...baseOrder, status: OrderStatus.SUCCEEDED });
      const tx = buildTx({ updateMany, findUnique });

      const result = await paymentOrder.applyGatewayOutcome(
        tx as any,
        baseOrder,
        paidOutcome
      );

      expect(result).toBe('already-terminal');
      expect(membershipService.activate).not.toHaveBeenCalled();
    });

    it('PENDING + 守卫 count=0 但并发被 cron 标 TIMEOUT → 幂等恢复为 SUCCEEDED + 激活', async () => {
      const updateMany = jest
        .fn()
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValue({ count: 1 });
      const findUnique = jest
        .fn()
        .mockResolvedValue({ ...baseOrder, status: OrderStatus.TIMEOUT });
      const tx = buildTx({ updateMany, findUnique });

      const result = await paymentOrder.applyGatewayOutcome(
        tx as any,
        baseOrder,
        paidOutcome
      );

      expect(result).toBe('succeeded');
      // 第二次更新按最新态（TIMEOUT）守卫
      expect(updateMany).toHaveBeenLastCalledWith({
        where: { id: 'order-1', status: OrderStatus.TIMEOUT },
        data: expect.objectContaining({ status: OrderStatus.SUCCEEDED }),
      });
      expect(membershipService.activate).toHaveBeenCalled();
    });

    it('TIMEOUT + 金额一致 → 幂等恢复 SUCCEEDED（按 TIMEOUT 守卫）+ 激活', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = buildTx({ updateMany });

      const result = await paymentOrder.applyGatewayOutcome(
        tx as any,
        { ...baseOrder, status: OrderStatus.TIMEOUT },
        paidOutcome
      );

      expect(result).toBe('succeeded');
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: OrderStatus.TIMEOUT },
        data: expect.objectContaining({ status: OrderStatus.SUCCEEDED }),
      });
      expect(membershipService.activate).toHaveBeenCalled();
    });

    it('TIMEOUT + 金额不符 → 不改状态，不激活', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = buildTx({ updateMany });

      const result = await paymentOrder.applyGatewayOutcome(
        tx as any,
        { ...baseOrder, status: OrderStatus.TIMEOUT },
        { ...paidOutcome, amount: 100 }
      );

      expect(result).toBe('already-terminal');
      expect(updateMany).not.toHaveBeenCalled();
      expect(membershipService.activate).not.toHaveBeenCalled();
    });

    it('CLOSED + 金额一致 → 幂等恢复 SUCCEEDED（按 CLOSED 守卫）', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = buildTx({ updateMany });

      const result = await paymentOrder.applyGatewayOutcome(
        tx as any,
        { ...baseOrder, status: OrderStatus.CLOSED },
        paidOutcome
      );

      expect(result).toBe('succeeded');
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: OrderStatus.CLOSED },
        data: expect.objectContaining({ status: OrderStatus.SUCCEEDED }),
      });
    });

    it('SUCCEEDED/REFUNDED/FAILED 终态 → already-terminal，零写入', async () => {
      for (const status of [
        OrderStatus.SUCCEEDED,
        OrderStatus.REFUNDED,
        OrderStatus.FAILED,
      ]) {
        const updateMany = jest.fn().mockResolvedValue({ count: 1 });
        const tx = buildTx({ updateMany });

        const result = await paymentOrder.applyGatewayOutcome(
          tx as any,
          { ...baseOrder, status },
          paidOutcome
        );

        expect(result).toBe('already-terminal');
        expect(updateMany).not.toHaveBeenCalled();
        expect(membershipService.activate).not.toHaveBeenCalled();
      }
    });

    it('vipTier 缺失 → 完成订单但不激活（防御异常行）', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = buildTx({ updateMany });

      const result = await paymentOrder.applyGatewayOutcome(
        tx as any,
        { ...baseOrder, vipTier: null },
        paidOutcome
      );

      expect(result).toBe('succeeded');
      expect(membershipService.activate).not.toHaveBeenCalled();
    });

    it('months 缺失 → 按 1 个月换算激活天数', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = buildTx({ updateMany });

      await paymentOrder.applyGatewayOutcome(
        tx as any,
        { ...baseOrder, months: null },
        paidOutcome
      );

      expect(membershipService.activate).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.anything(),
        30
      );
    });
  });
});
