import { describe, it, expect } from 'vitest';
import { settleOrderIntake } from './paymentIntake';

describe('settleOrderIntake（下单后协议）', () => {
  it('SUCCEEDED → already-paid（对账兜底：不得呈现为「创建订单失败」/stale）', () => {
    const outcome = settleOrderIntake(
      { status: 'SUCCEEDED', orderNo: 'o1' },
      'manual'
    );
    expect(outcome).toEqual({ kind: 'already-paid' });
  });

  it('PENDING → pending + 描述符字段提取', () => {
    const outcome = settleOrderIntake(
      {
        status: 'PENDING',
        orderNo: 'o1',
        amount: 1200,
        codeUrl: 'https://wx/code',
        payParams: { appId: 'a' },
        redirectUrl: null,
      },
      'manual'
    );
    expect(outcome).toEqual({
      kind: 'pending',
      descriptor: {
        orderNo: 'o1',
        amount: 1200,
        codeUrl: 'https://wx/code',
        payParams: { appId: 'a' },
        redirectUrl: null,
      },
    });
  });

  it('auto → 描述符含 orderLabel（套餐名 · 时长）', () => {
    const outcome = settleOrderIntake(
      {
        status: 'PENDING',
        orderNo: 'o1',
        amount: 1,
        codeUrl: null,
        payParams: null,
        redirectUrl: null,
        vipTierName: 'Pro',
        durationLabel: '1 个月',
      },
      'auto'
    );
    expect(outcome.kind).toBe('pending');
    if (outcome.kind === 'pending') {
      expect(outcome.descriptor.orderLabel).toBe('Pro · 1 个月');
    }
  });

  it('auto 缺标签字段 → orderLabel 空串占位（不崩溃）', () => {
    const outcome = settleOrderIntake(
      { status: 'PENDING', orderNo: 'o1', amount: 1 },
      'auto'
    );
    expect(outcome.kind).toBe('pending');
    if (outcome.kind === 'pending') {
      expect(outcome.descriptor.orderLabel).toBe(' · ');
    }
  });

  it('其余终态（FAILED/TIMEOUT/CLOSED/REFUNDED）→ stale', () => {
    for (const status of ['FAILED', 'TIMEOUT', 'CLOSED', 'REFUNDED']) {
      expect(settleOrderIntake({ status }, 'manual')).toEqual({
        kind: 'stale',
      });
    }
  });

  it('响应数据缺失 → stale（不崩溃）', () => {
    expect(settleOrderIntake(undefined, 'repay')).toEqual({ kind: 'stale' });
  });

  it('codeUrl/payParams/redirectUrl 缺失 → null 兜底', () => {
    const outcome = settleOrderIntake(
      { status: 'PENDING', orderNo: 'o1', amount: 5 },
      'repay'
    );
    expect(outcome.kind).toBe('pending');
    if (outcome.kind === 'pending') {
      expect(outcome.descriptor.codeUrl).toBeNull();
      expect(outcome.descriptor.payParams).toBeNull();
      expect(outcome.descriptor.redirectUrl).toBeNull();
    }
  });
});
