///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  OnModuleInit,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { DatabaseService } from '../database/database.service';
import {
  RUNTIME_CONFIG_DEFINITIONS,
  DEFAULT_RUNTIME_CONFIGS,
} from './runtime-config.constants';
import {
  RuntimeConfigDefinition,
  RuntimeConfigItem,
  RuntimeConfigValueType,
} from './runtime-config.types';

const CACHE_PREFIX = 'runtime_config:';
const CACHE_TTL = 3600; // 1 小时

@Injectable()
export class RuntimeConfigService implements OnModuleInit {
  constructor(
    private readonly prisma: DatabaseService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * 模块初始化时同步默认配置到数据库
   */
  async onModuleInit() {
    await this.syncDefaultConfigs();
  }

  /**
   * 同步默认配置到数据库（仅添加不存在的配置项）
   */
  private async syncDefaultConfigs() {
    for (const def of RUNTIME_CONFIG_DEFINITIONS) {
      const existing = await this.prisma.runtimeConfig.findUnique({
        where: { key: def.key },
      });

      if (!existing) {
        await this.prisma.runtimeConfig.create({
          data: {
            key: def.key,
            value: JSON.stringify(def.defaultValue),
            type: def.type,
            category: def.category,
            description: def.description,
            isPublic: def.isPublic,
          },
        });
      }
    }
  }

  /**
   * 获取单个配置值（用于内部调用）
   */
  async getValue<T = string | number | boolean>(
    key: string,
    defaultValue?: T,
  ): Promise<T> {
    // 1. 查 Redis 缓存
    const cached = await this.redis.get(`${CACHE_PREFIX}${key}`);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }

    // 2. 查数据库
    const config = await this.prisma.runtimeConfig.findUnique({
      where: { key },
    });

    if (!config) {
      // 3. 使用传入的默认值或配置定义中的默认值
      const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
      const value = defaultValue ?? (def?.defaultValue as T);
      return value;
    }

    // 4. 解析值并写入缓存
    const value = this.parseValue(config.value, config.type as RuntimeConfigValueType);
    await this.redis.setex(`${CACHE_PREFIX}${key}`, CACHE_TTL, JSON.stringify(value));

    return value as T;
  }

  /**
   * 获取单个配置项（用于 Controller 返回）
   */
  async get(key: string): Promise<RuntimeConfigItem> {
    const config = await this.prisma.runtimeConfig.findUnique({
      where: { key },
    });

    if (!config) {
      throw new NotFoundException(`配置项不存在: ${key}`);
    }

    return {
      key: config.key,
      value: this.parseValue(config.value, config.type as RuntimeConfigValueType),
      type: config.type as RuntimeConfigValueType,
      category: config.category as RuntimeConfigItem['category'],
      description: config.description,
      isPublic: config.isPublic,
      updatedBy: config.updatedBy,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * 设置配置值
   */
  async set(
    key: string,
    value: string | number | boolean,
    operatorId?: string,
    operatorIp?: string,
  ): Promise<void> {
    const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
    if (!def) {
      throw new BadRequestException(`未知的配置项: ${key}`);
    }

    // 获取旧值用于日志
    const oldConfig = await this.prisma.runtimeConfig.findUnique({
      where: { key },
    });
    const oldValue = oldConfig?.value;

    // 更新数据库
    await this.prisma.runtimeConfig.upsert({
      where: { key },
      update: {
        value: JSON.stringify(value),
        updatedBy: operatorId,
      },
      create: {
        key,
        value: JSON.stringify(value),
        type: def.type,
        category: def.category,
        description: def.description,
        isPublic: def.isPublic,
        updatedBy: operatorId,
      },
    });

    // 记录日志
    await this.prisma.runtimeConfigLog.create({
      data: {
        key,
        oldValue,
        newValue: JSON.stringify(value),
        operatorId,
        operatorIp,
      },
    });

    // 删除缓存
    await this.redis.del(`${CACHE_PREFIX}${key}`);
    await this.redis.del(`${CACHE_PREFIX}all`);
  }

  /**
   * 获取所有公开配置（供前端使用）
   */
  async getPublicConfigs(): Promise<Record<string, string | number | boolean>> {
    // 1. 查缓存
    const cached = await this.redis.get(`${CACHE_PREFIX}all`);
    if (cached !== null) {
      return JSON.parse(cached);
    }

    // 2. 查数据库
    const configs = await this.prisma.runtimeConfig.findMany({
      where: { isPublic: true },
    });

    // 3. 构建结果
    const result: Record<string, string | number | boolean> = {};
    for (const config of configs) {
      result[config.key] = this.parseValue(
        config.value,
        config.type as RuntimeConfigValueType,
      );
    }

    // 4. 写入缓存
    await this.redis.setex(`${CACHE_PREFIX}all`, CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * 获取所有配置项（管理后台使用）
   */
  async getAllConfigs(): Promise<RuntimeConfigItem[]> {
    const configs = await this.prisma.runtimeConfig.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });

    return configs.map((config) => ({
      key: config.key,
      value: this.parseValue(config.value, config.type as RuntimeConfigValueType),
      type: config.type as RuntimeConfigValueType,
      category: config.category as RuntimeConfigItem['category'],
      description: config.description,
      isPublic: config.isPublic,
      updatedBy: config.updatedBy,
      updatedAt: config.updatedAt,
    }));
  }

  /**
   * 重置配置为默认值
   */
  async resetToDefault(key: string, operatorId?: string, operatorIp?: string): Promise<void> {
    const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
    if (!def) {
      throw new BadRequestException(`未知的配置项: ${key}`);
    }

    await this.set(key, def.defaultValue, operatorId, operatorIp);
  }

  /**
   * 解析配置值
   */
  private parseValue(value: string, type: RuntimeConfigValueType): string | number | boolean {
    try {
      const parsed = JSON.parse(value);
      switch (type) {
        case 'boolean':
          return Boolean(parsed);
        case 'number':
          return Number(parsed);
        default:
          return String(parsed);
      }
    } catch {
      return value;
    }
  }

  /**
   * 获取配置定义列表
   */
  getDefinitions(): RuntimeConfigDefinition[] {
    return RUNTIME_CONFIG_DEFINITIONS;
  }
}
