import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { I18nContext } from 'nestjs-i18n';
import { QuotaExceededException } from './errors/quota-exceeded.error';
import { VipFeatureRequiredException } from './errors/vip-feature-required.error';
import {
  RESTRICTION_STRATEGY,
  type RestrictionContext,
  type RestrictionStrategy,
} from './interfaces/restriction-strategy.interface';
import { MembershipService } from './membership.service';
import { QUOTA_KEYS } from './quota-keys';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import type { IConversionAccessGuard } from '../common/interfaces/conversion-access-guard';

/** 游客转换频率限制（运行时配置键，ADR-0043） */
export const GUEST_WINDOW_HOURS_KEY = 'conversionGuestWindowHours';
export const GUEST_LIMIT_KEY = 'conversionGuestLimit';

/** 免费用户（含游客）导出下载转换开关（运行时配置键） */
export const EXPORT_DOWNLOAD_FREE_KEY = 'freeExportDownloadEnabled';

const DEFAULT_WINDOW_HOURS = 2;
const REDIS_TTL_PADDING = 300;

/**
 * 每 N 小时固定窗口的 Redis 键。
 * 窗口槽位 = 时间戳 / (hours*3600*1000)，窗口小时数变化后槽位自然迁移，旧键 TTL 过期自动清理。
 */
const conversionWindowKey = (
  scope: 'user' | 'ip',
  id: string,
  hours: number,
  nowMs = Date.now()
): string => {
  const slot = Math.floor(nowMs / (hours * 3600 * 1000));
  return `conversion:window:${scope}:${id}:${slot}`;
};

/**
 * 当前窗口转换配额只读状态（ADR-0043）。
 * limit 为配置上限（<= 0 表示不限额）；used 为本窗口已占位次数。
 */
export interface ConversionQuotaState {
  /** 窗口归属：ip（游客）或 user（登录用户） */
  scope: 'ip' | 'user';
  limit: number;
  used: number;
  windowHours: number;
  /** 当前窗口重置时刻（窗口起点 + windowHours） */
  resetsAt: Date;
}

/** 转 bin（覆盖保存）频率窗口 Redis 键：与转换窗口独立前缀，避免混用计数 */
const saveWindowKey = (
  scope: 'user' | 'ip',
  id: string,
  hours: number
): string => {
  const slot = Math.floor(Date.now() / (hours * 3600 * 1000));
  return `save:window:${scope}:${id}:${slot}`;
};

/** 历史版本查看（bin→mxweb 转换）频率窗口 Redis 键：独立前缀，避免混用计数 */
const historyWindowKey = (
  scope: 'user' | 'ip',
  id: string,
  hours: number
): string => {
  const slot = Math.floor(Date.now() / (hours * 3600 * 1000));
  return `history:window:${scope}:${id}:${slot}`;
};

