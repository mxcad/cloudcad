import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PasswordPolicyService } from './password-policy.service';

describe('PasswordPolicyService', () => {
  let service: PasswordPolicyService;

  const defaultPolicy = {
    minLength: 10,
    maxAgeDays: 180,
    expiringSoonDays: 14,
    // 默认开启，用于验证「开启时」的判定逻辑；关闭分支见下方独立用例
    changeEnforceEnabled: true,
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const buildService = (policy: Record<string, unknown>) => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'passwordPolicy') {
        return { ...policy };
      }
      return undefined;
    });
    return Test.createTestingModule({
      providers: [
        PasswordPolicyService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await buildService(defaultPolicy);
    service = module.get<PasswordPolicyService>(PasswordPolicyService);
  });

  describe('assertPasswordPolicy', () => {
    it('长度不足 10 位时抛 BadRequestException', () => {
      // 9 位（含大小写+数字+特殊字符，但长度不足）
      expect(() => service.assertPasswordPolicy('Abc1!xyz9')).toThrow(
        BadRequestException,
      );
    });

    it('复杂度不足三类时抛 BadRequestException', () => {
      // 仅小写+数字（两类），长度足够
      expect(() => service.assertPasswordPolicy('abcdefgh12')).toThrow(
        BadRequestException,
      );
    });

    it('命中弱口令黑名单时抛 BadRequestException', () => {
      // password123 在黑名单中（小写匹配）
      expect(() => service.assertPasswordPolicy('password123')).toThrow(
        BadRequestException,
      );
      // 大小写不敏感：Password123 也命中
      expect(() => service.assertPasswordPolicy('Password123')).toThrow(
        BadRequestException,
      );
    });

    it('合规口令（≥10 位 + 四类至少三类 + 非黑名单）通过', () => {
      expect(() => service.assertPasswordPolicy('MyStr0ng!Pass')).not.toThrow();
      // 四类齐全
      expect(() => service.assertPasswordPolicy('Abcdef12!@')).not.toThrow();
    });

    it('弱口令黑名单大小写不敏感（admin123! 命中）', () => {
      expect(() => service.assertPasswordPolicy('Admin123!')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('getPasswordChangeStatus', () => {
    it('passwordChangedAt=null → first_login（首登未改密）', () => {
      const status = service.getPasswordChangeStatus(null);
      expect(status.required).toBe('first_login');
      expect(status.expiringSoon).toBe(false);
    });

    it('超过 180 天 → expired（到期强制改密）', () => {
      const oldDate = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000);
      const status = service.getPasswordChangeStatus(oldDate);
      expect(status.required).toBe('expired');
    });

    it('距到期 ≤14 天（167 天）→ expiringSoon=true（软提示）', () => {
      const soonDate = new Date(Date.now() - 167 * 24 * 60 * 60 * 1000);
      const status = service.getPasswordChangeStatus(soonDate);
      expect(status.required).toBeUndefined();
      expect(status.expiringSoon).toBe(true);
    });

    it('新鲜口令（1 天）→ 无需强改且未到期', () => {
      const freshDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const status = service.getPasswordChangeStatus(freshDate);
      expect(status.required).toBeUndefined();
      expect(status.expiringSoon).toBe(false);
    });

    it('恰好 180 天（未超过）→ 非 expired（边界）', () => {
      const exactDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      const status = service.getPasswordChangeStatus(exactDate);
      expect(status.required).toBeUndefined();
      expect(status.expiringSoon).toBe(true);
    });
  });

  describe('changeEnforceEnabled 关闭（默认 false）', () => {
    it('恒返回无需强改（required=undefined, expiringSoon=false），与 passwordChangedAt 无关', async () => {
      const module: TestingModule = await buildService({
        ...defaultPolicy,
        changeEnforceEnabled: false,
      });
      const offService =
        module.get<PasswordPolicyService>(PasswordPolicyService);

      // 首登未改密（null）
      expect(offService.getPasswordChangeStatus(null)).toEqual({
        required: undefined,
        expiringSoon: false,
      });
      // 超过 180 天
      const oldDate = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000);
      expect(offService.getPasswordChangeStatus(oldDate)).toEqual({
        required: undefined,
        expiringSoon: false,
      });
    });
  });
});
