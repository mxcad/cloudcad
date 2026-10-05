///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  OnModuleInit,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { I18nContext } from 'nestjs-i18n';
import { DatabaseService } from '../database/database.service';
import { RUNTIME_CONFIG_DEFINITIONS } from './runtime-config.constants';
import {
  RuntimeConfigDefinition,
  RuntimeConfigItem,
  RuntimeConfigValue,
  RuntimeConfigValueType,
  RuntimeConfigHistoryEntry,
  ConfigValueSource,
} from './runtime-config.types';
import type { IRuntimeConfigService } from '@cloudcad/contracts';

const CACHE_PREFIX = 'runtime_config:';
const CACHE_TTL = 3600; // 1 小时
const TRUTHY_ENV_VALUES = ['true', '1', 'yes', 'on'];
const FALSY_ENV_VALUES = ['false', '0', 'no', 'off'];

/** env 层解析结果：`undefined` 表示该 env 未设置（回退下一层） */
type EnvResolveResult = RuntimeConfigValue | undefined;

@Injectable()
export class RuntimeConfigService implements OnModuleInit, IRuntimeConfigService {
  private readonly logger = new Logger(RuntimeConfigService.name);

  /**
   * 启动期标记。模块实例化（含 MulterModule.registerAsync 等 useFactory）发生在
   * 任何 onModuleInit 之前，此期间数据库是否可达尚未验证；此时抛错会让进程直接崩在
   * 实例化阶段，DatabaseService.onModuleInit 的带超时优雅错误提示根本走不到。
   * 启动期允许降级、启动结束后必须抛错——启动失败仍由 onModuleInit 统一报出。
   */
  private startupPhase = true;

  constructor(
    private readonly prisma: DatabaseService,
    @InjectRedis() private readonly redis: Redis
  ) {}

  /**
   * 模块初始化时同步默认配置到数据库
   * 优化：使用异步并行同步，不阻塞启动
   */
  async onModuleInit() {
    // 实例化期已结束：此后数据库故障必须抛错，不能静默降级
    this.startupPhase = false;

    // 异步同步配置，不阻塞启动
    this.syncDefaultConfigs().catch((error) => {
      this.logger.error('运行时配置同步失败:', error);
    });
  }

  /**
   * 同步默认配置到数据库
   *
   * 注意：写入的行 `updatedBy` 保持 null，这是「未被用户显式修改」的唯一判据——
   * env 层默认值正因此才能在这些行上生效（见 resolveValue）。
   * 优化：使用批量操作减少数据库往返
   */
  private async syncDefaultConfigs() {
    const startTime = Date.now();

    // 获取所有已存在的配置
    const existingConfigs = await this.prisma.runtimeConfig.findMany({
      select: { key: true, isPublic: true, description: true },
    });
    const existingKeys = new Set(existingConfigs.map((c) => c.key));
    const existingByKey = new Map(existingConfigs.map((c) => [c.key, c]));

    // 过滤出不存在的配置
    const newConfigs = RUNTIME_CONFIG_DEFINITIONS.filter(
      (def) => !existingKeys.has(def.key)
    );

    // `isPublic` / `description` 是定义表独有的元数据，管理端没有编辑入口——
    // 定义表改了就回填，否则 isPublic 变更对已初始化的存量部署永久无效。
    // 刻意不碰 value / updatedBy：那两项是「用户改过」与「env 层生效」的判据。
    const drifted = RUNTIME_CONFIG_DEFINITIONS.filter((def) => {
      const row = existingByKey.get(def.key);
      return (
        row && (row.isPublic !== def.isPublic || row.description !== def.description)
      );
    });

    if (newConfigs.length === 0 && drifted.length === 0) {
      return;
    }

    // 批量创建新配置
    if (newConfigs.length > 0) {
      await this.prisma.runtimeConfig.createMany({
        data: newConfigs.map((def) => ({
          key: def.key,
          value: JSON.stringify(def.defaultValue),
          type: def.type,
          category: def.category,
          description: def.description,
          isPublic: def.isPublic,
        })),
        skipDuplicates: true,
      });
    }

    if (drifted.length > 0) {
      // 逐键更新：各键的 isPublic / description 互不相同，updateMany 只能写同一份数据
      await this.prisma.$transaction(
        drifted.map((def) =>
          this.prisma.runtimeConfig.update({
            where: { key: def.key },
            data: { isPublic: def.isPublic, description: def.description },
          }),
        ),
      );
    }

    this.logger.log(
      `运行时配置同步完成: 创建 ${newConfigs.length} 个配置，耗时 ${Date.now() - startTime}ms`
    );
  }