export interface BuildContextOptions {
  projectId?: string;
  incrementBytes?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class RestrictionEngine implements IConversionAccessGuard {
  private readonly logger = new Logger(RestrictionEngine.name);

  constructor(
    @Inject(RESTRICTION_STRATEGY) private strategies: RestrictionStrategy[],
    @InjectRedis() private readonly redis: Redis,
    private membershipService: MembershipService,
    private readonly runtimeConfigService: RuntimeConfigService
  ) {}

  async evaluate(
    ctx: RestrictionContext,
    strategyKeys?: string[]
  ): Promise<void> {
    const strategiesToRun = strategyKeys
      ? this.strategies.filter((s) => strategyKeys.includes(s.key))
      : this.strategies;

    for (const strategy of strategiesToRun) {
      const result = await strategy.check(ctx);
      if (!result.allowed) {
        this.logger.warn(
          `Restriction denied: key=${result.key}, userId=${ctx.userId}, messageKey=${result.messageKey ?? result.message}`
        );
        let message: string | undefined = result.message;
        if (result.messageKey) {
          message =
            I18nContext.current()?.t(result.messageKey, {
              args: result.messageArgs,
            }) ?? result.message;
        }
        message = message ?? `Access denied: ${result.key}`;
        throw new QuotaExceededException(message, {
          restrictionKey: result.key,
          current: result.current,
          limit: result.limit,
          configLimit: result.configLimit,
          need: result.need,
        });
      }
    }
  }

  async buildContext(
    userId: string,
    options?: BuildContextOptions
  ): Promise<RestrictionContext> {
    const { tierLevel, configs } =
      await this.membershipService.getEffectiveMembership(userId);

    return {
      userId,
      projectId: options?.projectId,
      incrementBytes: options?.incrementBytes,
      tierLevel,
      tierConfig: configs,
      metadata: options?.metadata,
    };
  }

  async checkQuota(
    userId: string,
    options?: BuildContextOptions & { strategyKeys?: string[] }
  ): Promise<void> {
    const ctx = await this.buildContext(userId, options);
    await this.evaluate(ctx, options?.strategyKeys);
  }

  /**
   * 原子化"检查并占位"每窗口转换次数：通过 Lua 脚本在同一 Redis 事务中判断并 INCR，
   * 消除 checkQuota 与 incrementConversionCount 之间并发穿透超限的 TOCTOU 竞态。
   * @returns 是否成功占位（未超限）
   */
  async tryReserveConversionCount(userId: string): Promise<boolean> {
    const dailyLimit = await this.getConversionWindowLimit(userId);
    if (dailyLimit <= 0) return true;
    const windowHours = await this.getConversionWindowHours(userId);

    const key = conversionWindowKey('user', userId, windowHours);
    return this.reserveByLua(key, dailyLimit, windowHours);
  }

  /**
   * 游客（按 IP）窗口转换次数占位，限制值来自运行时配置。
   * 超限时打印含 IP 的日志（便于定位游客转换频率限制的来源）。
   * @returns 是否成功占位（未超限）
   */
  async tryReserveGuestConversionCount(ip: string): Promise<boolean> {
    const limit = await this.getGuestConversionLimit();
    if (limit <= 0) return true;
    const windowHours = await this.getGuestWindowHours();

    const key = conversionWindowKey('ip', ip, windowHours);
    const reserved = await this.reserveByLua(key, limit, windowHours);
    if (!reserved) {
      const current = await this.redis.get(key).catch(() => null);
      this.logger.warn(
        `[GuestConversionLimit] 游客 IP 转换频率限制触发: ip=${ip}, limit=${limit}, windowHours=${windowHours}, current=${current ?? 'unknown'}`
      );
    }
    return reserved;
  }

  private async reserveByLua(
    key: string,
    limit: number,
    windowHours: number
  ): Promise<boolean> {
    const ttl = windowHours * 3600 + REDIS_TTL_PADDING;
    const script = `
      local current = tonumber(redis.call('GET', KEYS[1]) or '0')
      if current >= tonumber(ARGV[1]) then
        return 0
      end
      redis.call('INCR', KEYS[1])
      redis.call('EXPIRE', KEYS[1], ARGV[2])
      return 1
    `;
    const reserved = await this.redis.eval(
      script,
      1,
      key,
      String(limit),
      String(ttl)
    );
    return reserved === 1;
  }

  /**
   * 原子预留每窗口转换次数，失败时抛 QuotaExceededException（带正确窗口/次数文案）。
   * 统一各调用点错误处理，避免重复抛错块与 i18n 占位符误用。
   */
  async reserveConversionCountOrThrow(userId: string): Promise<void> {
    const reserved = await this.tryReserveConversionCount(userId);
    if (reserved) return;
    const limit = await this.getConversionWindowLimit(userId);
    const windowHours = await this.getConversionWindowHours(userId);
    this.throwFrequencyExceeded(limit, windowHours);
  }

  /**
   * 游客（按 IP）原子预留每窗口转换次数，失败抛 QuotaExceededException。
   */
  async reserveGuestConversionCountOrThrow(ip: string): Promise<void> {
    const reserved = await this.tryReserveGuestConversionCount(ip);
    if (reserved) return;
    const limit = await this.getGuestConversionLimit();
    const windowHours = await this.getGuestWindowHours();
    this.throwFrequencyExceeded(limit, windowHours);
  }

  /**
   * 读取当前窗口的转换配额只读状态（ADR-0043，只查不占位）。
   * 登录用户按 userId 窗口（限制值来自 VIP tier 配置），游客按 IP 窗口
   * （限制值来自运行时配置 conversionGuestLimit / conversionGuestWindowHours）。
   * limit <= 0 表示不限额（Redis 中通常无计数键，used 为 0）。
   */
  async getConversionQuotaState(
    userId?: string,
    ip?: string
  ): Promise<ConversionQuotaState> {
    if (userId) {
      const limit = await this.getConversionWindowLimit(userId);
      const windowHours = await this.getConversionWindowHours(userId);
      return this.readConversionWindowState('user', userId, limit, windowHours);
    }
    return this.readConversionWindowState(
      'ip',
      ip ?? 'unknown',
      await this.getGuestConversionLimit(),
      await this.getGuestWindowHours()
    );
  }

  /**
   * 读单个窗口的已用次数 + 窗口重置时刻（user/ip 共用）。
   * key 与窗口起点同用 nowMs 计算，避免临界时刻槽位错位。
   */
  private async readConversionWindowState(
    scope: 'user' | 'ip',
    id: string,
    limit: number,
    windowHours: number
  ): Promise<ConversionQuotaState> {
    const nowMs = Date.now();
    const slotMs = windowHours * 3600 * 1000;
    const raw = await this.redis
      .get(conversionWindowKey(scope, id, windowHours, nowMs))
      .catch(() => null);
    return {
      scope,
      limit,
      used: raw === null ? 0 : Math.max(0, Number(raw) || 0),
      windowHours,
      resetsAt: new Date(Math.floor(nowMs / slotMs) * slotMs + slotMs),
    };
  }

  /**
   * 转 bin（覆盖保存）频率占位：所有用户（VIP0 与 VIP 统一）限频，次数配额独立
   * （quota.save_window_count），窗口小时数复用转换窗口（quota.conversion_window_hours）。
   * @returns 是否成功占位（未超限）；limit <= 0 视为不限次
   */
  async tryReserveSaveCount(userId: string): Promise<boolean> {
    const limit = await this.membershipService.getQuota(
      userId,
      QUOTA_KEYS.SAVE_WINDOW_COUNT
    );
    if (limit <= 0) return true;
    const windowHours = await this.getConversionWindowHours(userId);

    const key = saveWindowKey('user', userId, windowHours);
    return this.reserveByLua(key, limit, windowHours);
  }

  /**
   * 转 bin（覆盖保存）频率占位，失败时抛 QuotaExceededException（带正确窗口/次数文案）。
   * 保存调用点需在真正写盘/转 bin 之前调用；保存失败时调用 releaseSaveCount 回补额度。
   */
  async reserveSaveCountOrThrow(userId: string): Promise<void> {
    const reserved = await this.tryReserveSaveCount(userId);
    if (reserved) return;
    const limit = await this.membershipService.getQuota(
      userId,
      QUOTA_KEYS.SAVE_WINDOW_COUNT
    );
    const windowHours = await this.getConversionWindowHours(userId);
    this.throwSaveFrequencyExceeded(limit, windowHours);
  }

  /**
   * 释放被占位的保存次数（保存失败时调用，避免失败任务耗尽窗口额度）。
   * 与 releaseConversionCount 同语义：先 GET 再 DECR，窗口迁移时跳过避免污染计数。
   */
  async releaseSaveCount(userId: string): Promise<void> {
    const windowHours = await this.getConversionWindowHours(userId);
    const key = saveWindowKey('user', userId, windowHours);
    const current = await this.redis.get(key);
    if (current !== null && Number(current) > 0) {
      await this.redis.decr(key);
    }
  }

  /**
   * 历史版本查看（bin→mxweb 转换）频率占位：所有用户（VIP0 与 VIP 统一）限频，
   * 次数配额独立（quota.history_window_count），窗口小时数复用转换窗口
   * （quota.conversion_window_hours）。
   * 仅在真正执行 bin→mxweb 转换时调用（缓存命中直接返回不占位）。
   * @returns 是否成功占位（未超限）；limit <= 0 视为不限次
   */
  async tryReserveHistoryCount(userId: string): Promise<boolean> {
    const limit = await this.membershipService.getQuota(
      userId,
      QUOTA_KEYS.HISTORY_WINDOW_COUNT
    );
    if (limit <= 0) return true;
    const windowHours = await this.getConversionWindowHours(userId);

    const key = historyWindowKey('user', userId, windowHours);
    return this.reserveByLua(key, limit, windowHours);
  }

  /**
   * 历史版本查看（bin→mxweb 转换）频率占位，失败时抛 QuotaExceededException（带正确窗口/次数文案）。
   * 调用点需在真正执行 bin→mxweb 转换之前调用（缓存命中不占位）；转换失败时调用
   * releaseHistoryCount 回补额度。
   */
  async reserveHistoryCountOrThrow(userId: string): Promise<void> {
    const reserved = await this.tryReserveHistoryCount(userId);
    if (reserved) return;
    const limit = await this.membershipService.getQuota(
      userId,
      QUOTA_KEYS.HISTORY_WINDOW_COUNT
    );
    const windowHours = await this.getConversionWindowHours(userId);
    this.throwHistoryFrequencyExceeded(limit, windowHours);
  }

  /**
   * 释放被占位的历史版本查看次数（转换失败时调用，避免失败任务耗尽窗口额度）。
   * 与 releaseSaveCount 同语义：先 GET 再 DECR，窗口迁移时跳过避免污染计数。
   */
  async releaseHistoryCount(userId: string): Promise<void> {
    const windowHours = await this.getConversionWindowHours(userId);
    const key = historyWindowKey('user', userId, windowHours);
    const current = await this.redis.get(key);
    if (current !== null && Number(current) > 0) {
      await this.redis.decr(key);
    }
  }

  private throwHistoryFrequencyExceeded(
    limit: number,
    windowHours: number
  ): never {
    const message =
      I18nContext.current()?.t('error.quota.history_frequency_exceeded', {
        args: { hours: windowHours, count: limit },
      }) ?? '历史版本查看过于频繁，请稍后再试';
    throw new QuotaExceededException(message, {
      restrictionKey: QUOTA_KEYS.HISTORY_WINDOW_COUNT,
      limit,
      configLimit: limit,
      metadata: { hours: windowHours },
    });
  }

  private throwSaveFrequencyExceeded(
    limit: number,
    windowHours: number
  ): never {
    const message =
      I18nContext.current()?.t('error.quota.save_frequency_exceeded', {
        args: { hours: windowHours, count: limit },
      }) ?? '图纸保存过于频繁，请稍后再试';
    throw new QuotaExceededException(message, {
      restrictionKey: QUOTA_KEYS.SAVE_WINDOW_COUNT,
      limit,
      configLimit: limit,
      metadata: { hours: windowHours },
    });
  }

  private throwFrequencyExceeded(limit: number, windowHours: number): never {
    const message =
      I18nContext.current()?.t('error.quota.conversion_frequency_exceeded', {
        args: { hours: windowHours, count: limit },
      }) ?? '图纸转换过于频繁，请稍后再试';
    throw new QuotaExceededException(message, {
      restrictionKey: QUOTA_KEYS.CONVERSION_WINDOW_COUNT,
      limit,
      configLimit: limit,
      metadata: { hours: windowHours },
    });
  }

  private async getConversionWindowLimit(userId: string): Promise<number> {
    return this.membershipService.getQuota(
      userId,
      QUOTA_KEYS.CONVERSION_WINDOW_COUNT
    );
  }

  private async getConversionWindowHours(userId: string): Promise<number> {
    const hours = await this.membershipService.getQuota(
      userId,
      QUOTA_KEYS.CONVERSION_WINDOW_HOURS
    );
    return hours > 0 ? hours : DEFAULT_WINDOW_HOURS;
  }

  private async getGuestConversionLimit(): Promise<number> {
    return this.runtimeConfigService.getValue<number>(GUEST_LIMIT_KEY, 5);
  }

  private async getGuestWindowHours(): Promise<number> {
    const hours = await this.runtimeConfigService.getValue<number>(
      GUEST_WINDOW_HOURS_KEY,
      DEFAULT_WINDOW_HOURS
    );
    return hours > 0 ? hours : DEFAULT_WINDOW_HOURS;
  }

  /**
   * 导出下载方向（mxweb → 其他格式）会员门控。
   *
   * 规则：VIP（tierLevel > 0）始终放行；非 VIP（含游客）仅在运行时开关
   * freeExportDownloadEnabled 打开后放行，否则抛 VipFeatureRequiredException（403），
   * 前端据此弹购买会员引导。
   *
   * 触发位置：FileConversionService.convertFile 执行转换前（调用点在占位之后调用转换，
   * 被拒请求由调用点失败释放路径回补窗口额度，等效不消耗次数）。
   */
  async assertExportDownloadAllowed(userId?: string): Promise<void> {
    if (userId) {
      const { tierLevel } =
        await this.membershipService.getEffectiveMembership(userId);
      if (tierLevel > 0) return;
    }
    const enabled = await this.runtimeConfigService.getValue<boolean>(
      EXPORT_DOWNLOAD_FREE_KEY,
      false
    );
    if (enabled) return;
    const message =
      I18nContext.current()?.t('error.quota.export_download_vip_only') ??
      '导出下载为会员专属功能，开通 VIP 后即可使用';
    throw new VipFeatureRequiredException(message, 'export_download');
  }

  /**
   * 释放被占位的转换次数（转换失败时调用，避免失败任务耗尽窗口额度）。
   * 先 GET 再 DECR：窗口配置（hours）变更导致槽位迁移时，旧 key 已不存在，
   * 跳过 DECR 避免在 Redis 创建 -1 污染计数；旧占位随 TTL 自然过期。
   */
  async releaseConversionCount(userId: string): Promise<void> {
    const windowHours = await this.getConversionWindowHours(userId);
    const key = conversionWindowKey('user', userId, windowHours);
    const current = await this.redis.get(key);
    if (current !== null && Number(current) > 0) {
      await this.redis.decr(key);
    }
  }

  /**
   * 释放游客（按 IP）被占位的转换次数
   */
  async releaseGuestConversionCount(ip: string): Promise<void> {
    const windowHours = await this.getGuestWindowHours();
    const key = conversionWindowKey('ip', ip, windowHours);
    const current = await this.redis.get(key);
    if (current !== null && Number(current) > 0) {
      await this.redis.decr(key);
    }
  }
}
