import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MembershipPlan } from '@prisma/client';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PlansService {
  constructor(private prisma: DatabaseService) {}

  async getAllPlans() {
    const plans = await this.prisma.membershipPlan.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return plans.map(this.toPlanResponse);
  }

  async getActivePlans() {
    const plans = await this.prisma.membershipPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return plans.map(this.toPlanResponse);
  }

  async createPlan(data: {
    name: string;
    durationDays: number;
    price: number;
    originalPrice?: number | null;
    tier: string;
    sortOrder: number;
    features?: Prisma.JsonValue;
  }) {
    if (data.originalPrice != null && data.originalPrice < data.price) {
      throw new BadRequestException('originalPrice must be >= price');
    }
    if (data.features !== undefined) {
      try {
        JSON.parse(JSON.stringify(data.features));
      } catch {
        throw new BadRequestException('features must be JSON-serializable');
      }
    }
    try {
      const plan = await this.prisma.membershipPlan.create({
        data: {
          name: data.name,
          durationDays: data.durationDays,
          price: data.price,
          originalPrice: data.originalPrice ?? null,
          tier: data.tier as any,
          sortOrder: data.sortOrder,
          features: data.features ?? undefined,
        },
      });
      return this.toPlanResponse(plan);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('sortOrder already exists');
      }
      throw e;
    }
  }

  async updatePlan(id: string, data: {
    name?: string;
    durationDays?: number;
    price?: number;
    originalPrice?: number | null;
    tier?: string;
    sortOrder?: number;
    isActive?: boolean;
    features?: Prisma.JsonValue;
  }) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('plan not found');

    const newPrice = data.price ?? plan.price;
    const newOriginalPrice = data.originalPrice !== undefined ? data.originalPrice : plan.originalPrice;
    if (newOriginalPrice != null && newOriginalPrice < newPrice) {
      throw new BadRequestException('originalPrice must be >= price');
    }

    try {
      const updated = await this.prisma.membershipPlan.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.durationDays !== undefined && { durationDays: data.durationDays }),
          ...(data.price !== undefined && { price: data.price }),
          ...(data.originalPrice !== undefined && { originalPrice: data.originalPrice }),
          ...(data.tier !== undefined && { tier: data.tier as any }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.features !== undefined && { features: data.features }),
        },
      });
      return this.toPlanResponse(updated);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('sortOrder already exists');
      }
      throw e;
    }
  }

  async deactivatePlan(id: string) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('plan not found');

    // 检查同一 sortOrder 下是否已有 isActive=false 的记录，避免 @@unique([sortOrder, isActive]) 冲突
    const existingInactive = await this.prisma.membershipPlan.findFirst({
      where: { sortOrder: plan.sortOrder, isActive: false, id: { not: id } },
    });

    const updated = await this.prisma.membershipPlan.update({
      where: { id },
      data: {
        isActive: false,
        ...(existingInactive ? { sortOrder: -(Date.now() % 1000000) } : {}),
      },
    });
    return this.toPlanResponse(updated);
  }

  private toPlanResponse(plan: MembershipPlan) {
    return {
      id: plan.id,
      name: plan.name,
      durationDays: plan.durationDays,
      priceYuan: plan.price / 100,
      originalPriceYuan: plan.originalPrice != null ? plan.originalPrice / 100 : null,
      tier: plan.tier,
      sortOrder: plan.sortOrder,
      features: plan.features,
      isActive: plan.isActive,
    };
  }
}
