import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetPublicConfigs = vi.fn();

vi.mock('@/api-sdk', () => ({
  runtimeConfigControllerGetPublicConfigs: (...args: unknown[]) =>
    mockGetPublicConfigs(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockGetPublicConfigs.mockResolvedValue({ data: {} });
});

async function loadConfig() {
  return (await import('./useRuntimeConfig')).useRuntimeConfig();
}

describe('默认值（接口未返回或失败时）', () => {
  it('与后端 RUNTIME_CONFIG_DEFINITIONS 的 defaultValue 对齐', async () => {
    mockGetPublicConfigs.mockResolvedValue({ data: undefined });
    const { config, loading } = await loadConfig();
    await vi.waitFor(() => {
      expect(loading.value).toBe(false);
    });

    expect(config.value).toEqual({
      mailEnabled: false,
      requireEmailVerification: false,
      smsEnabled: false,
      requirePhoneVerification: false,
      supportEmail: '',
      supportPhone: '',
      maxFileSize: 100,
      allowRegister: true,
      wechatEnabled: false,
      wechatAutoRegister: false,
      userCancelGraceDays: 7,
      conversionGuestWindowHours: 2,
      conversionGuestLimit: 5,
      freeExportDownloadEnabled: false,
      collaborationEnabled: false,
      collaborationDomains: '',
      batchDownloadEnabled: false,
    });
  });

  it('接口抛错时保持默认值而不是崩溃', async () => {
    mockGetPublicConfigs.mockRejectedValue(new Error('network down'));
    const { config } = await loadConfig();
    await vi.waitFor(() => expect(mockGetPublicConfigs).toHaveBeenCalled());
    expect(config.value.allowRegister).toBe(true);
    expect(config.value.wechatEnabled).toBe(false);
  });
});

describe('字段解析', () => {
  it('按类型解析，字符串型的 collaborationDomains 保持字符串', async () => {
    mockGetPublicConfigs.mockResolvedValue({
      data: {
        mailEnabled: true,
        requireEmailVerification: true,
        smsEnabled: true,
        requirePhoneVerification: true,
        supportEmail: 'cs@mx.com',
        supportPhone: '400-123-4567',
        maxFileSize: 500,
        allowRegister: false,
        wechatEnabled: true,
        wechatAutoRegister: true,
        userCancelGraceDays: 14,
        conversionGuestWindowHours: 48,
        conversionGuestLimit: 100,
        freeExportDownloadEnabled: true,
        collaborationEnabled: true,
        collaborationDomains: 'mxdraw.com,*.mxdraw.cn',
        batchDownloadEnabled: true,
      },
    });
    const { config } = await loadConfig();
    await vi.waitFor(() => expect(config.value.wechatEnabled).toBe(true));

    expect(config.value.collaborationDomains).toBe('mxdraw.com,*.mxdraw.cn');
    expect(config.value.allowRegister).toBe(false);
    expect(config.value.maxFileSize).toBe(500);
  });

  it('类型不符的字段回退默认值，不整包失败', async () => {
    mockGetPublicConfigs.mockResolvedValue({
      data: {
        mailEnabled: true,
        wechatEnabled: 'no',
        maxFileSize: 'big',
        supportEmail: 123,
        collaborationDomains: 12345,
      },
    });
    const { config } = await loadConfig();
    await vi.waitFor(() => expect(config.value.mailEnabled).toBe(true));

    expect(config.value.wechatEnabled).toBe(false);
    expect(config.value.maxFileSize).toBe(100);
    expect(config.value.supportEmail).toBe('');
    expect(config.value.collaborationDomains).toBe('');
  });

  it('布尔型严格判型：字符串与数字都不当真值，一律回退默认值', async () => {
    mockGetPublicConfigs.mockResolvedValue({
      data: {
        allowRegister: 'false',
        wechatEnabled: 0,
        wechatAutoRegister: '0',
        freeExportDownloadEnabled: '',
        batchDownloadEnabled: null,
        collaborationEnabled: undefined,
        mailEnabled: false,
      },
    });
    const { config } = await loadConfig();
    await vi.waitFor(() => expect(config.value.mailEnabled).toBe(false));

    expect(config.value.allowRegister).toBe(true);
    expect(config.value.wechatEnabled).toBe(false);
    expect(config.value.wechatAutoRegister).toBe(false);
    expect(config.value.freeExportDownloadEnabled).toBe(false);
    expect(config.value.batchDownloadEnabled).toBe(false);
    expect(config.value.collaborationEnabled).toBe(false);
  });
});
