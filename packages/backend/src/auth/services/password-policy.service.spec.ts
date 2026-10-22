import { BadRequestException } from '@nestjs/common';
import { PasswordPolicyService } from './password-policy.service';
import { RUNTIME_CONFIG_DEFINITIONS } from '../../runtime-config/runtime-config.constants';

/**
 * 策略参数默认值（与 runtime-config.constants.ts 的 defaultValue 一致，secure 基线）：
 * minLength=10 / minCategories=3 / weakCheck=true / changeEnforce=true /
 * changeIntervalDays=180 / expiringSoonDays=14
 *
 * 弱口令黑名单 143 条，'12345678' / 'password123' / 'admin123' 在列，
 * 'abcdefgh' / 'Ab1!xy' 不在列——用例的密码选取受此约束。
 */
const defaultConfig = {
  passwordPolicyMinLength: 10,
  passwordPolicyMinCategories: 3,
  passwordPolicyWeakCheckEnabled: true,
  passwordPolicyChangeEnforceEnabled: true,
  passwordPolicyChangeIntervalDays: 180,
  passwordPolicyExpiringSoonDays: 14,
};

describe('PasswordPolicyService', () => {
  let service: PasswordPolicyService;
  let getValue: jest.Mock;

  const buildService = (overrides: Record<string, unknown> = {}) => {
    getValue = jest.fn(async (key: string) =>
      ({ ...defaultConfig, ...overrides })[key as keyof typeof defaultConfig]
    );
    service = new PasswordPolicyService({ getValue } as never);
  };

  beforeEach(() => {
    buildService();
  });

  describe('assertPasswordPolicy', () => {
    it('长度不足 10 位时抛 BadRequestException', async () => {
      // 9 位（含大小写+数字+特殊字符，但长度不足）
      await expect(service.assertPasswordPolicy('Abc1!xyz9')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('复杂度不足三类时抛 BadRequestException', async () => {
      // 仅小写+数字（两类），长度足够
      await expect(service.assertPasswordPolicy('abcdefgh12')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('命中弱口令黑名单时抛 BadRequestException（大小写不敏感）', async () => {
      await expect(service.assertPasswordPolicy('password123')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.assertPasswordPolicy('Password123')).rejects.toThrow(
        BadRequestException,
      );
      // admin123! 也在黑名单
      await expect(service.assertPasswordPolicy('Admin123!')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('合规口令（≥10 位 + 四类至少三类 + 非黑名单）通过', async () => {
      await expect(
        service.assertPasswordPolicy('MyStr0ng!Pass'),
      ).resolves.toBeUndefined();
      await expect(
        service.assertPasswordPolicy('Abcdef12!@'),
      ).resolves.toBeUndefined();
    });

    it('空口令被拒绝', async () => {
      await expect(service.assertPasswordPolicy('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('minCategories=0 时不要求类别构成（normal 模式，纯数字 8 位通过）', async () => {
      buildService({
        passwordPolicyMinLength: 6,
        passwordPolicyMinCategories: 0,
        passwordPolicyWeakCheckEnabled: false,
      });
      await expect(
        service.assertPasswordPolicy('12345678'),
      ).resolves.toBeUndefined();
    });

    it('minCategories=1 时单类别即通过（纯小写 8 位）', async () => {
      buildService({
        passwordPolicyMinLength: 8,
        passwordPolicyMinCategories: 1,
      });
      await expect(
        service.assertPasswordPolicy('abcdefgh'),
      ).resolves.toBeUndefined();
    });

    it('weakCheckEnabled=false 时弱口令黑名单不生效', async () => {
      buildService({
        passwordPolicyWeakCheckEnabled: false,
        passwordPolicyMinCategories: 2,
      });
      await expect(
        service.assertPasswordPolicy('password123'),
      ).resolves.toBeUndefined();
    });

    it('weakCheckEnabled=true（默认）时黑名单仍拦截', async () => {
      buildService({ passwordPolicyMinCategories: 2 });
      await expect(service.assertPasswordPolicy('password123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('minLength 可下调（6 位即通过，类别齐全）', async () => {
      buildService({
        passwordPolicyMinLength: 6,
        passwordPolicyMinCategories: 3,
      });
      await expect(
        service.assertPasswordPolicy('Ab1!xy'),
      ).resolves.toBeUndefined();
    });
  });

  describe('getPasswordChangeStatus', () => {
    // 冻结时钟：getPasswordChangeStatus 内部两次调用 Date.now()，真实时钟下
    // 「恰好 180 天」会被微秒级漂移算成 180.0000x 天而误判 expired（历史 flake）。
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('passwordChangedAt=null → first_login（首登未改密）', async () => {
      const status = await service.getPasswordChangeStatus(null);
      expect(status.required).toBe('first_login');
      expect(status.expiringSoon).toBe(false);
    });

    it('超过 180 天 → expired（到期强制改密）', async () => {
      const oldDate = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000);
      const status = await service.getPasswordChangeStatus(oldDate);
      expect(status.required).toBe('expired');
    });

    it('距到期 ≤14 天（167 天）→ expiringSoon=true（软提示）', async () => {
      const soonDate = new Date(Date.now() - 167 * 24 * 60 * 60 * 1000);
      const status = await service.getPasswordChangeStatus(soonDate);
      expect(status.required).toBeUndefined();
      expect(status.expiringSoon).toBe(true);
    });

    it('新鲜口令（1 天）→ 无需强改且未到期', async () => {
      const freshDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const status = await service.getPasswordChangeStatus(freshDate);
      expect(status.required).toBeUndefined();
      expect(status.expiringSoon).toBe(false);
    });

    it('恰好 180 天（未超过）→ 非 expired（边界）', async () => {
      const exactDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      const status = await service.getPasswordChangeStatus(exactDate);
      expect(status.required).toBeUndefined();
      expect(status.expiringSoon).toBe(true);
    });

    it('changeIntervalDays=0（永不强制）→ 不判 expired，但首登未改密仍强制', async () => {
      buildService({
        passwordPolicyChangeEnforceEnabled: true,
        passwordPolicyChangeIntervalDays: 0,
      });
      const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
      expect(await service.getPasswordChangeStatus(oldDate)).toEqual({
        required: undefined,
        expiringSoon: false,
      });

      // 首登未改密与更换周期无关，仍强制改密
      const firstLogin = await service.getPasswordChangeStatus(null);
      expect(firstLogin.required).toBe('first_login');
    });

    it('更换周期与软提示天数均可配（30 天周期 + 5 天提示）', async () => {
      buildService({
        passwordPolicyChangeIntervalDays: 30,
        passwordPolicyExpiringSoonDays: 5,
      });
      const expired = await service.getPasswordChangeStatus(
        new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      );
      expect(expired.required).toBe('expired');

      const soon = await service.getPasswordChangeStatus(
        new Date(Date.now() - 27 * 24 * 60 * 60 * 1000),
      );
      expect(soon).toEqual({ required: undefined, expiringSoon: true });

      const fresh = await service.getPasswordChangeStatus(
        new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      );
      expect(fresh).toEqual({ required: undefined, expiringSoon: false });
    });
  });

  describe('changeEnforceEnabled 关闭（默认 false）', () => {
    it('恒返回无需强改，与 passwordChangedAt 无关', async () => {
      buildService({ passwordPolicyChangeEnforceEnabled: false });

      expect(await service.getPasswordChangeStatus(null)).toEqual({
        required: undefined,
        expiringSoon: false,
      });
      const oldDate = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000);
      expect(await service.getPasswordChangeStatus(oldDate)).toEqual({
        required: undefined,
        expiringSoon: false,
      });
    });

    it('总开关关闭时不读取周期与软提示天数（少两次配置读取）', async () => {
      buildService({ passwordPolicyChangeEnforceEnabled: false });
      await service.getPasswordChangeStatus(null);
      expect(getValue.mock.calls.map((call) => call[0])).toEqual([
        'passwordPolicyChangeEnforceEnabled',
      ]);
    });
  });

  describe('每次调用时读取配置（非构造期快照）', () => {
    it('同一次运行内改变配置值，下一次调用即生效', async () => {
      buildService({ passwordPolicyMinLength: 10 });
      await expect(service.assertPasswordPolicy('Ab1!xy')).rejects.toThrow(
        BadRequestException,
      );

      // 只覆盖第一个读取（passwordPolicyMinLength）→ 长度下限从 10 松到 6
      getValue.mockResolvedValueOnce(6);
      await expect(
        service.assertPasswordPolicy('Ab1!xy'),
      ).resolves.toBeUndefined();
    });
  });

  describe('定义表公开性', () => {
    it('两个策略键已公开（前端动态渲染口令提示依赖 /runtime-config/public）', () => {
      const byKey = new Map(
        RUNTIME_CONFIG_DEFINITIONS.map((d) => [d.key, d]),
      );
      expect(byKey.get('passwordPolicyMinLength')?.isPublic).toBe(true);
      expect(byKey.get('passwordPolicyMinCategories')?.isPublic).toBe(true);
    });
  });
});
