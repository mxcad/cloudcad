import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UsersService } from './users.service';
import { UserCrudService } from './services/user-crud.service';
import { UserStatusService } from './services/user-status.service';
import { UserPasswordService } from './services/user-password.service';
import { DatabaseService } from '../database/database.service';
import { PiiCryptoService } from '../common/pii/pii-crypto.service';

describe('UsersService.syncWechatAvatar', () => {
  let service: UsersService;
  let crudService: { update: jest.Mock };
  let configService: { get: jest.Mock };
  let avatarDir: string;
  const originalFetch = global.fetch;

  const wechatUrl = 'https://thirdwx.qlogo.cn/mmopen/abc123/132';
  const userId = 'user-1';

  beforeEach(async () => {
    avatarDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-test-'));

    crudService = { update: jest.fn().mockResolvedValue({ id: userId }) };
    configService = { get: jest.fn().mockReturnValue(avatarDir) };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserCrudService, useValue: crudService },
        { provide: UserStatusService, useValue: {} },
        { provide: UserPasswordService, useValue: {} },
        { provide: ConfigService, useValue: configService },
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: DatabaseService, useValue: {} },
        {
          provide: PiiCryptoService,
          useValue: {
            emailHmacIndex: jest.fn((v: string) => `hmac:${v}`),
            phoneHmacIndex: jest.fn((v: string) => `hmac:${v}`),
            derivePiiFields: jest.fn(() => ({})),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fs.rmSync(avatarDir, { recursive: true, force: true });
  });

  function mockFetchResponse(options: {
    ok?: boolean;
    status?: number;
    contentType?: string | null;
    body?: Buffer | string;
    throwOnFetch?: boolean;
  }) {
    const {
      ok = true,
      status = 200,
      contentType = 'image/jpeg',
      body = Buffer.from('fake-image-bytes'),
      throwOnFetch = false,
    } = options;

    if (throwOnFetch) {
      global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
      return;
    }

    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      headers: { get: () => contentType },
      arrayBuffer: async () =>
        typeof body === 'string' ? Buffer.from(body) : body,
    });
  }

  it('应该把微信头像下载落盘并更新 avatar 为本地 URL', async () => {
    mockFetchResponse({});

    const result = await service.syncWechatAvatar(userId, wechatUrl);

    expect(result).toBe(`/api/v1/users/avatar/${userId}`);
    expect(global.fetch).toHaveBeenCalledWith(
      wechatUrl,
      expect.objectContaining({ redirect: 'error' })
    );
    expect(crudService.update).toHaveBeenCalledWith(userId, {
      avatar: `/api/v1/users/avatar/${userId}`,
    });
    // 落盘文件存在且内容一致
    const filePath = path.join(avatarDir, `${userId}.jpg`);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath)).toEqual(Buffer.from('fake-image-bytes'));
  });

  it('非微信域名应跳过，不触发下载和更新', async () => {
    mockFetchResponse({});

    const result = await service.syncWechatAvatar(
      userId,
      'https://example.com/avatar.jpg'
    );

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(crudService.update).not.toHaveBeenCalled();
  });

  it('非 https 协议应跳过', async () => {
    mockFetchResponse({});

    const result = await service.syncWechatAvatar(
      userId,
      'http://thirdwx.qlogo.cn/mmopen/x/132'
    );

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('空字符串应跳过', async () => {
    mockFetchResponse({});

    const result = await service.syncWechatAvatar(userId, '');

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('微信返回 HTTP 错误时应降级返回 null 且不抛错', async () => {
    mockFetchResponse({ ok: false, status: 500 });

    const result = await service.syncWechatAvatar(userId, wechatUrl);

    expect(result).toBeNull();
    expect(crudService.update).not.toHaveBeenCalled();
  });

  it('网络异常时应降级返回 null 且不抛错', async () => {
    mockFetchResponse({ throwOnFetch: true });

    const result = await service.syncWechatAvatar(userId, wechatUrl);

    expect(result).toBeNull();
    expect(crudService.update).not.toHaveBeenCalled();
  });

  it('非图片 content-type 应降级返回 null', async () => {
    mockFetchResponse({ contentType: 'text/html' });

    const result = await service.syncWechatAvatar(userId, wechatUrl);

    expect(result).toBeNull();
    expect(crudService.update).not.toHaveBeenCalled();
  });

  it('超过 5MB 应降级返回 null', async () => {
    mockFetchResponse({ body: Buffer.alloc(5 * 1024 * 1024 + 1) });

    const result = await service.syncWechatAvatar(userId, wechatUrl);

    expect(result).toBeNull();
    expect(crudService.update).not.toHaveBeenCalled();
  });

  it('更新 DB 失败时应降级返回 null 且不抛错', async () => {
    mockFetchResponse({});
    crudService.update.mockRejectedValue(new Error('db error'));

    const result = await service.syncWechatAvatar(userId, wechatUrl);

    expect(result).toBeNull();
  });

  it('webp 头像应落盘为 .webp 扩展名', async () => {
    mockFetchResponse({ contentType: 'image/webp' });

    const result = await service.syncWechatAvatar(userId, wechatUrl);

    expect(result).toBe(`/api/v1/users/avatar/${userId}`);
    expect(fs.existsSync(path.join(avatarDir, `${userId}.webp`))).toBe(true);
  });
});

describe('UsersService.uploadAvatar', () => {
  let service: UsersService;
  let crudService: { update: jest.Mock };
  let avatarDir: string;
  const userId = 'user-avatar';

  beforeEach(async () => {
    avatarDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-upload-test-'));

    crudService = { update: jest.fn().mockResolvedValue({ id: userId }) };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserCrudService, useValue: crudService },
        { provide: UserStatusService, useValue: {} },
        { provide: UserPasswordService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(avatarDir) } },
        { provide: ClsService, useValue: { get: jest.fn() } },
        { provide: DatabaseService, useValue: {} },
        {
          provide: PiiCryptoService,
          useValue: {
            emailHmacIndex: jest.fn((v: string) => `hmac:${v}`),
            phoneHmacIndex: jest.fn((v: string) => `hmac:${v}`),
            derivePiiFields: jest.fn(() => ({})),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  afterEach(() => {
    fs.rmSync(avatarDir, { recursive: true, force: true });
  });

  it('.jfif 后缀应归一化为 .jpg 落盘（回归：移动端相册头像写入后读取侧扫不到）', async () => {
    await service.uploadAvatar(userId, Buffer.from('image-bytes'), '.jfif', 'image/jpeg');

    expect(fs.existsSync(path.join(avatarDir, `${userId}.jpg`))).toBe(true);
    expect(fs.existsSync(path.join(avatarDir, `${userId}.jfif`))).toBe(false);
    expect(crudService.update).toHaveBeenCalledWith(userId, {
      avatar: `/api/v1/users/avatar/${userId}`,
    });
  });

  it('image/jfif MIME 应通过白名单校验', async () => {
    await service.uploadAvatar(userId, Buffer.from('image-bytes'), '.jfif', 'image/jfif');

    expect(fs.existsSync(path.join(avatarDir, `${userId}.jpg`))).toBe(true);
  });

  it('未知后缀应回落为 .png 落盘', async () => {
    await service.uploadAvatar(userId, Buffer.from('image-bytes'), '.txt', 'image/png');

    expect(fs.existsSync(path.join(avatarDir, `${userId}.png`))).toBe(true);
    expect(fs.existsSync(path.join(avatarDir, `${userId}.txt`))).toBe(false);
  });

  it('未提供 MIME 时仍按后缀归一化落盘', async () => {
    await service.uploadAvatar(userId, Buffer.from('image-bytes'), '.JFIF');

    expect(fs.existsSync(path.join(avatarDir, `${userId}.jpg`))).toBe(true);
  });

  it('上传新头像应清理同用户的历史后缀文件（含 .jfif 孤儿）', async () => {
    await fs.promises.writeFile(path.join(avatarDir, `${userId}.jfif`), 'old-jfif');
    await fs.promises.writeFile(path.join(avatarDir, `${userId}.jpg`), 'old-jpg');

    await service.uploadAvatar(userId, Buffer.from('new-avatar'), '.png', 'image/png');

    expect(fs.existsSync(path.join(avatarDir, `${userId}.jfif`))).toBe(false);
    expect(fs.existsSync(path.join(avatarDir, `${userId}.jpg`))).toBe(false);
    expect(fs.readFileSync(path.join(avatarDir, `${userId}.png`))).toEqual(
      Buffer.from('new-avatar')
    );
  });

  it('非白名单 MIME 应抛 BadRequestException', async () => {
    await expect(
      service.uploadAvatar(userId, Buffer.from('x'), '.png', 'text/html')
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('超过 5MB 应抛 BadRequestException', async () => {
    await expect(
      service.uploadAvatar(userId, Buffer.alloc(5 * 1024 * 1024 + 1), '.jpg', 'image/jpeg')
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('遍历 userId：落盘不逃逸 avatarDir（basename 防护，回归：URL 参数可含 %2f/%5c）', async () => {
    const maliciousUserId = '../../etc/passwd';
    await service.uploadAvatar(
      maliciousUserId,
      Buffer.from('image-bytes'),
      '.png',
      'image/png'
    );

    // basename('../../etc/passwd') = 'passwd' → 落在 avatarDir 内
    expect(fs.existsSync(path.join(avatarDir, 'passwd.png'))).toBe(true);
    // avatarDir 外（tmpdir 层级）不应产生文件
    expect(fs.existsSync(path.join(os.tmpdir(), 'etc', 'passwd.png'))).toBe(
      false
    );
  });
});
