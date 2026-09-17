import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig, PasswordPolicyConfig } from '../../config/app.config';
import { weakPasswords as weakPasswordsList } from '../data/weak-passwords';

/**
 * 口令到期判定结果（#416 等保 8.1.4.1 b) 定期更换）
 *
 * - required: 'first_login'=首登未改密（passwordChangedAt=null，仅初始管理员）；
 *   'expired'=超过 maxAgeDays 到期；undefined=无需强改。
 * - expiringSoon: 距到期 ≤ expiringSoonDays 天（软提示，不拦截）。
 */
export interface PasswordChangeStatus {
  required: 'first_login' | 'expired' | undefined;
  expiringSoon: boolean;
}

/**
 * 口令策略服务（#416 等保 8.1.4.1 a)/b)）
 *
 * 复杂度断言：新设口令 ≥10 位 + 大小写/数字/特殊字符四类至少三类 + 内置弱口令黑名单。
 * 仅约束设置口令入口（注册/改密/重置/管理员创建），存量用户口令不追溯校验，不做口令历史。
 *
 * 弱口令黑名单以静态 JSON（./data/weak-passwords.json）随包分发，大小写不敏感匹配。
 * 复杂度参数从配置读取（passwordPolicy.minLength，默认 10，env PASSWORD_POLICY_MIN_LENGTH 覆盖）。
 *
 * 定期更换判定（getPasswordChangeStatus）：仅 ADMIN 角色生效——
 * 180 天到期强制改密 + 首登未改密（passwordChangedAt=null）+ 提前 14 天软提示。
 * 普通用户不做 180 天判定（体验优先，等保重点考核管理员）。
 */
@Injectable()
export class PasswordPolicyService {
  private readonly logger = new Logger(PasswordPolicyService.name);
  private readonly minLength: number;
  private readonly maxAgeDays: number;
  private readonly expiringSoonDays: number;
  private readonly changeEnforceEnabled: boolean;
  private readonly weakPasswords: ReadonlySet<string>;

  constructor(configService: ConfigService<AppConfig>) {
    const policy =
      configService.get<PasswordPolicyConfig>('passwordPolicy', {
        infer: true,
      }) ?? {};
    this.minLength = policy.minLength ?? 10;
    this.maxAgeDays = policy.maxAgeDays ?? 180;
    this.expiringSoonDays = policy.expiringSoonDays ?? 14;
    // 定期更换 / 首登未改密「强制改密」总开关，默认关闭（false）
    this.changeEnforceEnabled = policy.changeEnforceEnabled ?? false;
    this.weakPasswords = new Set(
      weakPasswordsList.map((p) => p.toLowerCase())
    );
    this.logger.log(
      `口令策略初始化: minLength=${this.minLength}, maxAgeDays=${this.maxAgeDays}, expiringSoonDays=${this.expiringSoonDays}, changeEnforceEnabled=${this.changeEnforceEnabled}, 弱口令黑名单=${this.weakPasswords.size} 条`
    );
  }

  /**
   * 断言口令符合策略，失败抛 BadRequestException（四语言 i18n 文案）。
   * 通过则返回 void，调用方继续后续流程。
   */
  assertPasswordPolicy(password: string): void {
    if (!password || password.length < this.minLength) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.password_policy.too_short', {
          args: { min: this.minLength },
        }) ?? `密码长度至少 ${this.minLength} 位`
      );
    }

    // 弱口令黑名单（大小写不敏感）
    if (this.weakPasswords.has(password.toLowerCase())) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.password_policy.weak') ??
          '密码过于简单，请更换为更复杂的密码'
      );
    }

    // 复杂度：小写/大写/数字/特殊字符四类至少三类
    const categories = [
      /[a-z]/.test(password),
      /[A-Z]/.test(password),
      /\d/.test(password),
      /[^a-zA-Z0-9]/.test(password),
    ].filter(Boolean).length;

    if (categories < 3) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.password_policy.complexity') ??
          '密码需包含大小写字母、数字、特殊字符中至少三类'
      );
    }
  }

  /**
   * 判定口令到期状态（#416 等保 8.1.4.1 b) 定期更换，仅 ADMIN 角色调用）。
   *
   * 受 changeEnforceEnabled 总开关控制（默认关闭）：关闭时恒返回「无需强改」。
   * 开启时：
   * - `passwordChangedAt === null` → required='first_login'（首登未改密，仅初始管理员）。
   * - `now - passwordChangedAt > maxAgeDays` → required='expired'（到期强制改密）。
   * - `now - passwordChangedAt > maxAgeDays - expiringSoonDays` → expiringSoon=true（软提示）。
   * - 否则无需强改（required=undefined, expiringSoon=false）。
   */
  getPasswordChangeStatus(
    passwordChangedAt: Date | null
  ): PasswordChangeStatus {
    // 总开关关闭（默认）：恒返回「无需强改」——登录不下发 passwordChangeRequired、
    // JWT 不做改密锁定（上游 jwt.strategy / admin-auth 自动生效）
    if (!this.changeEnforceEnabled) {
      return { required: undefined, expiringSoon: false };
    }

    if (passwordChangedAt === null) {
      // 首登未改密（初始管理员）：强制改密
      return { required: 'first_login', expiringSoon: false };
    }

    const ageMs = Date.now() - new Date(passwordChangedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays > this.maxAgeDays) {
      return { required: 'expired', expiringSoon: false };
    }

    if (ageDays > this.maxAgeDays - this.expiringSoonDays) {
      return { required: undefined, expiringSoon: true };
    }

    return { required: undefined, expiringSoon: false };
  }
}
