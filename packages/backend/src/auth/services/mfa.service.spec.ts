/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MfaService } from './mfa.service';
import { currentTotpCode } from './totp';
import { DatabaseService } from '../../database/database.service';

/** 生成当前时刻的有效 TOTP 动态码（与 MfaService 的 ±30s 时间窗兼容） */
function currentCode(secret: string): string {
  return currentTotpCode(secret);
}

describe('MfaService（TOTP 双因素，#415）', () => {
  let service: MfaService;

  const mockUserFindUnique = jest.fn();
  const mockUserUpdate = jest.fn();
  const mockPrisma = {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUserUpdate.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: DatabaseService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'totp.encryptionKey'
                ? 'test-totp-encryption-key'
                : key === 'product.name'
                  ? 'CloudCAD'
                  : undefined
            ),
          },
        },
      ],
    }).compile();

    service = module.get<MfaService>(MfaService);
  });

  describe('setup', () => {
    it('未绑定：生成 secret 并密文存库（非明文），返回 secret 与 otpauth 链接', async () => {
      mockUserFindUnique.mockResolvedValue({
        username: 'admin',
        totpSecret: null,
        totpEnabled: false,
      });
      const { secret, otpauthUrl } = await service.setup('admin-1');

      expect(secret).toMatch(/^[A-Z2-7]{16,}$/); // Base32
      expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      expect(otpauthUrl).toContain('issuer=CloudCAD');

      // 存库的是密文（enc:v1 前缀），不是明文 secret
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'admin-1' },
          data: expect.objectContaining({
            totpSecret: expect.stringMatching(/^enc:v1:/),
          }),
        })
      );
      expect(mockUserUpdate.mock.calls[0][0].data.totpSecret).not.toContain(
        secret
      );
    });

    it('幂等：已存 secret 未启用时解密复用（不换码、不重写库）', async () => {
      const plainSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      const encrypted = await service['encrypt'](plainSecret);
      mockUserFindUnique.mockResolvedValue({
        username: 'admin',
        totpSecret: encrypted,
        totpEnabled: false,
      });
      const { secret } = await service.setup('admin-1');
      // 复用已存 secret 的明文（解密后），二维码稳定
      expect(secret).toBe(plainSecret);
      // 复用路径不重写库
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it('已启用：抛错（无需重复绑定）', async () => {
      mockUserFindUnique.mockResolvedValue({
        username: 'admin',
        totpSecret: 'enc:v1:x',
        totpEnabled: true,
      });
      await expect(service.setup('admin-1')).rejects.toThrow('已启用');
    });

    it('用户不存在：抛错', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      await expect(service.setup('ghost')).rejects.toThrow('不存在');
    });
  });

  describe('verifyCode', () => {
    it('有效动态码（当前时刻）：返回 true', async () => {
      const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      const code = await currentCode(secret);
      mockUserFindUnique.mockResolvedValue({
        totpSecret: await service['encrypt'](secret),
      });
      await expect(service.verifyCode('admin-1', code)).resolves.toBe(true);
    });

    it('错误动态码：返回 false', async () => {
      const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      mockUserFindUnique.mockResolvedValue({
        totpSecret: await service['encrypt'](secret),
      });
      await expect(service.verifyCode('admin-1', '000000')).resolves.toBe(
        false
      );
    });

    it('非法格式（非 6 位数字）：返回 false 且不查库', async () => {
      mockUserFindUnique.mockResolvedValue({ totpSecret: 'enc:v1:x' });
      await expect(service.verifyCode('admin-1', '12345')).resolves.toBe(false);
      await expect(service.verifyCode('admin-1', 'abcdef')).resolves.toBe(false);
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it('无 secret：返回 false', async () => {
      mockUserFindUnique.mockResolvedValue({ totpSecret: null });
      await expect(service.verifyCode('admin-1', '123456')).resolves.toBe(
        false
      );
    });
  });

  describe('bind', () => {
    it('首码正确：置 totpEnabled=true', async () => {
      const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      const code = await currentCode(secret);
      mockUserFindUnique.mockResolvedValue({
        totpSecret: await service['encrypt'](secret),
      });
      await expect(service.bind('admin-1', code)).resolves.toBe(true);
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'admin-1' },
          data: { totpEnabled: true },
        })
      );
    });

    it('首码错误：返回 false 且不置位', async () => {
      const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      mockUserFindUnique.mockResolvedValue({
        totpSecret: await service['encrypt'](secret),
      });
      await expect(service.bind('admin-1', '000000')).resolves.toBe(false);
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });
  });

  describe('isTotpEnabled', () => {
    it('返回用户 totpEnabled 标志', async () => {
      mockUserFindUnique.mockResolvedValue({ totpEnabled: true });
      await expect(service.isTotpEnabled('admin-1')).resolves.toBe(true);
      mockUserFindUnique.mockResolvedValue({ totpEnabled: false });
      await expect(service.isTotpEnabled('admin-1')).resolves.toBe(false);
      mockUserFindUnique.mockResolvedValue(null);
      await expect(service.isTotpEnabled('ghost')).resolves.toBe(false);
    });
  });
});
