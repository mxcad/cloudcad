import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import type { DurationPricing } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import type { CreateDurationPricingDto } from './dto/create-duration-pricing.dto';
import type { UpdateDurationPricingDto } from './dto/update-duration-pricing.dto';

@Injectable()
export class DurationPricingService {
  constructor(private prisma: DatabaseService) {}

  async create(dto: CreateDurationPricingDto) {
    const existing = await this.prisma.durationPricing.findUnique({ where: { months: dto.months } });
    if (existing) {
      throw new ConflictException(`duration for ${dto.months} months already exists`);
    }
    const pricing = await this.prisma.durationPricing.create({
      data: {
        months: dto.months,
        multiplierBps: dto.multiplierBps,
        label: dto.label,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? dto.months,
      },
    });
    return this.toResponse(pricing);
  }

  async findAll() {
    const list = await this.prisma.durationPricing.findMany({ orderBy: { sortOrder: 'asc' } });
    return list.map(this.toResponse);
  }

  async findActive() {
    const list = await this.prisma.durationPricing.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return list.map(this.toResponse);
  }

  async findById(id: string) {
    const pricing = await this.prisma.durationPricing.findUnique({ where: { id } });
    if (!pricing) throw new NotFoundException('duration pricing not found');
    return this.toResponse(pricing);
  }

  async update(id: string, dto: UpdateDurationPricingDto) {
    const pricing = await this.prisma.durationPricing.findUnique({ where: { id } });
    if (!pricing) throw new NotFoundException('duration pricing not found');

    const data: Record<string, unknown> = {};
    if (dto.months !== undefined) {
      const existing = await this.prisma.durationPricing.findUnique({ where: { months: dto.months } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`duration for ${dto.months} months already exists`);
      }
      data.months = dto.months;
    }
    if (dto.multiplierBps !== undefined) data.multiplierBps = dto.multiplierBps;
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const updated = await this.prisma.durationPricing.update({ where: { id }, data });
    return this.toResponse(updated);
  }

  async deactivate(id: string) {
    const pricing = await this.prisma.durationPricing.findUnique({ where: { id } });
    if (!pricing) throw new NotFoundException('duration pricing not found');
    const updated = await this.prisma.durationPricing.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toResponse(updated);
  }

  private toResponse(pricing: DurationPricing) {
    return {
      id: pricing.id,
      months: pricing.months,
      multiplier: pricing.multiplierBps / 10000,
      multiplierBps: pricing.multiplierBps,
      label: pricing.label,
      isActive: pricing.isActive,
      sortOrder: pricing.sortOrder,
      createdAt: pricing.createdAt,
    };
  }
}
