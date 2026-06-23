// 本地枚举而非直接引用 Prisma 枚举，避免 custom-rules/no-prisma-enum-in-api-property 告警
// 值必须与 Prisma schema 中 MembershipTier 一致
export enum MembershipTier {
  FREE = 'FREE',
  PRO = 'PRO',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CLOSED = 'CLOSED',
  TIMEOUT = 'TIMEOUT',
}
