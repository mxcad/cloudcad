import { MembershipTier as PrismaMembershipTier, OrderStatus as PrismaOrderStatus } from '@prisma/client';

export const MembershipTier = PrismaMembershipTier;
export const OrderStatus = PrismaOrderStatus;

export type MembershipTier = PrismaMembershipTier;
export type OrderStatus = PrismaOrderStatus;
