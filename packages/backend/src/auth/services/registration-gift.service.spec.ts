import { RegistrationGiftService } from './registration-gift.service';

describe('RegistrationGiftService', () => {
  let service: RegistrationGiftService;
  let getValue: jest.Mock;
  let activate: jest.Mock;
  let $transaction: jest.Mock;
  let tx: {
    userMembership: { findUnique: jest.Mock; update: jest.Mock };
    vipTier: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    getValue = jest.fn();
    activate = jest.fn();
    tx = {
      userMembership: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      vipTier: { findUnique: jest.fn() },
    };
    $transaction = jest.fn(async (fn: (t: typeof tx) => Promise<void>) =>
      fn(tx),
    );

    const runtimeConfigService = { getValue } as never;
    const membershipService = { activate } as never;
    const prisma = { $transaction } as never;
    service = new RegistrationGiftService(
      runtimeConfigService,
      membershipService,
      prisma,
    );
  });

  const mockGiftConfig = (enabled: boolean, months: number) => {
    getValue.mockImplementation(async (key: string) => {
      if (key === 'registerGiftEnabled') return enabled;
      if (key === 'registerGiftMonths') return months;
      return undefined;
    });
  };

  it('开关关闭时不执行事务、不激活会员', async () => {
    mockGiftConfig(false, 1);
    await service.grantGiftIfEnabled('user-1');
    expect($transaction).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('月数 <= 0 时不执行事务、不激活会员', async () => {
    mockGiftConfig(true, 0);
    await service.grantGiftIfEnabled('user-1');
    expect($transaction).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('VIP1 档位缺失时跳过（不激活、不报错）', async () => {
    mockGiftConfig(true, 1);
    tx.userMembership.findUnique.mockResolvedValue(null);
    tx.vipTier.findUnique.mockResolvedValue(null);
    await service.grantGiftIfEnabled('user-1');
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(activate).not.toHaveBeenCalled();
  });

  it('VIP1 档位停用（isActive=false）时跳过', async () => {
    mockGiftConfig(true, 1);
    tx.userMembership.findUnique.mockResolvedValue(null);
    tx.vipTier.findUnique.mockResolvedValue({
      level: 1,
      baseMonthlyPrice: 1500,
      isActive: false,
    });
    await service.grantGiftIfEnabled('user-1');
    expect(activate).not.toHaveBeenCalled();
  });

  it('新用户成功赠送：调 activate(level 1, months*30天) 并打已赠送标记', async () => {
    mockGiftConfig(true, 1);
    tx.userMembership.findUnique.mockResolvedValue(null);
    tx.vipTier.findUnique.mockResolvedValue({
      level: 1,
      baseMonthlyPrice: 1500,
      isActive: true,
    });
    tx.userMembership.update.mockResolvedValue({});

    await service.grantGiftIfEnabled('user-1');

    expect(activate).toHaveBeenCalledWith(
      tx,
      'user-1',
      { level: 1, baseMonthlyPrice: 1500 },
      30, // 1 个月 × 30 天
    );
    expect(tx.userMembership.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        metadata: expect.objectContaining({
          registerGiftGrantedAt: expect.any(String),
        }),
      },
    });
  });

  it('月数按配置折算天数（3 个月 → 90 天）', async () => {
    mockGiftConfig(true, 3);
    tx.userMembership.findUnique.mockResolvedValue(null);
    tx.vipTier.findUnique.mockResolvedValue({
      level: 1,
      baseMonthlyPrice: 1500,
      isActive: true,
    });
    tx.userMembership.update.mockResolvedValue({});

    await service.grantGiftIfEnabled('user-1');

    expect(activate).toHaveBeenCalledWith(
      tx,
      'user-1',
      { level: 1, baseMonthlyPrice: 1500 },
      90,
    );
  });

  it('已赠送过（标记存在）时不再送，即使会员已过期', async () => {
    mockGiftConfig(true, 1);
    tx.userMembership.findUnique.mockResolvedValue({
      userId: 'user-1',
      tierLevel: 0,
      expiresAt: new Date(Date.now() - 86400000), // 已过期
      metadata: { registerGiftGrantedAt: '2026-01-01T00:00:00.000Z' },
    });
    tx.vipTier.findUnique.mockResolvedValue({
      level: 1,
      baseMonthlyPrice: 1500,
      isActive: true,
    });

    await service.grantGiftIfEnabled('user-1');

    expect(activate).not.toHaveBeenCalled();
    expect(tx.userMembership.update).not.toHaveBeenCalled();
  });

  it('保留既有 metadata（如 externalVipExpiresAt），不覆盖', async () => {
    mockGiftConfig(true, 1);
    tx.userMembership.findUnique.mockResolvedValue({
      userId: 'user-1',
      tierLevel: 1,
      expiresAt: new Date(Date.now() + 86400000),
      metadata: { externalVipExpiresAt: '2027-01-01T00:00:00.000Z' },
    });
    tx.vipTier.findUnique.mockResolvedValue({
      level: 1,
      baseMonthlyPrice: 1500,
      isActive: true,
    });
    tx.userMembership.update.mockResolvedValue({});

    await service.grantGiftIfEnabled('user-1');

    expect(tx.userMembership.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        metadata: expect.objectContaining({
          externalVipExpiresAt: '2027-01-01T00:00:00.000Z',
          registerGiftGrantedAt: expect.any(String),
        }),
      },
    });
  });

  it('activate 抛错时不向外抛（best-effort，不阻断注册）', async () => {
    mockGiftConfig(true, 1);
    tx.userMembership.findUnique.mockResolvedValue(null);
    tx.vipTier.findUnique.mockResolvedValue({
      level: 1,
      baseMonthlyPrice: 1500,
      isActive: true,
    });
    activate.mockRejectedValue(new Error('db down'));

    await expect(service.grantGiftIfEnabled('user-1')).resolves.toBeUndefined();
  });
});