  /**
   * 三层取值解析：运行时配置（DB 已显式修改）> env（部署期注入）> 默认值。
   *
   * env 只作为部署期默认值层：运维仍可在 .env 注入私有化定制（不进 DB、无需迁移脚本），
   * 但用户在运行时配置页显式改过的值优先级更高。DB 行存在但 `updatedBy` 为 null 时
   * 视为「安装时写入的默认行」，不遮蔽 env。
   */
  private resolveValue(
    def: RuntimeConfigDefinition | undefined,
    row: { value: string; type: string; updatedBy: string | null } | null
  ): { value: RuntimeConfigValue; source: ConfigValueSource } {
    if (!def) {
      return {
        value: row ? this.parseValue(row.value, row.type as RuntimeConfigValueType) : '',
        source: 'default',
      };
    }

    const isModified = row != null && row.updatedBy != null;
    if (isModified && row) {
      return {
        value: this.parseValue(row.value, def.type),
        source: 'runtime',
      };
    }

    const envValue = this.resolveEnvLayer(def);
    if (envValue !== undefined) {
      return { value: envValue, source: 'env' };
    }

    if (row) {
      return {
        value: this.parseValue(row.value, def.type),
        source: 'default',
      };
    }

    return { value: def.defaultValue, source: 'default' };
  }

  /**
   * 解析定义表声明的 env 层（envKey + 兼容别名）。返回 undefined 表示该键未声明
   * envKey，或声明了但 env 值无效——两种情形都回退下一层。
   *
   * 取值（resolveValue）与展示（enrichFromDefinition）必须共用此出口，否则两处会
   * 各自手写「取 envKey + envAliases」这一步而漏传参数。313b8d2 修的 envAliases 漏传
   * 正是这类副本缺失，同构缺陷会再次发生。
   */
  private resolveEnvLayer(def: RuntimeConfigDefinition | undefined): EnvResolveResult {
    return def?.envKey
      ? this.parseEnvValue(def.envKey, def.type, def.envAliases)
      : undefined;
  }

