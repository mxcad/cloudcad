import { describe, expect, it, beforeEach } from 'vitest'
import {
  type BillingOrder,
  type ConfigRegistryEntry,
  activeRefund,
  canApplyRefund,
  canRepay,
  centsToYuan,
  clearPendingPayment,
  formatDate,
  formatDateTime,
  isWechatBrowser,
  loadPendingPayment,
  orderAmountCents,
  pickTradeType,
  resolveQuotaValue,
  savePendingPayment,
  sortDurations,
  sortTiers,
  usagePercent,
} from './billing'

const WECHAT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.49'
const SYSTEM_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'

function order(overrides: Partial<BillingOrder> = {}): BillingOrder {
  return {
    id: 'ord_1',
    orderNo: 'WX20260915000001',
    vipTierId: 'tier_1',
    months: 1,
    amount: 19900,
    status: 'SUCCEEDED',
    gateway: 'wechat_pay',
    gatewayOrderId: null,
    vipTierName: 'VIP1',
    durationLabel: '1个月',
    priceYuan: 199,
    createdAt: '2026-09-15T06:30:00.000Z',
    ...overrides,
  }
}

describe('isWechatBrowser / pickTradeType', () => {
  it('微信内置浏览器返回 MWEB', () => {
    expect(isWechatBrowser(WECHAT_UA)).toBe(true)
    expect(pickTradeType(WECHAT_UA)).toBe('MWEB')
  })

  it('系统浏览器返回 NATIVE', () => {
    expect(isWechatBrowser(SYSTEM_UA)).toBe(false)
    expect(pickTradeType(SYSTEM_UA)).toBe('NATIVE')
  })

  it('空 UA（无 navigator 环境）回落到 NATIVE，不抛错', () => {
    expect(isWechatBrowser('')).toBe(false)
    expect(pickTradeType('')).toBe('NATIVE')
  })

  it('默认参数读取当前 navigator', () => {
    // happy-dom 默认 UA 不含 MicroMessenger
    expect(pickTradeType()).toBe('NATIVE')
  })
})

describe('orderAmountCents', () => {
  it('与后端计价公式一致：round(base * bps * months / 10000)', () => {
    expect(orderAmountCents({ baseMonthlyPrice: 19900 }, { multiplierBps: 10000, months: 1 })).toBe(
      19900,
    )
    expect(orderAmountCents({ baseMonthlyPrice: 19900 }, { multiplierBps: 8500, months: 3 })).toBe(
      50745,
    )
  })

  it('小数结果四舍五入（对齐后端 Math.round）', () => {
    // 3 * 3333 * 3 / 10000 = 2.9997 → 3
    expect(orderAmountCents({ baseMonthlyPrice: 3 }, { multiplierBps: 3333, months: 3 })).toBe(3)
  })
})

describe('centsToYuan', () => {
  it('分转元固定两位小数', () => {
    expect(centsToYuan(1990)).toBe('19.90')
    expect(centsToYuan(19900)).toBe('199.00')
    expect(centsToYuan(0)).toBe('0.00')
    expect(centsToYuan(123456)).toBe('1234.56')
    expect(centsToYuan(1)).toBe('0.01')
  })

  it('非数字输入回落到 0.00', () => {
    expect(centsToYuan(Number.NaN)).toBe('0.00')
    expect(centsToYuan(Number.POSITIVE_INFINITY)).toBe('0.00')
  })
})

