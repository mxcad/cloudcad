import { ApiProperty } from '@nestjs/swagger';

/**
 * 运营总量概览（与统计区间无关的当前存量）
 */
export class StatsOverviewDto {
  @ApiProperty({
    description: '当前用户总数（排除软删/注销账号）',
    example: 1234,
  })
  totalUsers: number;

  @ApiProperty({
    description: '累计付费用户数（历史任意成功支付过去重计数）',
    example: 56,
  })
  paidUsers: number;
}

/**
 * 每日新增用户统计点（UTC+8 自然日，排除软删账号）
 */
export class DailyRegistrationsPointDto {
  @ApiProperty({
    description: '日期（YYYY-MM-DD，UTC+8 自然日）',
    example: '2026-08-25',
  })
  date: string;

  @ApiProperty({
    description: '当日新增用户数（已排除软删/注销账号）',
    example: 12,
  })
  count: number;
}

/**
 * 每日新增用户统计响应
 */
export class DailyRegistrationsStatsDto {
  @ApiProperty({
    description: '开始日期（含，YYYY-MM-DD）',
    example: '2026-07-27',
  })
  startDate: string;

  @ApiProperty({
    description: '结束日期（含，YYYY-MM-DD）',
    example: '2026-08-25',
  })
  endDate: string;

  @ApiProperty({
    type: [DailyRegistrationsPointDto],
    description: '零填充日序列',
  })
  series: DailyRegistrationsPointDto[];

  @ApiProperty({ description: '区间新增用户总数', example: 356 })
  total: number;
}

/**
 * 每日购买统计点（成功支付订单，按 paidAt 归日、回退 createdAt）
 */
export class DailyPurchasesPointDto {
  @ApiProperty({
    description: '日期（YYYY-MM-DD，UTC+8 自然日）',
    example: '2026-08-25',
  })
  date: string;

  @ApiProperty({ description: '当日成功支付订单笔数', example: 5 })
  orderCount: number;

  @ApiProperty({ description: '当日去重付费用户数', example: 4 })
  userCount: number;

  @ApiProperty({ description: '当日支付金额合计（单位：分）', example: 199800 })
  amount: number;
}

/**
 * 按会员档位细分的购买统计
 */
export class PurchasesTierBreakdownDto {
  @ApiProperty({
    description: '档位 ID（历史订单可能无档位，为 null）',
    nullable: true,
    type: String,
  })
  tierId: string | null;

  @ApiProperty({ description: '档位等级（无法关联时为 -1）', example: 1 })
  tierLevel: number;

  @ApiProperty({
    description: '档位名称（无法关联时为 null）',
    nullable: true,
    type: String,
  })
  tierName: string | null;

  @ApiProperty({ description: '订单笔数', example: 10 })
  orderCount: number;

  @ApiProperty({ description: '去重付费用户数', example: 8 })
  userCount: number;

  @ApiProperty({ description: '金额合计（单位：分）', example: 1598000 })
  amount: number;
}

/**
 * 购买统计区间汇总
 */
export class PurchasesTotalsDto {
  @ApiProperty({ description: '区间成功支付订单总笔数', example: 128 })
  orderCount: number;

  @ApiProperty({ description: '区间去重付费用户总数', example: 96 })
  userCount: number;

  @ApiProperty({ description: '区间金额合计（单位：分）', example: 12798000 })
  amount: number;

  @ApiProperty({
    description:
      '区间内成功支付且当前状态为 REFUNDED 的退款单数（单列，不从购买数扣减）',
    example: 2,
  })
  refundedCount: number;
}

/**
 * 活跃用户统计点（UTC+8 自然日；MAU 为该日往前 30 天滚动窗口去重值）
 */
export class ActiveStatsPointDto {
  @ApiProperty({
    description: '日期（YYYY-MM-DD，UTC+8 自然日）',
    example: '2026-08-25',
  })
  date: string;

  @ApiProperty({
    description: '当日日活跃用户数（DAU，去重）',
    example: 42,
  })
  dau: number;

  @ApiProperty({
    description:
      '截至该日的月活跃用户数（MAU，近 30 天滚动窗口去重，含该日）',
    example: 156,
  })
  mau: number;
}

/**
 * 活跃用户统计响应（DAU/MAU/粘性 + 区间日序列）
 *
 * KPI（dau/mau/stickiness）为当前实时值，与统计区间无关：
 * dau=今日 0 点至现在（东八区），mau=近 30 天滚动窗口（含今日）。
 * 活跃口径=任意审计事件（成功登录/文件/项目/节点操作等），见 CONTEXT.md。
 */
export class ActiveStatsDto {
  @ApiProperty({
    description: '今日日活跃用户数（DAU，0 点至现在实时值，东八区切日）',
    example: 18,
  })
  dau: number;

  @ApiProperty({
    description: '月活跃用户数（MAU，近 30 天滚动窗口含今日）',
    example: 97,
  })
  mau: number;

  @ApiProperty({
    description: '粘性 = DAU/MAU（保留 4 位小数；MAU 为 0 时为 null）',
    nullable: true,
    type: 'number',
    example: 0.1856,
  })
  stickiness: number | null;

  @ApiProperty({
    description: '开始日期（含，YYYY-MM-DD）',
    example: '2026-07-27',
  })
  startDate: string;

  @ApiProperty({
    description: '结束日期（含，YYYY-MM-DD）',
    example: '2026-08-25',
  })
  endDate: string;

  @ApiProperty({ type: [ActiveStatsPointDto], description: '零填充日序列' })
  series: ActiveStatsPointDto[];
}

/**
 * 每日会员购买统计响应
 */
export class DailyPurchasesStatsDto {
  @ApiProperty({
    description: '开始日期（含，YYYY-MM-DD）',
    example: '2026-07-27',
  })
  startDate: string;

  @ApiProperty({
    description: '结束日期（含，YYYY-MM-DD）',
    example: '2026-08-25',
  })
  endDate: string;

  @ApiProperty({ type: [DailyPurchasesPointDto], description: '零填充日序列' })
  series: DailyPurchasesPointDto[];

  @ApiProperty({ type: PurchasesTotalsDto, description: '区间汇总' })
  totals: PurchasesTotalsDto;

  @ApiProperty({
    type: [PurchasesTierBreakdownDto],
    description: '按会员档位细分',
  })
  byTier: PurchasesTierBreakdownDto[];
}
