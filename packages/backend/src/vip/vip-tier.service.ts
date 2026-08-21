import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@cloudcad/db';
import type { VipTier } from '@cloudcad/db';
import { I18nContext } from 'nestjs-i18n';
import { DatabaseService } from '../database/database.service';
import { ConfigKeyRegistryService } from './config-key-registry.service';
import type { CreateVipTierDto } from './dto/create-vip-tier.dto';
import type { UpdateVipTierDto } from './dto/update-vip-tier.dto';
import type { UpdateTierConfigsDto } from './dto/update-tier-configs.dto';

/** 系统固有等级：所有账号注册即拥有的免费等级，不可创建/下架/删除（仅可调整权益配置） */
export const FREE_TIER_LEVEL = 0;

@Injectable()
export class VipTierService {
  private readonly logger = new Logger(VipTierService.name);

  constructor(
    private prisma: DatabaseService,
    private configKeyRegistryService: ConfigKeyRegistryService,
  ) {}

  async create(dto: CreateVipTierDto) {
    if (dto.level === FREE_TIER_LEVEL) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.vip.free_tier_cannot_create') ??
          'level 0 为系统默认等级，不可创建',
      );
    }
    const existing = await this.prisma.vipTier.findUnique({ where: { level: dto.level } });
    if (existing) {
      throw new ConflictException(`level ${dto.level} already exists`);
    }
    if (dto.configs !== undefined) {
      await this.validateConfigs(dto.configs);
    }
    const tier = await this.prisma.vipTier.create({
      data: {
        level: dto.level,
        name: dto.name,
        baseMonthlyPrice: dto.baseMonthlyPrice,
        isActive: dto.isActive ?? true,
        configs: (dto.configs ?? {}) as Prisma.InputJsonValue,
      },
    });
    return this.toResponse(tier);
  }

  async findAll() {
    const tiers = await this.prisma.vipTier.findMany({ orderBy: { level: 'asc' } });
    return tiers.map(this.toResponse);
  }

  async findActive() {
    const tiers = await this.prisma.vipTier.findMany({
      where: { isActive: true },
      orderBy: { level: 'asc' },
    });
    return tiers.map(this.toResponse);
  }

  async findById(id: string) {
    const tier = await this.prisma.vipTier.findUnique({ where: { id } });
    if (!tier) throw new NotFoundException('vip tier not found');
    return this.toResponse(tier);
  }

  async findByLevel(level: number) {
    const tier = await this.prisma.vipTier.findUnique({ where: { level } });
    if (!tier) throw new NotFoundException('vip tier not found');
    return this.toResponse(tier);
  }

  async update(id: string, dto: UpdateVipTierDto) {
    const tier = await this.prisma.vipTier.findUnique({ where: { id } });
    if (!tier) throw new NotFoundException('vip tier not found');

    if (tier.level === FREE_TIER_LEVEL) {
      const lockedChanged =
        (dto.name !== undefined && dto.name !== tier.name) ||
        (dto.baseMonthlyPrice !== undefined &&
          dto.baseMonthlyPrice !== tier.baseMonthlyPrice) ||
        (dto.isActive !== undefined && dto.isActive !== tier.isActive);
      if (lockedChanged) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.vip.free_tier_locked') ??
            '系统默认等级仅可调整权益配置，名称/价格/上下架状态不可修改',
        );
      }
    }

    if (dto.configs !== undefined) {
      await this.validateConfigs(dto.configs);
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.baseMonthlyPrice !== undefined) data.baseMonthlyPrice = dto.baseMonthlyPrice;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.configs !== undefined) data.configs = dto.configs as Prisma.InputJsonValue;

    const updated = await this.prisma.vipTier.update({ where: { id }, data });
    return this.toResponse(updated);
  }

  async updateConfigs(id: string, dto: UpdateTierConfigsDto) {
    const tier = await this.prisma.vipTier.findUnique({ where: { id } });
    if (!tier) throw new NotFoundException('vip tier not found');
    await this.validateConfigs(dto.configs);
    const updated = await this.prisma.vipTier.update({
      where: { id },
      data: { configs: dto.configs as Prisma.InputJsonValue },
    });
    return this.toResponse(updated);
  }

  async deactivate(id: string) {
    const tier = await this.prisma.vipTier.findUnique({ where: { id } });
    if (!tier) throw new NotFoundException('vip tier not found');
    if (tier.level === FREE_TIER_LEVEL) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.vip.free_tier_cannot_deactivate') ??
          '系统默认等级不可下架',
      );
    }
    const updated = await this.prisma.vipTier.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toResponse(updated);
  }

  async remove(id: string) {
    const tier = await this.prisma.vipTier.findUnique({ where: { id } });
    if (!tier) throw new NotFoundException('vip tier not found');
    if (tier.level === FREE_TIER_LEVEL) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.vip.free_tier_cannot_remove') ??
          '系统默认等级不可删除',
      );
    }

    const orderCount = await this.prisma.paymentOrder.count({
      where: { vipTierId: id },
    });
    if (orderCount > 0) {
      throw new BadRequestException(
        '该 VIP 等级已被支付订单引用，无法物理删除，请改为下架',
      );
    }

    await this.prisma.vipTier.delete({ where: { id } });
    return { success: true };
  }

  private async validateConfigs(configs: Record<string, unknown>): Promise<void> {
    if (typeof configs !== 'object' || configs === null) {
      throw new BadRequestException('configs must be a non-null object');
    }
    const keys = await this.configKeyRegistryService.findAll();
    const registryByKey = new Map(keys.map((k) => [k.key, k]));
    for (const [key, value] of Object.entries(configs)) {
      const entry = registryByKey.get(key);
      if (!entry) continue; // 未注册的 key 不校验
      if (entry.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.vip.config_must_be_number', { args: { key } }) ?? `config key "${key}" 必须是数字`,
        );
      }
      if (entry.type === 'bool' && typeof value !== 'boolean') {
        throw new BadRequestException(
          I18nContext.current()?.t('error.vip.config_must_be_boolean', { args: { key } }) ?? `config key "${key}" 必须是布尔值`,
        );
      }
    }
  }

  private toResponse(tier: VipTier) {
    return {
      id: tier.id,
      level: tier.level,
      name: tier.name,
      baseMonthlyPriceYuan: tier.baseMonthlyPrice / 100,
      baseMonthlyPrice: tier.baseMonthlyPrice,
      isActive: tier.isActive,
      configs: tier.configs as Record<string, unknown>,
      createdAt: tier.createdAt,
      updatedAt: tier.updatedAt,
    };
  }
}
