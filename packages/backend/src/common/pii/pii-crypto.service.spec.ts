/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  PiiCryptoService,
  resolvePiiKey,
  normalizePhone,
  normalizeEmail,
  maskPhone,
  maskEmail,
  maskAccount,
  encryptPii,
  decryptPii,
  hmacIndex,
} from './pii-crypto.service';

const KEY = crypto.randomBytes(32);

describe('PII 字段级加密（#417 等保 8.1.4.8）', () => {
  describe('resolvePiiKey', () => {
    it('64 位 hex 解码为 32 字节', () => {
      const hex = crypto.randomBytes(32).toString('hex');
      expect(resolvePiiKey(hex, 'fallback')).toEqual(
        Buffer.from(hex, 'hex')
      );
    });

    it('base64（解码后 32 字节）解码成功', () => {
      const b64 = crypto.randomBytes(32).toString('base64');
      expect(resolvePiiKey(b64, 'fallback')).toEqual(
        Buffer.from(b64, 'base64')
      );
    });

    it('长度非法（非 32 字节）抛错', () => {
      expect(() => resolvePiiKey('too-short', 'fallback')).toThrow(/32 字节/);
    });

    it('未设置时回退 SHA-256(fallback)', () => {
      expect(resolvePiiKey(undefined, 'secret-a')).toEqual(
        crypto.createHash('sha256').update('secret-a').digest()
      );
      expect(resolvePiiKey('   ', 'secret-b')).toEqual(
        crypto.createHash('sha256').update('secret-b').digest()
      );
    });
  });

  describe('归一化', () => {
    it('normalizePhone 去 +86 与空白', () => {
      expect(normalizePhone('+86 138 1234 5678')).toBe('13812345678');
      expect(normalizePhone('13812345678')).toBe('13812345678');
    });

    it('normalizeEmail trim + 小写', () => {
      expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
    });
  });

  describe('掩码', () => {
    it('maskPhone 138****5678', () => {
      expect(maskPhone('13812345678')).toBe('138****5678');
      expect(maskPhone('+86 138 1234 5678')).toBe('138****5678');
    });

    it('maskPhone 短号原样返回', () => {
      expect(maskPhone('12345')).toBe('12345');
    });

    it('maskEmail j***@example.com', () => {
      expect(maskEmail('john@example.com')).toBe('j***@example.com');
    });

    it('maskEmail 无 @ 仅保留首字符', () => {
      expect(maskEmail('nolocalpart')).toBe('n***');
    });

    it('maskAccount 按形态分流', () => {
      expect(maskAccount('john@example.com')).toBe('j***@example.com');
      expect(maskAccount('13812345678')).toBe('138****5678');
      expect(maskAccount('alice')).toBe('alice');
      expect(maskAccount('')).toBe('');
    });
  });

  describe('加解密与索引', () => {
    it('encryptPii/decryptPii 往返一致', () => {
      const stored = encryptPii('13812345678', KEY);
      expect(stored.startsWith('enc:v1:')).toBe(true);
      expect(decryptPii(stored, KEY)).toBe('13812345678');
    });

    it('同一明文两次加密密文不同（随机 IV）但均可解密', () => {
      const a = encryptPii('user@example.com', KEY);
      const b = encryptPii('user@example.com', KEY);
      expect(a).not.toBe(b);
      expect(decryptPii(a, KEY)).toBe('user@example.com');
      expect(decryptPii(b, KEY)).toBe('user@example.com');
    });

    it('hmacIndex 稳定且随密钥变化', () => {
      const h1 = hmacIndex('13812345678', KEY);
      const h2 = hmacIndex('13812345678', KEY);
      const otherKey = crypto.randomBytes(32);
      expect(h1).toBe(h2);
      expect(h1).not.toBe(hmacIndex('13812345678', otherKey));
    });

    it('错误密钥解密抛错（authTag 校验失败）', () => {
      const stored = encryptPii('secret', KEY);
      expect(() => decryptPii(stored, crypto.randomBytes(32))).toThrow();
    });
  });

  describe('PiiCryptoService', () => {
    let service: PiiCryptoService;

    const buildService = (encryptionKey: Buffer, hmacKey: Buffer) =>
      Test.createTestingModule({
        providers: [
          PiiCryptoService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) =>
                key === 'pii.encryptionKey'
                  ? encryptionKey.toString('hex')
                  : key === 'pii.hmacKey'
                    ? hmacKey.toString('hex')
                    : undefined
              ),
            },
          },
        ],
      }).compile();

    it('32 字节密钥构造成功，derivePiiFields 补齐派生列', async () => {
      const module: TestingModule = await buildService(KEY, KEY);
      service = module.get<PiiCryptoService>(PiiCryptoService);

      const derived = service.derivePiiFields({
        phone: '13812345678',
        email: 'User@Example.com',
      });
      expect(derived.phoneEnc).toMatch(/^enc:v1:/);
      expect(derived.phoneHmac).toBe(
        hmacIndex(normalizePhone('13812345678'), KEY)
      );
      expect(derived.emailEnc).toMatch(/^enc:v1:/);
      expect(derived.emailHmac).toBe(
        hmacIndex(normalizeEmail('User@Example.com'), KEY)
      );
      // 密文可解密回原文
      expect(service.decrypt(derived.phoneEnc!)).toBe('13812345678');
      await module.close();
    });

    it('phone/email 为 null 时清空派生列（解绑场景）', async () => {
      const module: TestingModule = await buildService(KEY, KEY);
      service = module.get<PiiCryptoService>(PiiCryptoService);
      const derived = service.derivePiiFields({
        phone: null,
        email: null,
      });
      expect(derived.phoneEnc).toBeNull();
      expect(derived.phoneHmac).toBeNull();
      expect(derived.emailEnc).toBeNull();
      expect(derived.emailHmac).toBeNull();
      await module.close();
    });

    it('phone/email 为 undefined 时不触碰派生列', async () => {
      const module: TestingModule = await buildService(KEY, KEY);
      service = module.get<PiiCryptoService>(PiiCryptoService);
      const derived = service.derivePiiFields({});
      expect(derived).toEqual({});
      await module.close();
    });

    it('密钥非 32 字节构造抛错', async () => {
      // buildService 返回的即是 compile() 的 Promise，构造期校验失败会 reject
      await expect(buildService(crypto.randomBytes(16), KEY)).rejects.toThrow();
    });
  });
});