describe('sortTiers / sortDurations', () => {
  it('按 level / sortOrder 升序且不改动入参', () => {
    const tiers = [
      { id: 'c', level: 3 },
      { id: 'a', level: 1 },
      { id: 'b', level: 2 },
    ] as never[]
    const input = [...tiers]
    expect(sortTiers(tiers).map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(tiers).toEqual(input)

    const durations = [
      { id: 'x', sortOrder: 20, months: 12 },
      { id: 'y', sortOrder: 20, months: 1 },
      { id: 'z', sortOrder: 10, months: 3 },
    ] as never[]
    expect(sortDurations(durations).map((d) => d.id)).toEqual(['z', 'y', 'x'])
  })
})

describe('resolveQuotaValue', () => {
  function entry(key: string, defaultValue: number): ConfigRegistryEntry {
    return { id: key, key, type: 'number', label: null, defaultValue, description: null, sortOrder: 0 }
  }
  const registry = new Map<string, ConfigRegistryEntry>([
    ['quota.max_projects', entry('quota.max_projects', 5)],
    ['quota.personal_storage_mb', entry('quota.personal_storage_mb', 50)],
  ])

  it('档位配置优先于 registry 默认值', () => {
    expect(resolveQuotaValue({ 'quota.max_projects': 20 }, 'quota.max_projects', registry)).toBe(20)
  })

  it('缺键回落 registry 默认值', () => {
    expect(resolveQuotaValue({}, 'quota.max_projects', registry)).toBe(5)
    expect(resolveQuotaValue(undefined, 'quota.personal_storage_mb', registry)).toBe(50)
  })

  it('registry 缺项时返回 0', () => {
    expect(resolveQuotaValue({}, 'quota.unknown', registry)).toBe(0)
    expect(resolveQuotaValue({}, 'quota.max_projects')).toBe(0)
  })

  it('字符串数字可解析，非法值归零', () => {
    expect(resolveQuotaValue({ 'quota.max_projects': '8' }, 'quota.max_projects')).toBe(8)
    expect(resolveQuotaValue({ 'quota.max_projects': 'abc' }, 'quota.max_projects')).toBe(0)
    expect(resolveQuotaValue({ 'quota.max_projects': '' }, 'quota.max_projects')).toBe(0)
  })
})

describe('usagePercent', () => {
  it('正常计算并封顶 100', () => {
    expect(usagePercent(50, 100)).toBeCloseTo(50)
    expect(usagePercent(150, 100)).toBe(100)
  })

  it('total 非正或 used 非法时返回 0', () => {
    expect(usagePercent(10, 0)).toBe(0)
    expect(usagePercent(10, -1)).toBe(0)
    expect(usagePercent(-5, 100)).toBe(0)
    expect(usagePercent(Number.NaN, 100)).toBe(0)
  })
})

describe('订单退款判定', () => {
  it('已支付且无退款申请可申请退款', () => {
    const o = order()
    expect(canApplyRefund(o)).toBe(true)
    expect(activeRefund(o)).toBeNull()
  })

  it('审核中的退款阻止再次申请', () => {
    const o = order({
      refundApplications: [{ id: 'r1', status: 'PENDING', reason: '误购', createdAt: '' }],
    })
    expect(activeRefund(o)?.id).toBe('r1')
    expect(canApplyRefund(o)).toBe(false)
  })

  it('被驳回的退款允许重申', () => {
    const o = order({
      refundApplications: [{ id: 'r2', status: 'REJECTED', reason: '误购', createdAt: '' }],
    })
    expect(activeRefund(o)).toBeNull()
    expect(canApplyRefund(o)).toBe(true)
  })

  it('未支付 / 已退款 / 待支付订单的可操作状态', () => {
    expect(canRepay(order({ status: 'PENDING' }))).toBe(true)
    expect(canRepay(order({ status: 'SUCCEEDED' }))).toBe(false)
    expect(canApplyRefund(order({ status: 'PENDING' }))).toBe(false)
    expect(canApplyRefund(order({ status: 'REFUNDED' }))).toBe(false)
    expect(canApplyRefund(order({ status: 'TIMEOUT' }))).toBe(false)
  })
})

describe('formatDate / formatDateTime', () => {
  it('合法时间按本地时区格式化', () => {
    expect(formatDate('2026-09-15T06:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(formatDateTime('2026-09-15T06:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('空值与非法时间返回空串', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('not-a-date')).toBe('')
    expect(formatDateTime('not-a-date')).toBe('')
  })
})

describe('待支付上下文持久化', () => {
  beforeEach(() => {
    clearPendingPayment()
  })

  it('保存后完整读回', () => {
    savePendingPayment({
      orderNo: 'WX123',
      vipTierName: 'VIP2',
      durationLabel: '3个月',
      priceYuan: 597,
      tradeType: 'MWEB',
    })
    expect(loadPendingPayment()).toEqual({
      orderNo: 'WX123',
      vipTierName: 'VIP2',
      durationLabel: '3个月',
      priceYuan: 597,
      tradeType: 'MWEB',
    })
  })

  it('清除后读回 null', () => {
    savePendingPayment({
      orderNo: 'WX123',
      vipTierName: '',
      durationLabel: '',
      priceYuan: 0,
      tradeType: 'NATIVE',
    })
    clearPendingPayment()
    expect(loadPendingPayment()).toBeNull()
  })

  it('缺 orderNo / 脏数据 / 无存储时一律返回 null', () => {
    localStorage.setItem('pendingPayment', JSON.stringify({ vipTierName: 'VIP1' }))
    expect(loadPendingPayment()).toBeNull()

    localStorage.setItem('pendingPayment', '{not-json')
    expect(loadPendingPayment()).toBeNull()

    expect(loadPendingPayment()).toBeNull()
  })

  it('tradeType 非 MWEB 一律归一为 NATIVE（直接写脏 JSON 模拟）', () => {
    localStorage.setItem(
      'pendingPayment',
      JSON.stringify({ orderNo: 'WX1', tradeType: 'JSAPI', priceYuan: 199 }),
    )
    expect(loadPendingPayment()).toEqual({
      orderNo: 'WX1',
      vipTierName: '',
      durationLabel: '',
      priceYuan: 199,
      tradeType: 'NATIVE',
    })
  })

  it('存储不可用时不抛错', () => {
    const real = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('quota exceeded')
    }
    try {
      expect(() =>
        savePendingPayment({
          orderNo: 'WX1',
          vipTierName: '',
          durationLabel: '',
          priceYuan: 0,
          tradeType: 'MWEB',
        }),
      ).not.toThrow()
    } finally {
      Storage.prototype.setItem = real
    }
  })
})