  /**
   * 解析 env 层的值。按配置 type 做类型归一；无法解析时返回 undefined
   * （表示该 env 值无效，回退下一层），不抛错——env 是部署期配置，
   * 拼错不应让运行时配置读取链路整体抛异常。
   */
  private parseEnvValue(
    envKey: string,
    type: RuntimeConfigValueType,
    aliases?: string[]
  ): EnvResolveResult {
    // 主变量名优先；未设置或空串时依次尝试兼容别名
    //（历史部署可能用旧变量名，不兼容会静默回滚到代码默认值）
    const raw =
      [envKey, ...(aliases ?? [])]
        .map((name) => process.env[name]?.trim())
        .find((value) => value !== undefined && value !== '') ?? undefined;
    if (raw === undefined) {
      return undefined;
    }

    switch (type) {
      case 'number': {
        const n = Number(raw);
        return Number.isFinite(n) ? n : undefined;
      }
      case 'boolean': {
        const lower = raw.toLowerCase();
        if (TRUTHY_ENV_VALUES.includes(lower)) return true;
        if (FALSY_ENV_VALUES.includes(lower)) return false;
        return undefined;
      }
      case 'json': {
        try {
          const parsed = JSON.parse(raw);
          if (
            parsed !== null &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed)
          ) {
            return parsed as Record<string, unknown>;
          }
        } catch {
          // 非法 JSON 视为未设置
        }
        return undefined;
      }
      default:
        return raw;
    }
  }

  /**
   * 获取单个配置值（用于内部调用）
   */
  async getValue<T = string | number | boolean | Record<string, unknown>>(
    key: string,
    defaultValue?: T
  ): Promise<T> {
    // 1. 查 Redis 缓存（可选加速层：Redis 不可达时必须降级直查数据库，
    //    否则启动期（如 multer 注册 useFactory）await 此处会因 Redis 故障
    //    直接中断进程，实例：Redis 未启动时 pnpm build 崩溃）
    let cached: string | null = null;
    try {
      cached = await this.redis.get(`${CACHE_PREFIX}${key}`);
    } catch (error) {
      this.logger.warn(
        `读取运行时配置缓存失败，降级直查数据库: ${(error as Error).message}`
      );
    }
    if (cached != null) {
      return JSON.parse(cached) as T;
    }

    // 2. 构建 Swagger 时（GENERATE_SWAGGER=1）启动整棵 AppModule 仅为生成文档，
    //    不需要真实配置值，只需返回可用的 shape。打包/CI 环境通常无可用 PostgreSQL
    //    （记忆 build-redis-unreachable-crash：Redis 降级后此处会继续查库），默认值
    //    与 cache miss + DB miss 后的降级行为一致，跳过 DB 查询避免构建崩溃。
    if (process.env.GENERATE_SWAGGER === '1') {
      const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
      return (defaultValue ?? (def?.defaultValue as T)) as T;
    }

    // 3. 查数据库。启动期数据库不可达时降级用默认值，不再抛错：
    //    MulterModule.registerAsync 的 useFactory 等在模块实例化期 await 此处查库，
    //    早于任何 onModuleInit 执行；一旦抛错进程直接崩在实例化阶段，
    //    DatabaseService.onModuleInit 的带超时优雅错误提示根本走不到
    //    （实例：2026-09-30 部署包 start 在 PG 未就绪时崩在 multer 注册，
    //    而非报出「数据库连接失败/超时」）。启动失败仍由 onModuleInit 统一报出
    //    （DatabaseService 会抛错使启动中止），故此处降级不会掩盖真实故障；
    //    运行期保持抛错，不静默降级。
    const row = await this.prisma.runtimeConfig
      .findUnique({ where: { key } })
      .catch((error) => {
        if (!this.startupPhase) throw error;
        this.logger.warn(
          `读取运行时配置失败，启动期降级用默认值 (${key}): ${(error as Error).message}`
        );
        return null;
      });

    const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
    const { value } = this.resolveValue(def, row);
    // 三层解析结果优先：定义表的 defaultValue 是唯一权威默认值，env 层由 envKey 声明。
    // 调用方 fallback 只对「未登记在 RUNTIME_CONFIG_DEFINITIONS 的 key」生效——否则
    // resolveValue 永不返回 nullish，fallback 恒遮蔽 DB/env 层，用户在配置页改的值全部
    // 静默无效（回归：见 spec 的「传 fallback 且 DB 值不同」用例）。
    const result = (def ? value : (defaultValue ?? value)) as T;

    // 4. 写入缓存（写缓存失败不阻塞：下次读会重试）
    try {
      await this.redis.setex(
        `${CACHE_PREFIX}${key}`,
        CACHE_TTL,
        JSON.stringify(result)
      );
    } catch {
      // 写缓存失败不阻塞
    }

    return result;
  }

  /**
   * 获取单个配置项（用于 Controller 返回）
   */
  async get(key: string): Promise<RuntimeConfigItem> {
    const config = await this.prisma.runtimeConfig.findUnique({
      where: { key },
    });

    if (!config) {
      throw new NotFoundException(I18nContext.current()?.t('error.config_extra.unknown_key', { args: { key } }) ?? `配置项不存在: ${key}`);
    }

    const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
    const { value, source } = this.resolveValue(def, config);

    return {
      key: config.key,
      value,
      type: config.type as RuntimeConfigValueType,
      category: config.category as RuntimeConfigItem['category'],
      description: config.description,
      isPublic: config.isPublic,
      updatedBy: config.updatedBy,
      updatedAt: config.updatedAt,
      ...this.enrichFromDefinition(def, config, value, source),
    };
  }

  /**
   * 设置配置值
   */
  async set(
    key: string,
    value: string | number | boolean | Record<string, unknown>,
    operatorId?: string,
    operatorIp?: string
  ): Promise<void> {
    const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
    if (!def) {
      throw new BadRequestException(I18nContext.current()?.t('error.config_extra.unknown_key', { args: { key } }) ?? `未知的配置项: ${key}`);
    }

    const invalidReason = this.validateValue(def, value);
    if (invalidReason) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.config_extra.invalid_value', {
          args: { key, reason: invalidReason },
        }) ?? `配置项 ${key} 的值无效: ${invalidReason}`
      );
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

    await this.invalidateCacheKeys([key]);
  }

  /**
   * 失效单键与公开配置聚合缓存（Redis 不可达时忽略：缓存失效是尽力而为）
   */
  private async invalidateCacheKeys(keys: string[]): Promise<void> {
    try {
      for (const key of keys) {
        await this.redis.del(`${CACHE_PREFIX}${key}`);
      }
      await this.redis.del(`${CACHE_PREFIX}all`);
    } catch {
      // 缓存删除失败不阻塞配置更新
    }
  }

  /**
   * 按配置定义校验值。返回 null 表示合法，否则返回原因。
   * 服务端必须独立校验——前端控件不是安全边界，绕过前端直调 PUT 必须同样被拦。
   */
  private validateValue(
    def: RuntimeConfigDefinition,
    value: string | number | boolean | Record<string, unknown>
  ): string | null {
    switch (def.type) {
      case 'boolean':
        if (typeof value !== 'boolean') {
          return '必须是布尔值';
        }
        return null;

      case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return '必须是有限数字';
        }
        if (def.input?.min !== undefined && value < def.input.min) {
          return `不能小于 ${def.input.min}`;
        }
        if (def.input?.max !== undefined && value > def.input.max) {
          return `不能大于 ${def.input.max}`;
        }
        return null;
      }

      case 'string': {
        const s = typeof value === 'string' ? value : String(value);
        const maxLen = def.input?.maxLength;
        if (maxLen !== undefined && s.length > maxLen) {
          return `不能超过 ${maxLen} 个字符`;
        }
        return null;
      }

      case 'json': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          return '必须是对象';
        }
        return null;
      }

      default:
        return '未知配置类型';
    }
  }

  /**
   * 获取所有公开配置（供前端使用）
   *
   * 返回**生效值**（三层解析后的结果），保证前端看到的是真实生效的配置，
   * 而不是安装时的默认行。
   */
  async getPublicConfigs(): Promise<Record<string, RuntimeConfigValue>> {
    // 1. 查缓存（Redis 不可达时降级直查数据库，不阻塞请求）
    let cached: string | null = null;
    try {
      cached = await this.redis.get(`${CACHE_PREFIX}all`);
    } catch (error) {
      this.logger.warn(
        `读取公开配置缓存失败，降级直查数据库: ${(error as Error).message}`
      );
    }
    if (cached != null) {
      return JSON.parse(cached);
    }

    // 2. 查数据库
    const configs = await this.prisma.runtimeConfig.findMany({
      where: { isPublic: true },
    });

    // 3. 构建结果（走三层解析，env 默认值同样生效）
    const result: Record<string, RuntimeConfigValue> = {};
    for (const config of configs) {
      const def = RUNTIME_CONFIG_DEFINITIONS.find(
        (d) => d.key === config.key
      );
      const { value } = this.resolveValue(def, config);
      result[config.key] = value;
    }

    // 4. 写入缓存（写缓存失败不阻塞）
    try {
      await this.redis.setex(
        `${CACHE_PREFIX}all`,
        CACHE_TTL,
        JSON.stringify(result)
      );
    } catch {
      // 写缓存失败不阻塞
    }

    return result;
  }

  /**
   * 获取所有配置项（管理后台使用），附带定义元数据与生效来源
   */
  async getAllConfigs(): Promise<RuntimeConfigItem[]> {
    const configs = await this.prisma.runtimeConfig.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });

    return configs.map((config) => {
      const def = RUNTIME_CONFIG_DEFINITIONS.find(
        (d) => d.key === config.key
      );
      const { value, source } = this.resolveValue(def, config);
      return {
        key: config.key,
        value,
        type: config.type as RuntimeConfigValueType,
        category: config.category as RuntimeConfigItem['category'],
        description: config.description,
        isPublic: config.isPublic,
        updatedBy: config.updatedBy,
        updatedAt: config.updatedAt,
        ...this.enrichFromDefinition(def, config, value, source),
      };
    });
  }

  /**
   * 组装定义元数据（默认值/来源/是否修改/层级/输入元数据/影响说明/危险标记）
   */
  private enrichFromDefinition(
    def: RuntimeConfigDefinition | undefined,
    row: { value: string; updatedBy: string | null },
    effectiveValue: RuntimeConfigValue,
    source: ConfigValueSource
  ): Pick<
    RuntimeConfigItem,
    | 'defaultValue'
    | 'source'
    | 'isModified'
    | 'envValue'
    | 'tier'
    | 'input'
    | 'impact'
    | 'dangerous'
    | 'hot'
  > {
    const envValue = this.resolveEnvLayer(def);

    const defaultValue = def?.defaultValue;
    const isModified =
      row.updatedBy != null ||
      (defaultValue !== undefined &&
        JSON.stringify(effectiveValue) !== JSON.stringify(defaultValue));

    return {
      defaultValue,
      source,
      isModified,
      envValue: envValue ?? null,
      tier: def?.tier ?? 'admin',
      input: def?.input,
      impact: def?.impact,
      dangerous: def?.dangerous ?? false,
      hot: def?.hot ?? true,
    };
  }

  /**
   * 重置配置为默认值。
   *
   * 实现为「清空显式修改标记」而非「写回默认值」：`updatedBy` 置回 null 后
   * resolveValue 视该行为安装默认行，env 层默认值重新生效，isModified 也归零。
   * 若走 set(def.defaultValue)，会带上操作者 id 而永久遮蔽 env 层，且 isModified 恒为 true。
   */
  async resetToDefault(
    key: string,
    operatorId?: string,
    operatorIp?: string
  ): Promise<void> {
    const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
    if (!def) {
      throw new BadRequestException(I18nContext.current()?.t('error.config_extra.unknown_key', { args: { key } }) ?? `未知的配置项: ${key}`);
    }

    const defaultValueJson = JSON.stringify(def.defaultValue);
    const oldConfig = await this.prisma.runtimeConfig.findUnique({
      where: { key },
    });

    await this.prisma.runtimeConfig.upsert({
      where: { key },
      update: { value: defaultValueJson, updatedBy: null },
      create: {
        key,
        value: defaultValueJson,
        type: def.type,
        category: def.category,
        description: def.description,
        isPublic: def.isPublic,
        updatedBy: null,
      },
    });

    // 值实际发生变化时才留审计记录（保持行不被删：getAllConfigs/get 仍需可见）
    if (oldConfig?.value !== defaultValueJson) {
      await this.prisma.runtimeConfigLog.create({
        data: {
          key,
          oldValue: oldConfig?.value,
          newValue: defaultValueJson,
          operatorId,
          operatorIp,
        },
      });
    }

    await this.invalidateCacheKeys([key]);
  }

  /**
   * 按分类批量重置为默认值
   */
  async resetCategory(
    category: string,
    operatorId?: string,
    operatorIp?: string
  ): Promise<string[]> {
    if (!RUNTIME_CONFIG_DEFINITIONS.some((d) => d.category === category)) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.config_extra.unknown_key', { args: { key: category } }) ?? `未知的配置分类: ${category}`
      );
    }

    const keys = RUNTIME_CONFIG_DEFINITIONS.filter(
      (d) => d.category === category
    ).map((d) => d.key);

    for (const key of keys) {
      await this.resetToDefault(key, operatorId, operatorIp);
    }

    return keys;
  }

  /**
   * 获取配置修改历史（来自 runtime_config_logs 表）
   */
  async getHistory(
    key: string,
    limit = 20
  ): Promise<RuntimeConfigHistoryEntry[]> {
    const limitClamped = Math.max(1, Math.min(limit, 100));
    return this.prisma.runtimeConfigLog.findMany({
      where: { key },
      orderBy: { createdAt: 'desc' },
      take: limitClamped,
    });
  }

  /**
   * 解析配置值
   */
  private parseValue(
    value: string,
    type: RuntimeConfigValueType
  ): RuntimeConfigValue {
    try {
      const parsed = JSON.parse(value);
      switch (type) {
        case 'boolean':
          return Boolean(parsed);
        case 'number':
          return Number(parsed);
        case 'json':
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
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
