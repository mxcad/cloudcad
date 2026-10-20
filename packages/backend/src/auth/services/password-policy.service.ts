import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { weakPasswords as weakPasswordsList } from '../data/weak-passwords';

/**
 * 口令到期判定结果（#416 等保 8.1.4.1 b) 定期更换）
 *
 * - required: 'first_login'=首登未改密（passwordChangedAt=null，仅初始管理员）；
 *   'expired'=超过强制更换周期到期；undefined=无需强改。
 * - expiringSoon: 距到期 ≤ 软提示天数（软提示，不拦截）。
 */
export interface PasswordChangeStatus {
  required: 'first_login' | 'expired' | undefined;
  expiringSoon: boolean;
}

/**
 * 口令策略服务（#416 等保 8.1.4.1 a)/b)）
 *
 * 复杂度断言：新设口令满足长度下限 + 类别构成下限（小写/大写/数字/特殊字符四类）
 * + 内置弱口令黑名单（可关）。仅约束设置口令入口（注册/改密/重置/管理员创建），
 * 存量用户口令不追溯校验。
 *
 * 全部策略参数从运行时配置**每次调用时读取**（经 Redis 缓存，写时失效），改完即生效：
 * passwordPolicyMinLength / passwordPolicyMinCategories / passwordPolicyWeakCheckEnabled /
 * passwordPolicyChangeIntervalDays / passwordPolicyExpiringSoonDays /
 * passwordPolicyChangeEnforceEnabled。原先在构造期一次性快照 env、改不了不重启；
 * 现在与 account-rate-limit.service 的 getConfig()/getLockConfig() 同一模式。
 * 取值下限放宽到 0（security-mode T17-A）：normal 模式允许把类别要求关到 0 类、
 * 黑名单关掉、更换周期设为 0 天永不强制——严格度由 profile 目标值承载，不由校验器硬拦。
 *
 * 弱口令黑名单以静态数组（./data/weak-passwords.ts）随包分发，大小写不敏感匹配，
 * 清单本身不配置化（属代码资产，逐条开关无意义）；只保留一个总开关。
 *
 * 定期更换判定（getPasswordChangeStatus）：仅 ADMIN 角色生效——
 * 到期强制改密 + 首登未改密（passwordChangedAt=null）+ 提前 N 天软提示。
 * 普通用户不做周期判定（体验优先，等保重点考核管理员）。
 */
@Injectable()
export class PasswordPolicyService {
  private readonly weakPasswords: ReadonlySet<string>;

  constructor(private readonly runtimeConfig: RuntimeConfigService) {
    this.weakPasswords = new Set(
      weakPasswordsList.map((p) => p.toLowerCase())
    );
  }

  /**
   * 断言口令符合策略，失败抛 BadRequestException（四语言 i18n 文案）。
   * 通过则返回 void，调用方继续后续流程。
   */
  async assertPasswordPolicy(password: string): Promise<void> {
    const minLength = await this.runtimeConfig.getValue<number>(
      'passwordPolicyMinLength',
      10,
    );
    const minCategories = await this.runtimeConfig.getValue<number>(
      'passwordPolicyMinCategories',
      3,
    );
    const weakCheckEnabled = await this.runtimeConfig.getValue<boolean>(
      'passwordPolicyWeakCheckEnabled',
      true,
    );

    if (!password || password.length < minLength) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.password_policy.too_short', {
          args: { min: minLength },
        }) ?? `密码长度至少 ${minLength} 位`,
      );
    }

    // 弱口令黑名单（大小写不敏感），可用开关关闭
    if (weakCheckEnabled && this.weakPasswords.has(password.toLowerCase())) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.password_policy.weak') ??
          '密码过于简单，请更换为更复杂的密码',
      );
    }

    // 类别构成：小写/大写/数字/特殊字符四类计数，下限可配（0 = 不要求）
    const categories = [
      /[a-z]/.test(password),
      /[A-Z]/.test(password),
      /\d/.test(password),
      /[^a-zA-Z0-9]/.test(password),
    ].filter(Boolean).length;

    if (categories < minCategories) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.password_policy.complexity', {
          args: { min: minCategories },
        }) ??
          `密码需包含大小写字母、数字、特殊字符中至少 ${minCategories} 类`,
      );
    }
  }

  /**
   * 判定口令到期状态（#416 等保 8.1.4.1 b) 定期更换，仅 ADMIN 角色调用）。
   *
   * 受 passwordPolicyChangeEnforceEnabled 总开关控制（默认关闭）：关闭时恒返回
   * 「无需强改」——登录不下发 passwordChangeRequired、JWT 不做改密锁定
   * （上游 jwt.strategy / admin-auth 自动生效）。
   * 开启时：
   * - `passwordChangedAt === null` → required='first_login'（首登未改密，仅初始管理员）。
   * - `now - passwordChangedAt > 更换周期` → required='expired'（到期强制改密）。
   * - `now - passwordChangedAt > 更换周期 - 软提示天数` → expiringSoon=true。
   * - 否则无需强改（required=undefined, expiringSoon=false）。
   *
   * 更换周期为 0（永不强制）时不做 expired / expiringSoon 判定，但仍判定首登未改密。
   */
  async getPasswordChangeStatus(
    passwordChangedAt: Date | null,
  ): Promise<PasswordChangeStatus> {
    const changeEnforceEnabled = await this.runtimeConfig.getValue<boolean>(
      'passwordPolicyChangeEnforceEnabled',
      false,
    );
    // 总开关关闭（默认）：恒返回「无需强改」
    if (!changeEnforceEnabled) {
      return { required: undefined, expiringSoon: false };
    }

    const intervalDays = await this.runtimeConfig.getValue<number>(
      'passwordPolicyChangeIntervalDays',
      180,
    );
    const expiringSoonDays = await this.runtimeConfig.getValue<number>(
      'passwordPolicyExpiringSoonDays',
      14,
    );

    if (passwordChangedAt === null) {
      // 首登未改密（初始管理员）：强制改密
      return { required: 'first_login', expiringSoon: false };
    }

    const ageMs = Date.now() - new Date(passwordChangedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (intervalDays > 0 && ageDays > intervalDays) {
      return { required: 'expired', expiringSoon: false };
    }

    if (intervalDays > 0 && ageDays > intervalDays - expiringSoonDays) {
      return { required: undefined, expiringSoon: true };
    }

    return { required: undefined, expiringSoon: false };
  }
}
