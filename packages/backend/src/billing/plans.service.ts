import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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

  async getPlanById(id: string) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('plan not found');
    return this.toPlanResponse(plan);
  }

  async createPlan(data: {
    name: string;
    durationDays: number;
    price: number;
    originalPrice?: number | null;
    tier: string;
    sortOrder: number;
    features?: any;
  }) {
    if (data.originalPrice != null && data.originalPrice < data.price) {
      throw new BadRequestException('originalPrice must be >= price');
    }
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
  }

  async updatePlan(id: string, data: {
    name?: string;
    durationDays?: number;
    price?: number;
    originalPrice?: number | null;
    tier?: string;
    sortOrder?: number;
    isActive?: boolean;
    features?: any;
  }) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('plan not found');

    const newPrice = data.price ?? plan.price;
    const newOriginalPrice = data.originalPrice !== undefined ? data.originalPrice : plan.originalPrice;
    if (newOriginalPrice != null && newOriginalPrice < newPrice) {
      throw new BadRequestException('originalPrice must be >= price');
    }

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
  }

  async deactivatePlan(id: string) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('plan not found');
    const updated = await this.prisma.membershipPlan.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toPlanResponse(updated);
  }

  private toPlanResponse(plan: any) {
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
