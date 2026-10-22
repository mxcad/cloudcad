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

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  ChannelCryptoService,
  resolveChannelKey,
  maskChannelSecret,
} from './channel-crypto.service';

const KEY_HEX = crypto.randomBytes(32).toString('hex');

describe('通道秘密加密（ADR-0082 #493）', () => {
  describe('resolveChannelKey', () => {
    it('64 位 hex 解码为 32 字节', () => {
      const hex = crypto.randomBytes(32).toString('hex');
      expect(resolveChannelKey(hex, 'fallback')).toEqual(
        Buffer.from(hex, 'hex')
      );
    });

    it('base64（解码后 32 字节）解码成功', () => {
      const b64 = crypto.randomBytes(32).toString('base64');
      expect(resolveChannelKey(b64, 'fallback')).toEqual(
        Buffer.from(b64, 'base64')
      );
    });

    it('长度非法（非 32 字节）抛错——启动即拒绝', () => {
      expect(() => resolveChannelKey('too-short', 'fallback')).toThrow(
        /通道加密密钥必须为 32 字节/
      );
    });

    it('未设置时回退 SHA-256(fallback)', () => {
      expect(resolveChannelKey(undefined, 'secret-a')).toEqual(
        crypto.createHash('sha256').update('secret-a').digest()
      );
      expect(resolveChannelKey('   ', 'secret-b')).toEqual(
        crypto.createHash('sha256').update('secret-b').digest()
      );
    });
  });

  describe('掩码', () => {
    it('空值返回空串（前端以非空判定已配置）', () => {
      expect(maskChannelSecret('')).toBe('');
    });

    it('≤2 字符全掩码', () => {
      expect(maskChannelSecret('a')).toBe('****');
      expect(maskChannelSecret('ab')).toBe('****');
    });

    it('3-5 字符只保留首尾各 1 字符', () => {
      expect(maskChannelSecret('abcde')).toBe('a****e');
    });

    it('≥6 字符保留首尾各 2 字符', () => {
      expect(maskChannelSecret('abcdef')).toBe('ab****ef');
      expect(maskChannelSecret('smtp-pass-123')).toBe('sm****23');
    });
  });

  describe('ChannelCryptoService', () => {
    let service: ChannelCryptoService;

    const mockConfigService = {
      get: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      mockConfigService.get.mockImplementation((path: string) =>
        path === 'channel.encryptionKey' ? KEY_HEX : undefined
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ChannelCryptoService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      service = module.get<ChannelCryptoService>(ChannelCryptoService);
    });

    it('构造时校验密钥：非法 hex 拒绝启动', async () => {
      mockConfigService.get.mockImplementation((path: string) =>
        path === 'channel.encryptionKey' ? 'not-a-hex' : undefined
      );
      const module = Test.createTestingModule({
        providers: [
          ChannelCryptoService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      });
      await expect(module.compile()).rejects.toThrow(/通道加密密钥/);
    });

    it('加密输出 chan:v1 前缀密文，解密回原文', () => {
      const ciphertext = service.encrypt('smtp-pass-123');
      expect(ciphertext.startsWith('chan:v1:')).toBe(true);
      expect(ciphertext).not.toContain('smtp-pass-123');
      expect(service.decrypt(ciphertext)).toBe('smtp-pass-123');
    });

    it('同一明文两次加密密文不同（随机 IV）', () => {
      expect(service.encrypt('x')).not.toBe(service.encrypt('x'));
    });

    it('格式非法的密文解密抛错', () => {
      expect(() => service.decrypt('not-a-ciphertext')).toThrow(
        /通道密文格式非法/
      );
      expect(() => service.decrypt('chan:v1:only-two-parts')).toThrow(
        /通道密文格式非法/
      );
    });

    it('被篡改的密文解密抛错（authTag 校验）', () => {
      const ciphertext = service.encrypt('smtp-pass-123');
      const tampered = ciphertext.slice(0, -4) + 'AAAA';
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('isCiphertext 只认 chan:v1 前缀', () => {
      expect(service.isCiphertext(service.encrypt('x'))).toBe(true);
      expect(service.isCiphertext('plain-value')).toBe(false);
      expect(service.isCiphertext('')).toBe(false);
    });
  });
});
