import { ref } from 'vue';
import { runtimeConfigControllerGetPublicConfigs } from '@/api-sdk';

/**
 * 公开运行时配置的移动端视图（与 PC 同源：GET /runtime-config/public）。
 *
 * 默认值必须与 packages/backend/src/runtime-config/runtime-config.constants.ts
 * 的 defaultValue 一致——配置接口失败（未登录前、断网、接口 5xx）时页面仍要能判断
 * 「注册开没开 / 要不要邮箱验证 / 微信入口显不显」，否则登录页会整块退化。
 * 新增字段时两边必须同步。
 */
export interface PublicRuntimeConfig {
  /** 邮件服务开关 */
  mailEnabled: boolean;
  /** 强制邮箱验证（开启后注册必须带邮箱并验证） */
  requireEmailVerification: boolean;
  /** 短信服务开关 */
  smsEnabled: boolean;
  /** 强制手机号验证 */
  requirePhoneVerification: boolean;
  /** 客服邮箱 */
  supportEmail: string;
  /** 客服电话 */
  supportPhone: string;
  /** 文件上传大小限制 (MB) */
  maxFileSize: number;
  /** 用户注册开关 */
  allowRegister: boolean;
  /** 微信登录开关 */
  wechatEnabled: boolean;
  /** 微信登录自动创建账号（开启后无需填用户名密码） */
  wechatAutoRegister: boolean;
  /** 账号注销冷静期天数 */
  userCancelGraceDays: number;
  /** 游客转换时间窗（小时） */
  conversionGuestWindowHours: number;
  /** 游客转换次数上限 */
  conversionGuestLimit: number;
  /** 免费用户（含游客）是否允许导出下载转换 */
  freeExportDownloadEnabled: boolean;
  /** 系统公告 */
  systemNotice: string;
  /** 协同编辑开关 */
  collaborationEnabled: boolean;
  /** 协同可用域名白名单（逗号分隔字符串，非数组） */
  collaborationDomains: string;
  /** 批量下载开关 */
  batchDownloadEnabled: boolean;
}

const DEFAULTS: PublicRuntimeConfig = {
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
  systemNotice: '',
  collaborationEnabled: false,
  collaborationDomains: '',
  batchDownloadEnabled: false,
};

function boolField(data: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = data[key];
  // 严格判型：'false' / 0 这类非布尔值不能当真值（Boolean('false') === true）
  return typeof value === 'boolean' ? value : fallback;
}

function stringField(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : fallback;
}

function numberField(data: Record<string, unknown>, key: string, fallback: number): number {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const config = ref<PublicRuntimeConfig>({ ...DEFAULTS });

let fetched = false;
let fetchPromise: Promise<void> | null = null;

async function fetchConfig(): Promise<void> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = (async () => {
    try {
      const result = await runtimeConfigControllerGetPublicConfigs();
      const data = result.data as Record<string, unknown> | undefined;
      if (data) {
        config.value = {
          mailEnabled: boolField(data, 'mailEnabled', DEFAULTS.mailEnabled),
          requireEmailVerification: boolField(
            data,
            'requireEmailVerification',
            DEFAULTS.requireEmailVerification
          ),
          smsEnabled: boolField(data, 'smsEnabled', DEFAULTS.smsEnabled),
          requirePhoneVerification: boolField(
            data,
            'requirePhoneVerification',
            DEFAULTS.requirePhoneVerification
          ),
          supportEmail: stringField(data, 'supportEmail', DEFAULTS.supportEmail),
          supportPhone: stringField(data, 'supportPhone', DEFAULTS.supportPhone),
          maxFileSize: numberField(data, 'maxFileSize', DEFAULTS.maxFileSize),
          allowRegister: boolField(data, 'allowRegister', DEFAULTS.allowRegister),
          wechatEnabled: boolField(data, 'wechatEnabled', DEFAULTS.wechatEnabled),
          wechatAutoRegister: boolField(data, 'wechatAutoRegister', DEFAULTS.wechatAutoRegister),
          userCancelGraceDays: numberField(
            data,
            'userCancelGraceDays',
            DEFAULTS.userCancelGraceDays
          ),
          conversionGuestWindowHours: numberField(
            data,
            'conversionGuestWindowHours',
            DEFAULTS.conversionGuestWindowHours
          ),
          conversionGuestLimit: numberField(data, 'conversionGuestLimit', DEFAULTS.conversionGuestLimit),
          freeExportDownloadEnabled: boolField(
            data,
            'freeExportDownloadEnabled',
            DEFAULTS.freeExportDownloadEnabled
          ),
          systemNotice: stringField(data, 'systemNotice', DEFAULTS.systemNotice),
          collaborationEnabled: boolField(data, 'collaborationEnabled', DEFAULTS.collaborationEnabled),
          collaborationDomains: stringField(
            data,
            'collaborationDomains',
            DEFAULTS.collaborationDomains
          ),
          batchDownloadEnabled: boolField(
            data,
            'batchDownloadEnabled',
            DEFAULTS.batchDownloadEnabled
          ),
        };
      }
    } catch {
      // 保持默认值
    } finally {
      fetched = true;
    }
  })();
  return fetchPromise;
}

export function useRuntimeConfig() {
  const loading = ref(!fetched);

  if (!fetched) {
    fetchConfig().finally(() => {
      loading.value = false;
    });
  } else {
    loading.value = false;
  }

  return {
    config,
    loading,
  };
}
