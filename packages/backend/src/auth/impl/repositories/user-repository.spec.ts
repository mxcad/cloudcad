/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////

import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../../database/database.service';
import {
  PiiCryptoService,
  encryptPii,
} from '../../../common/pii/pii-crypto.service';
import { UserRepository } from './user-repository';

const KEY = crypto.randomBytes(32);

/**
 * UserRepository PII 显示读切换（#426 步骤③）：
 * toUserRecord 优先解密 enc 列，未迁移记录（enc 空）降级读明文列。
 * 双写过渡期任何时刻保证至少有一份可读数据；明文列将于收缩阶段（步骤⑤）删除。
 */
describe('UserRepository PII 显示读（#426 步骤③ 读切换）', () => {
  let pii: PiiCryptoService;
  let repo: UserRepository;
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PiiCryptoService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'pii.encryptionKey' || key === 'pii.hmacKey'
                ? KEY.toString('hex')
                : undefined
            ),
          },
        },
      ],
    }).compile();
    pii = module.get(PiiCryptoService);
    repo = new UserRepository(
      mockPrisma as unknown as DatabaseService,
      pii
    );
    mockPrisma.user.findUnique.mockReset();
    mockPrisma.user.findFirst.mockReset();
  });

  const baseRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    username: 'testuser',
    nickname: null,
    avatar: null,
    password: null,
    phoneVerified: false,
    emailVerified: false,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    wechatId: null,
    provider: 'LOCAL',
    roleId: 'role-1',
    status: 'ACTIVE',
    deletedAt: null,
    deactivatedBy: null,
    totpEnabled: false,
    passwordChangedAt: null,
    role: {
      id: 'role-1',
      name: 'USER',
      description: null,
      isSystem: false,
      permissions: [],
    },
    ...overrides,
  });

  it('enc 列非空：email/phone 解密返回明文（不返回密文）', async () => {
    const emailEnc = encryptPii('test@example.com', KEY);
    const phoneEnc = encryptPii('13812345678', KEY);
    mockPrisma.user.findUnique.mockResolvedValue(
      baseRow({
        email: 'test@example.com',
        phone: '13812345678',
        emailEnc,
        phoneEnc,
      })
    );
    const record = await repo.findById('user-1');
    // 关键断言：返回解密后的明文，而非 enc 密文
    expect(record?.email).toBe('test@example.com');
    expect(record?.phone).toBe('13812345678');
    expect(record?.email).not.toContain('enc:v1:');
  });

  it('enc 列为空（未迁移记录）：降级读明文列', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      baseRow({
        email: 'legacy@example.com',
        phone: '13900001111',
        emailEnc: null,
        phoneEnc: null,
      })
    );
    const record = await repo.findById('user-1');
    expect(record?.email).toBe('legacy@example.com');
    expect(record?.phone).toBe('13900001111');
  });

  it('enc 列非空但密文损坏（解密失败）：降级读明文列', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      baseRow({
        email: 'test@example.com',
        phone: '13812345678',
        emailEnc: 'enc:v1:corrupted-ciphertext',
        phoneEnc: 'enc:v1:corrupted-ciphertext',
      })
    );
    const record = await repo.findById('user-1');
    expect(record?.email).toBe('test@example.com');
    expect(record?.phone).toBe('13812345678');
  });

  it('email 与 phone 独立降级：email 已迁移、phone 未迁移', async () => {
    const emailEnc = encryptPii('test@example.com', KEY);
    mockPrisma.user.findUnique.mockResolvedValue(
      baseRow({
        email: 'test@example.com',
        phone: '13900001111',
        emailEnc,
        phoneEnc: null,
      })
    );
    const record = await repo.findById('user-1');
    expect(record?.email).toBe('test@example.com');
    expect(record?.phone).toBe('13900001111');
  });

  it('findByEmail 走 HMAC 索引查询 + 解密返回', async () => {
    const emailEnc = encryptPii('test@example.com', KEY);
    mockPrisma.user.findFirst.mockResolvedValue(
      baseRow({ email: 'test@example.com', emailEnc })
    );
    const record = await repo.findByEmail('test@example.com');
    expect(record?.email).toBe('test@example.com');
    // 查询走 HMAC 归一化索引列（不再读明文列）
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          emailHmac: expect.any(String),
        }),
      })
    );
  });
});
