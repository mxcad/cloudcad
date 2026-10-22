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
  ConfigProfile,
  RuntimeProfilePreviewEntry,
  RuntimeProfileApplyResult,
  ConfigDependencyViolation,
} from './runtime-config.types';
import {
  getDependencyEdges,
  findNewDependencyViolations,
  formatDependencyLabel,
} from './runtime-config.dependency';
import {
  ChannelCryptoService,
  maskChannelSecret,
} from './channel-crypto.service';
import type { IRuntimeConfigService } from '@cloudcad/contracts';

const CACHE_PREFIX = 'runtime_config:';
const CACHE_TTL = 3600; // 1 小时
const TRUTHY_ENV_VALUES = ['true', '1', 'yes', 'on'];
const FALSY_ENV_VALUES = ['false', '0', 'no', 'off'];

/** 依赖边从定义表派生（单一事实源），定义表是静态常量，进程内派生一次即可 */
const DEPENDENCY_EDGES = getDependencyEdges(RUNTIME_CONFIG_DEFINITIONS);

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
    @InjectRedis() private readonly redis: Redis,
    private readonly channelCrypto: ChannelCryptoService
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

    // 依赖一致性检测：揪出门禁上线前遗留的「功能开关开、依赖的通道开关关」
    // 状态并上报（门禁只拦新制造的，存量不一致靠这里暴露给运维）
    this.detectDependencyViolations()
      .then((violations) => {
        if (violations.length > 0) {
          const detail = violations
            .map((v) => `${v.dependent} 依赖 ${v.required} 未开启`)
            .join('；');
          this.logger.warn(
            `检测到开关依赖不一致（门禁上线前遗留，请在运行时配置页处理）: ${detail}`
          );
        }
      })
      .catch((error) => {
        this.logger.error('开关依赖一致性检测失败:', error);
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
      // 秘密键（通道秘密）落库为密文（chan:v1），在此解密回明文供内部消费方使用；
      // env 层与默认层恒为明文，无需解密
      return {
        value: this.decryptIfSecret(def, this.parseValue(row.value, def.type)),
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
   * 秘密键（`input.secret`）的 DB 值以密文落库，读取时解密回明文。
   * 密文前缀判断是双保险：未命中前缀的值（如存量明文行）原样返回，不抛错。
   */
  private decryptIfSecret(
    def: RuntimeConfigDefinition,
    value: RuntimeConfigValue
  ): RuntimeConfigValue {
    if (
      def.input?.secret &&
      typeof value === 'string' &&
      this.channelCrypto.isCiphertext(value)
    ) {
      return this.channelCrypto.decrypt(value);
    }
    return value;
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
    key: string
  ): Promise<T> {
    const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);

    // 秘密键（通道秘密）不进缓存：缓存存的是解密后的明文，把明文凭据放进 Redis
    // 是泄露路径；直查数据库 + 读取时解密（低频读，不值得优化）
    const isSecret = def?.input?.secret === true;

    // 1. 查 Redis 缓存（可选加速层：Redis 不可达时必须降级直查数据库，
    //    否则启动期（如 multer 注册 useFactory）await 此处会因 Redis 故障
    //    直接中断进程，实例：Redis 未启动时 pnpm build 崩溃）
    let cached: string | null = null;
    if (!isSecret) {
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
    }

    // 2. 构建 Swagger 时（GENERATE_SWAGGER=1）启动整棵 AppModule 仅为生成文档，
    //    不需要真实配置值，只需返回可用的 shape。打包/CI 环境通常无可用 PostgreSQL
    //    （记忆 build-redis-unreachable-crash：Redis 降级后此处会继续查库），默认值
    //    与 cache miss + DB miss 后的降级行为一致，跳过 DB 查询避免构建崩溃。
    if (process.env.GENERATE_SWAGGER === '1') {
      return def?.defaultValue as T;
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

    const { value } = this.resolveValue(def, row);
    // 三层解析结果优先：定义表的 defaultValue 是唯一权威默认值，env 层由 envKey 声明。
    // getValue 故意不接受调用方兜底：对已登记键 fallback 恒被忽略（resolveValue 永不
    // 返回 nullish），那些写着却不生效的字面量在 112 个调用点堆成了「假默认值」。
    // 默认值只写定义表；新增配置项请登记 RUNTIME_CONFIG_DEFINITIONS。
    const result = value as T;

    // 4. 写入缓存（写缓存失败不阻塞：下次读会重试）。秘密键跳过（见方法开头注释）
    if (!isSecret) {
      try {
        await this.redis.setex(
          `${CACHE_PREFIX}${key}`,
          CACHE_TTL,
          JSON.stringify(result)
        );
      } catch {
        // 写缓存失败不阻塞
      }
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
    // 秘密键对管理端只回掩码（首尾 2 字符），明文不出 API 边界
    const isSecret = def?.input?.secret === true;

    return {
      key: config.key,
      value: isSecret ? maskChannelSecret(String(value)) : value,
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

    // 秘密键：清空（空值）走「恢复默认」语义——清掉显式修改标记，
    // env 层值重新生效（界面清空 SMTP 口令回落到 .env 的值）
    if (def.input?.secret && value === '') {
      return this.resetToDefault(key, operatorId, operatorIp);
    }

    // 依赖门禁（ADR-0082）：布尔键的开关依赖在写库前强制校验，
    // 拒绝「功能开着、依赖的通道关着」这种静默失效状态被新制造出来
    if (def.type === 'boolean' && typeof value === 'boolean') {
      await this.assertSingleKeyDependencyGate(def, value);
    }

    // 获取旧值用于日志
    const oldConfig = await this.prisma.runtimeConfig.findUnique({
      where: { key },
    });
    const oldValue = oldConfig?.value;

    // 秘密键以密文（chan:v1）落库，历史日志同存密文：明文不落盘
    const storedValue =
      def.input?.secret && typeof value === 'string'
        ? this.channelCrypto.encrypt(value)
        : value;
    const storedValueJson = JSON.stringify(storedValue);

    // 更新数据库
    await this.prisma.runtimeConfig.upsert({
      where: { key },
      update: {
        value: storedValueJson,
        updatedBy: operatorId,
      },
      create: {
        key,
        value: storedValueJson,
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
        newValue: storedValueJson,
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
   * 批量解析一组键的生效值（三层解析），归一为布尔语义（true=开）。
   *
   * 走数据库直查而非 Redis 缓存：门禁是写路径上的安全判定，必须读到最新状态，
   * 缓存的 1 小时 TTL 会让「刚关掉的通道开关」在门禁眼里仍是开的。
   */
  private async resolveEffectiveBooleans(
    keys: string[]
  ): Promise<Record<string, boolean>> {
    const uniqueKeys = [...new Set(keys)];
    const rows =
      (await this.prisma.runtimeConfig.findMany({
        where: { key: { in: uniqueKeys } },
      })) ?? [];
    const rowsByKey = new Map(rows.map((row) => [row.key, row]));
    const result: Record<string, boolean> = {};
    for (const key of uniqueKeys) {
      const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
      const row = rowsByKey.get(key) ?? null;
      result[key] = this.resolveValue(def, row).value === true;
    }
    return result;
  }

  /**
   * 依赖边来源。生产实现从定义表派生（单一事实源）；测试可 spy 本方法注入
   * 合成边集，验证门禁语义而不必改动真实定义表。
   */
  private getDependencyEdges() {
    return DEPENDENCY_EDGES;
  }

  /**
   * 单键更新/重置的依赖门禁（拒绝式，ADR-0082）。
   *
   * 只检查与本次变更相关的边（本键作为依赖方或被依赖方的边），其余边的
   * 前后状态不变、不可能产生新违规。已存在的遗留不一致不拦（重放同一个值
   * 不算「新制造」），由一致性检测负责上报。
   */
  private async assertSingleKeyDependencyGate(
    def: RuntimeConfigDefinition,
    value: boolean
  ): Promise<void> {
    const edges = this.getDependencyEdges().filter(
      (edge) => edge.dependent === def.key || edge.required === def.key
    );
    if (edges.length === 0) {
      return;
    }

    const keys = [
      ...new Set(edges.flatMap((edge) => [edge.dependent, edge.required])),
    ];
    const current = await this.resolveEffectiveBooleans(keys);
    const final = { ...current, [def.key]: value };
    const violations = findNewDependencyViolations(edges, current, final);
    if (violations.length === 0) {
      return;
    }

    const i18n = I18nContext.current();
    if (value === true) {
      // 本键是依赖方：开启它而依赖项未开
      const missing = violations
        .map((v) => v.required)
        .map((key) => formatDependencyLabel(RUNTIME_CONFIG_DEFINITIONS, key));
      throw new BadRequestException(
        i18n?.t('error.config_extra.dependency_not_met', {
          args: {
            key: formatDependencyLabel(RUNTIME_CONFIG_DEFINITIONS, def.key),
            deps: missing.join('、'),
          },
        }) ??
          `无法开启 ${def.key}：依赖项 ${missing.join('、')} 未开启`
      );
    }

    // 本键是被依赖方：关闭它而依赖方仍开着
    const dependents = violations
      .map((v) => v.dependent)
      .map((key) => formatDependencyLabel(RUNTIME_CONFIG_DEFINITIONS, key));
    throw new BadRequestException(
      i18n?.t('error.config_extra.dependency_in_use', {
        args: {
          key: formatDependencyLabel(RUNTIME_CONFIG_DEFINITIONS, def.key),
          dependents: dependents.join('、'),
        },
      }) ??
        `无法关闭 ${def.key}：仍被 ${dependents.join('、')} 依赖`
    );
  }

  /**
   * 检测当前已存在的依赖不一致（门禁上线前遗留的「功能开关开、通道开关关」，
   * 含告警邮件「邮件服务关着、告警照发」的反向偏离）。
   *
   * 与更新路径门禁分工：门禁拦「新制造」的违规，本方法揪「已存在」的违规
   * ——启动时上报日志，管理端经 GET dependency-check 查询后在页面呈现。
   */
  async detectDependencyViolations(): Promise<ConfigDependencyViolation[]> {
    const edges = this.getDependencyEdges();
    if (edges.length === 0) {
      return [];
    }
    const keys = [
      ...new Set(edges.flatMap((edge) => [edge.dependent, edge.required])),
    ];
    const current = await this.resolveEffectiveBooleans(keys);
    return edges.filter(
      (edge) => current[edge.dependent] === true && current[edge.required] !== true
    );
  }

  /**
   * profile 批量应用的依赖门禁（与单键门禁同一套判定，ADR-0082）。
   *
   * 最终态 = 计划内键取目标值、计划外键取当前生效值。只拦「本次应用新制造」的
   * 违规：当前已不一致且本次不动相关键的，不算新制造（遗留状态由一致性检测上报）。
   * 预览与应用共用 buildProfilePlan，因此两端行为一致。
   */
  private async assertProfileDependencyGate(
    target: ConfigProfile,
    entries: {
      def: RuntimeConfigDefinition;
      targetValue: RuntimeConfigValue;
    }[]
  ): Promise<void> {
    const edges = this.getDependencyEdges();
    if (edges.length === 0) {
      return;
    }

    const keys = [
      ...new Set(edges.flatMap((edge) => [edge.dependent, edge.required])),
    ];
    const current = await this.resolveEffectiveBooleans(keys);
    const final = { ...current };
    for (const entry of entries) {
      final[entry.def.key] = entry.targetValue === true;
    }

    const violations = findNewDependencyViolations(edges, current, final);
    if (violations.length === 0) {
      return;
    }

    const detail = violations
      .map(
        (v) =>
          `「${formatDependencyLabel(RUNTIME_CONFIG_DEFINITIONS, v.dependent)}」` +
          `依赖「${formatDependencyLabel(RUNTIME_CONFIG_DEFINITIONS, v.required)}」未开启`
      )
      .join('；');
    throw new BadRequestException(
      I18nContext.current()?.t('error.config_extra.dependency_violation', {
        args: { profile: target, edges: detail },
      }) ?? `无法应用安全模式 ${target}: ${detail}`
    );
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
      // 秘密键永不进公开端点（纵深防御：即使存量行 isPublic 被误置为 true 也不泄露）
      if (def?.input?.secret) {
        continue;
      }
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
      // 秘密键对管理端只回掩码（首尾 2 字符），明文不出 API 边界
      const isSecret = def?.input?.secret === true;
      return {
        key: config.key,
        value: isSecret ? maskChannelSecret(String(value)) : value,
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
    | 'requires'
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
      // 秘密键的 env 层值是明文凭据，同样不出 API 边界
      envValue: def?.input?.secret ? null : envValue ?? null,
      tier: def?.tier ?? 'admin',
      input: def?.input,
      impact: def?.impact,
      dangerous: def?.dangerous ?? false,
      hot: def?.hot ?? true,
      requires: def?.requires,
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

    // 恢复默认同样是「把开关置为默认值」的更新路径，走同一套依赖门禁：
    // 否则「重置通道开关为关」会绕过 set() 的门禁，重新制造静默失效状态
    if (def.type === 'boolean' && typeof def.defaultValue === 'boolean') {
      await this.assertSingleKeyDependencyGate(def, def.defaultValue);
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
   * 参与 profile 批量应用的定义项（声明了 `profiles` 的 key，ADR-0077）。
   * 预览与实际应用都必须走这一个出口取集合，避免两处各写一遍筛选条件而漏项。
   */
  private getProfileDefinitions(): RuntimeConfigDefinition[] {
    return RUNTIME_CONFIG_DEFINITIONS.filter((d) => d.profiles != null);
  }

  /**
   * 校验 profile 名称。未知名称必须在写入前抛出——静默回退成某个模式
   * 会让操作者以为切换成功了。
   */
  private assertProfile(profile: string): ConfigProfile {
    if (profile !== 'secure' && profile !== 'normal') {
      throw new BadRequestException(
        I18nContext.current()?.t('error.config_extra.unknown_profile', {
          args: { profile },
        }) ?? `未知的安全模式: ${profile}`
      );
    }
    return profile;
  }

  /**
   * 预览某 profile 的应用结果（只读，不写库）。
   *
   * `willChange` 与实际应用的 `applied` 必须完全一致——这是本机制最主要的失效方式
   * （运维按预览的「将改动项」做过决策，点应用后行为却不同）。为此预览与应用共用
   * `buildProfilePlan`，而不是各自实现一份判定。
   */
  async previewProfileApply(
    profile: string
  ): Promise<RuntimeProfilePreviewEntry[]> {
    const target = this.assertProfile(profile);
    const plan = await this.buildProfilePlan(target);

    return plan.entries.map((entry) => {
      const def = entry.def;
      const row = entry.row;
      const { value: currentValue, source } = this.resolveValue(def, row);
      return {
        key: def.key,
        type: def.type,
        category: def.category,
        currentValue,
        source,
        targetValue: entry.targetValue,
        willChange: entry.willChange,
        isModified: row?.updatedBy != null,
        envValue: this.resolveEnvLayer(def) ?? null,
      };
    });
  }

  /**
   * 应用某 profile：把声明了 `profiles` 的 key 批量写到目标值，覆盖用户已手工修改的
   * 值（ADR-0077 D5）。
   *
   * 实现为「写入 `value` 并记 `updatedBy`」而非写 `source:'profile'` 一类新字段——
   * 69 个 key 零 schema 改动。回退路径因此也现成：逐个 `resetToDefault` 即清 `updatedBy`。
   *
   * 事务边界：值写入与审计写入同在一个交互事务里，任一项失败全部回滚。缓存失效在
   * 事务**外**——它是尽力而为的加速手段，其失败不应让已经提交的 DB 写入回滚。
   *
   * `operatorId` 必填（不可缺省）：写空会让 `resolveValue` 把该行当成安装默认行，
   * env 层重新压上来，profile 静默不生效——这是本方法最容易踩的坑。
   */
  async applyProfile(
    profile: string,
    operatorId: string,
    operatorIp?: string
  ): Promise<RuntimeProfileApplyResult> {
    const target = this.assertProfile(profile);

    if (!operatorId) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.config_extra.missing_operator') ??
          '缺少操作者标识，无法记录修改来源'
      );
    }

    const plan = await this.buildProfilePlan(target);
    const toWrite = plan.entries.filter((entry) => entry.willChange);

    if (toWrite.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const entry of toWrite) {
          const { def, row, targetValue } = entry;
          const newValueJson = JSON.stringify(targetValue);

          if (row) {
            await tx.runtimeConfig.update({
              where: { key: def.key },
              data: { value: newValueJson, updatedBy: operatorId },
            });
          } else {
            await tx.runtimeConfig.create({
              data: {
                key: def.key,
                value: newValueJson,
                type: def.type,
                category: def.category,
                description: def.description,
                isPublic: def.isPublic,
                updatedBy: operatorId,
              },
            });
          }

          await tx.runtimeConfigLog.create({
            data: {
              key: def.key,
              oldValue: row?.value ?? null,
              newValue: newValueJson,
              operatorId,
              operatorIp,
            },
          });
        }
      });
    }

    // 全量失效：即使本次无写入，也要清掉「标记项已变化」场景下读到的旧聚合缓存
    await this.invalidateCacheKeys(plan.defs.map((def) => def.key));

    return {
      profile: target,
      applied: toWrite.map((entry) => entry.def.key),
      unchanged: plan.entries
        .filter((entry) => !entry.willChange)
        .map((entry) => entry.def.key),
    };
  }

  /**
   * 构建一次 profile 应用的计划：当前值、目标值、是否会改写。
   *
   * 预览（`previewProfileApply`）与实际应用（`applyProfile`）共用本方法，保证两端的
   * 「当前生效值」与「目标值」来自同一时刻的同一份判定——否则运维看到的是预览、
   * 实际写入的却是另一套结论。
   *
   * 判定基准是**生效值**（含 env 遮蔽），不是数据库行的原始值：运维关心的是「应用后
   * 实际生效的是什么」，且已等于目标值的项无需写库——写入反而会永久冻掉该 key 的
   * env 层定制。这类 env 遮蔽项通过预览条目的 `envValue` 字段显式暴露，由 UI 告警。
   */
  private async buildProfilePlan(
    target: ConfigProfile
  ): Promise<{
    defs: RuntimeConfigDefinition[];
    entries: {
      def: RuntimeConfigDefinition;
      row: { value: string; type: string; updatedBy: string | null } | null;
      targetValue: RuntimeConfigValue;
      willChange: boolean;
    }[];
  }> {
    const defs = this.getProfileDefinitions();
    if (defs.length === 0) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.config_extra.empty_profile') ??
          '当前没有任何配置项声明了安全模式取值，无法应用 profile'
      );
    }

    const rows = await this.prisma.runtimeConfig.findMany({
      where: { key: { in: defs.map((def) => def.key) } },
    });
    const rowsByKey = new Map(rows.map((row) => [row.key, row]));

    // profile 目标值是代码里声明的常量，不走 set() 的入参校验——越界值会被静默写库，
    // 然后业务代码按一个不在 input.min/max 内的配置运行。这里复用 set() 的同一套
    // validateValue 提前拦下，失败在写库之前。
    const invalidTargets = defs
      .map((def) => {
        const reason = this.validateValue(def, def.profiles![target]);
        return reason === null ? null : { key: def.key, reason };
      })
      .filter((entry): entry is { key: string; reason: string } => entry !== null);
    if (invalidTargets.length > 0) {
      const detail = invalidTargets.map((e) => `${e.key}（${e.reason}）`).join('；');
      throw new BadRequestException(
        I18nContext.current()?.t('error.config_extra.invalid_profile_target', {
          args: { keys: detail },
        }) ?? `profile 目标值无效: ${detail}`
      );
    }

    const entries = defs.map((def) => {
      const row = rowsByKey.get(def.key) ?? null;
      const { value: currentValue } = this.resolveValue(def, row);
      const targetValue = def.profiles![target];
      return {
        def,
        row,
        targetValue,
        willChange: JSON.stringify(currentValue) !== JSON.stringify(targetValue),
      };
    });

    // 依赖门禁（ADR-0082）：批量应用不得新制造「功能开关开、依赖的通道开关关」
    // 的不一致状态。预览与应用共用本方法，两端行为一致。
    await this.assertProfileDependencyGate(target, entries);

    return { defs, entries };
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
