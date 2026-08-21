import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@cloudcad/db';
import type { ConfigKeyRegistry } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import type { CreateConfigKeyDto } from './dto/create-config-key.dto';
import type { UpdateConfigKeyDto } from './dto/update-config-key.dto';

export interface ConfigKeyRegistryResponse {
  id: string;
  key: string;
  type: ConfigKeyRegistry['type'];
  label: string | null;
  defaultValue: Prisma.JsonValue;
  description: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ConfigKeyRegistryService {
  constructor(private prisma: DatabaseService) {}

  async create(dto: CreateConfigKeyDto): Promise<ConfigKeyRegistryResponse> {
    const existing = await this.prisma.configKeyRegistry.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`config key "${dto.key}" already exists`);
    }
    const entry = await this.prisma.configKeyRegistry.create({
      data: {
        key: dto.key,
        type: dto.type,
        label: dto.label,
        defaultValue: dto.defaultValue as Prisma.InputJsonValue ?? Prisma.JsonNull,
        description: dto.description ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return this.toResponse(entry);
  }

  async findAll(): Promise<ConfigKeyRegistryResponse[]> {
    const entries = await this.prisma.configKeyRegistry.findMany({ orderBy: { sortOrder: 'asc' } });
    return entries.map(this.toResponse);
  }

  async findById(id: string): Promise<ConfigKeyRegistryResponse> {
    const entry = await this.prisma.configKeyRegistry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('config key not found');
    return this.toResponse(entry);
  }

  async findByKey(key: string): Promise<ConfigKeyRegistryResponse> {
    const entry = await this.prisma.configKeyRegistry.findUnique({ where: { key } });
    if (!entry) throw new NotFoundException('config key not found');
    return this.toResponse(entry);
  }

  async update(id: string, dto: UpdateConfigKeyDto): Promise<ConfigKeyRegistryResponse> {
    const entry = await this.prisma.configKeyRegistry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('config key not found');

    const data: Record<string, unknown> = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.defaultValue !== undefined) data.defaultValue = dto.defaultValue as Prisma.InputJsonValue;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const updated = await this.prisma.configKeyRegistry.update({ where: { id }, data });
    return this.toResponse(updated);
  }

  async remove(id: string) {
    const entry = await this.prisma.configKeyRegistry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('config key not found');
    await this.prisma.configKeyRegistry.delete({ where: { id } });
  }

  private toResponse(entry: ConfigKeyRegistry): ConfigKeyRegistryResponse {
    return {
      id: entry.id,
      key: entry.key,
      type: entry.type,
      label: entry.label,
      defaultValue: entry.defaultValue,
      description: entry.description,
      sortOrder: entry.sortOrder,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }
}
