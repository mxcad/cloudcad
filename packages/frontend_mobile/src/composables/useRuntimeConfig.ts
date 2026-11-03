import { ref } from 'vue';
import {
  RUNTIME_CONFIG_DEFAULTS,
  RUNTIME_CONFIG_FAIL_SAFE,
} from '@cloudcad/contracts/runtime-config/defaults';
import { runtimeConfigControllerGetPublicConfigs } from '@/api-sdk';

/**
 * 公开运行时配置的移动端视图（与 PC 同源：GET /runtime-config/public）。
 *
 * 兜底值全部来自 @cloudcad/contracts 的 RUNTIME_CONFIG_DEFAULTS（与后端 defaultValue
 * 同一事实源）——配置接口失败（未登录前、断网、接口 5xx）时页面仍要能判断
 * 「注册开没开 / 要不要邮箱验证 / 微信入口显不显」，否则登录页会整块退化。
 * 口令策略两键刻意用 RUNTIME_CONFIG_FAIL_SAFE（secure 基线 10/3，接口失败回退到更严侧）。
 */
/**
 * 运行时品牌档案里移动端消费的部分。字段名与 PC `appConfig.ts` 的
 * `RuntimeBrandConfig`（= `Partial<BrandConfig>`）同名同义——管理端配一份两端共用。
 * `apps` 移动端无对应消费点，故不在此声明（后端 brandProfile 是 type:json，
 * 未声明字段照样能存）；`subtitle` / `tagline` 的单项运行时键
 * （brandSubtitle / brandTagline）移动端无展示位，随公开配置下发但不在此消费。
 * DB 里只有管理端填了的键，故全部可选。
 * 移动端消费入口统一走 `config/brandConfig.ts` 的 `resolveBrand` / `resolveLegalVars`。
 */
export interface RuntimeBrandProfile {
  /** 应用主标题：页签标题 + 认证页品牌名（对齐 PC `BrandConfig.title`） */
  title?: string
  /** Logo 路径（同为 favicon 来源，对齐 PC `BrandConfig.logo`） */
  logo?: string
  /** 帮助文档地址（低优先级兜底：`docsUrl` 单项运行时项优先，对齐 PC `BrandConfig.docsUrl`） */
  docsUrl?: string
  copyrightYear?: string
  /** 版权主体（页脚展示，对齐 PC `BrandConfig.copyrightHolder`） */
  copyrightHolder?: string
  copyrightLine?: string
  /** 客服：email/phone 以 supportEmail/supportPhone 运行时项为准，此处仅补 hours */
  support?: { email?: string; phone?: string; hours?: string }
  legal?: {
    productName?: string
    productShortName?: string
    identities?: Record<string, { entityName?: string }>
  }
}

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
  /** 客服服务时间（移动端无对应展示位，随公开配置一并下发） */
  supportHours: string
  /** 帮助文档地址（「实时协同」提示里的「查看文档」链接） */
  docsUrl: string
  /** 品牌标题（页签标题 + 认证页品牌名）；留空回落品牌档案整块 title → 内置默认 */
  brandTitle: string
  /** 侧边栏副标题（移动端无对应展示位，随公开配置一并下发） */
  brandSubtitle: string
  /** 品牌标语（移动端无对应展示位，随公开配置一并下发） */
  brandTagline: string
  /** Logo URL（favicon + 认证页 Logo）；留空回落品牌档案整块 logo → 内置默认 */
  brandLogo: string
  /** 版权行模板（{year}/{appName} 占位符）；留空回落品牌档案整块 copyrightLine → 内置默认 */
  brandCopyrightLine: string
  /** 版权年份（版权行 {year} 取值）；留空回落品牌档案整块 copyrightYear → 内置默认 */
  brandCopyrightYear: string
  /** 版权持有方（法务条款/页脚）；留空回落品牌档案整块 copyrightHolder → 内置默认 */
  brandCopyrightHolder: string
  /** 法务产品全称（法务条款正文）；留空回落品牌档案整块 legal.productName → 内置按语言值 */
  brandLegalProductName: string
  /** 法务产品短名（i18n 插值）；留空回落品牌档案整块 legal.productShortName → 内置默认 */
  brandLegalProductShortName: string
  /** 文件上传大小限制 (MB) */
  maxFileSize: number;
  /** 用户注册开关 */
  allowRegister: boolean;
  /** 注册自动送会员开关（送会员活动开启时前端展示营销引导） */
  registerGiftEnabled: boolean;
  /** 注册自动送会员月数（0 = 活动关闭） */
  registerGiftMonths: number;
  /** 微信登录开关 */
  wechatEnabled: boolean;
  /** 微信登录自动创建账号（开启后无需填用户名密码）。后端 local-auth 强制；移动端走事务轮询，不本地预判 */
  wechatAutoRegister: boolean;
  /** 账号注销冷静期天数 */
  userCancelGraceDays: number;
  /** 游客转换时间窗（小时）。后端 restriction-engine 强制，移动端只在拿到 403 时提示 */
  conversionGuestWindowHours: number;
  /** 游客转换次数上限。后端 restriction-engine 强制，移动端只在拿到 403 时提示 */
  conversionGuestLimit: number;
  /** 免费用户（含游客）是否允许导出下载转换 */
  freeExportDownloadEnabled: boolean;
  /** 协同编辑开关 */
  collaborationEnabled: boolean;
  /** 协同可用域名白名单（逗号分隔字符串，非数组） */
  collaborationDomains: string;
  /** 批量下载开关 */
  batchDownloadEnabled: boolean
  /** 口令最小长度（生效值，后端 passwordPolicyMinLength 下发；旧后端未公开时回落 10，与 secure 基线一致） */
  passwordPolicyMinLength: number
  /** 口令最小字符类别数（0 = 不要求；生效值，后端 passwordPolicyMinCategories 下发；旧后端未公开时回落 3） */
  passwordPolicyMinCategories: number
  /** 匿名反馈开关（false 时未登录须登录后才能提交） */
  feedbackAnonymousEnabled: boolean
  /** 匿名每日提交上限（服务端强制执行，前端仅提示） */
  feedbackAnonymousDailyLimit: number
  /** 登录用户每日提交上限（服务端强制执行，前端仅提示） */
  feedbackUserDailyLimit: number
  /** 反馈内容最小长度（前端本地校验 + 服务端强制） */
  feedbackMinContentLength: number
  /** 反馈内容最大长度（前端本地校验 + 服务端强制） */
  feedbackMaxContentLength: number
  /** 反馈图片附件单张上限（MB） */
  feedbackMaxImageSize: number
  /** 反馈图纸附件单文件上限（MB） */
  feedbackMaxDrawingSize: number
  /** 反馈文档附件单文件上限（MB） */
  feedbackMaxDocumentSize: number
  /** 单条反馈图片附件数量上限 */
  feedbackMaxImageCount: number
  /** 单条反馈图纸附件数量上限 */
  feedbackMaxDrawingCount: number
  /** 单条反馈文档附件数量上限 */
  feedbackMaxDocumentCount: number
  /** 单条反馈附件总数上限 */
  feedbackMaxAttachmentCount: number
  /** 品牌档案（法务条款的品牌占位符）；缺省走移动端内置默认品牌 */
  brandProfile: RuntimeBrandProfile
}

const DEFAULTS: PublicRuntimeConfig = {
  mailEnabled: RUNTIME_CONFIG_DEFAULTS.mailEnabled,
  requireEmailVerification: RUNTIME_CONFIG_DEFAULTS.requireEmailVerification,
  smsEnabled: RUNTIME_CONFIG_DEFAULTS.smsEnabled,
  requirePhoneVerification: RUNTIME_CONFIG_DEFAULTS.requirePhoneVerification,
  supportEmail: RUNTIME_CONFIG_DEFAULTS.supportEmail,
  supportPhone: RUNTIME_CONFIG_DEFAULTS.supportPhone,
  supportHours: RUNTIME_CONFIG_DEFAULTS.supportHours,
  docsUrl: RUNTIME_CONFIG_DEFAULTS.docsUrl,
  brandTitle: RUNTIME_CONFIG_DEFAULTS.brandTitle,
  brandSubtitle: RUNTIME_CONFIG_DEFAULTS.brandSubtitle,
  brandTagline: RUNTIME_CONFIG_DEFAULTS.brandTagline,
  brandLogo: RUNTIME_CONFIG_DEFAULTS.brandLogo,
  brandCopyrightLine: RUNTIME_CONFIG_DEFAULTS.brandCopyrightLine,
  brandCopyrightYear: RUNTIME_CONFIG_DEFAULTS.brandCopyrightYear,
  brandCopyrightHolder: RUNTIME_CONFIG_DEFAULTS.brandCopyrightHolder,
  brandLegalProductName: RUNTIME_CONFIG_DEFAULTS.brandLegalProductName,
  brandLegalProductShortName: RUNTIME_CONFIG_DEFAULTS.brandLegalProductShortName,
  maxFileSize: RUNTIME_CONFIG_DEFAULTS.maxFileSize,
  allowRegister: RUNTIME_CONFIG_DEFAULTS.allowRegister,
  registerGiftEnabled: RUNTIME_CONFIG_DEFAULTS.registerGiftEnabled,
  registerGiftMonths: RUNTIME_CONFIG_DEFAULTS.registerGiftMonths,
  wechatEnabled: RUNTIME_CONFIG_DEFAULTS.wechatEnabled,
  wechatAutoRegister: RUNTIME_CONFIG_DEFAULTS.wechatAutoRegister,
  userCancelGraceDays: RUNTIME_CONFIG_DEFAULTS.userCancelGraceDays,
  conversionGuestWindowHours: RUNTIME_CONFIG_DEFAULTS.conversionGuestWindowHours,
  conversionGuestLimit: RUNTIME_CONFIG_DEFAULTS.conversionGuestLimit,
  freeExportDownloadEnabled: RUNTIME_CONFIG_DEFAULTS.freeExportDownloadEnabled,
  collaborationEnabled: RUNTIME_CONFIG_DEFAULTS.collaborationEnabled,
  collaborationDomains: RUNTIME_CONFIG_DEFAULTS.collaborationDomains,
  batchDownloadEnabled: RUNTIME_CONFIG_DEFAULTS.batchDownloadEnabled,
  // 刻意 fail-safe（接口失败回退到 secure 基线），见 contracts RUNTIME_CONFIG_FAIL_SAFE
  passwordPolicyMinLength: RUNTIME_CONFIG_FAIL_SAFE.passwordPolicyMinLength,
  passwordPolicyMinCategories: RUNTIME_CONFIG_FAIL_SAFE.passwordPolicyMinCategories,
  feedbackAnonymousEnabled: RUNTIME_CONFIG_DEFAULTS.feedbackAnonymousEnabled,
  feedbackAnonymousDailyLimit: RUNTIME_CONFIG_DEFAULTS.feedbackAnonymousDailyLimit,
  feedbackUserDailyLimit: RUNTIME_CONFIG_DEFAULTS.feedbackUserDailyLimit,
  feedbackMinContentLength: RUNTIME_CONFIG_DEFAULTS.feedbackMinContentLength,
  feedbackMaxContentLength: RUNTIME_CONFIG_DEFAULTS.feedbackMaxContentLength,
  feedbackMaxImageSize: RUNTIME_CONFIG_DEFAULTS.feedbackMaxImageSize,
  feedbackMaxDrawingSize: RUNTIME_CONFIG_DEFAULTS.feedbackMaxDrawingSize,
  feedbackMaxDocumentSize: RUNTIME_CONFIG_DEFAULTS.feedbackMaxDocumentSize,
  feedbackMaxImageCount: RUNTIME_CONFIG_DEFAULTS.feedbackMaxImageCount,
  feedbackMaxDrawingCount: RUNTIME_CONFIG_DEFAULTS.feedbackMaxDrawingCount,
  feedbackMaxDocumentCount: RUNTIME_CONFIG_DEFAULTS.feedbackMaxDocumentCount,
  feedbackMaxAttachmentCount: RUNTIME_CONFIG_DEFAULTS.feedbackMaxAttachmentCount,
  brandProfile: {},
};

function boolField(data: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = data[key];
  // 严格判型：'false' / 0 / 'no' 这类非布尔值不能当真值（Boolean('false') === true），
  // 与同文件 stringField / numberField 保持一致的判型策略
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

/** 对象字段（brandProfile）：必须是普通对象，空值/数组/字符串一律回落 */
function objectField<T extends object>(
  data: Record<string, unknown>,
  key: string,
  fallback: T,
): T {
  const value = data[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as T)
    : fallback;
}

const config = ref<PublicRuntimeConfig>({ ...DEFAULTS });

const configListeners = new Set<() => void>();

/** 订阅运行时配置取回/刷新（仅成功时触发）。返回退订函数。 */
export function subscribeRuntimeConfig(listener: () => void): () => void {
  configListeners.add(listener);
  return () => {
    configListeners.delete(listener);
  };
}

function notifyRuntimeConfig(): void {
  configListeners.forEach((listener) => listener());
}

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
          supportHours: stringField(data, 'supportHours', DEFAULTS.supportHours),
          docsUrl: stringField(data, 'docsUrl', DEFAULTS.docsUrl),
          brandTitle: stringField(data, 'brandTitle', DEFAULTS.brandTitle),
          brandSubtitle: stringField(data, 'brandSubtitle', DEFAULTS.brandSubtitle),
          brandTagline: stringField(data, 'brandTagline', DEFAULTS.brandTagline),
          brandLogo: stringField(data, 'brandLogo', DEFAULTS.brandLogo),
          brandCopyrightLine: stringField(
            data,
            'brandCopyrightLine',
            DEFAULTS.brandCopyrightLine
          ),
          brandCopyrightYear: stringField(
            data,
            'brandCopyrightYear',
            DEFAULTS.brandCopyrightYear
          ),
          brandCopyrightHolder: stringField(
            data,
            'brandCopyrightHolder',
            DEFAULTS.brandCopyrightHolder
          ),
          brandLegalProductName: stringField(
            data,
            'brandLegalProductName',
            DEFAULTS.brandLegalProductName
          ),
          brandLegalProductShortName: stringField(
            data,
            'brandLegalProductShortName',
            DEFAULTS.brandLegalProductShortName
          ),
          maxFileSize: numberField(data, 'maxFileSize', DEFAULTS.maxFileSize),
          allowRegister: boolField(data, 'allowRegister', DEFAULTS.allowRegister),
          registerGiftEnabled: boolField(
            data,
            'registerGiftEnabled',
            DEFAULTS.registerGiftEnabled
          ),
          registerGiftMonths: numberField(
            data,
            'registerGiftMonths',
            DEFAULTS.registerGiftMonths
          ),
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
          passwordPolicyMinLength: numberField(
            data,
            'passwordPolicyMinLength',
            DEFAULTS.passwordPolicyMinLength
          ),
          passwordPolicyMinCategories: numberField(
            data,
            'passwordPolicyMinCategories',
            DEFAULTS.passwordPolicyMinCategories
          ),
          feedbackAnonymousEnabled: boolField(
            data,
            'feedback.anonymousEnabled',
            DEFAULTS.feedbackAnonymousEnabled
          ),
          feedbackAnonymousDailyLimit: numberField(
            data,
            'feedback.anonymousDailyLimit',
            DEFAULTS.feedbackAnonymousDailyLimit
          ),
          feedbackUserDailyLimit: numberField(
            data,
            'feedback.userDailyLimit',
            DEFAULTS.feedbackUserDailyLimit
          ),
          feedbackMinContentLength: numberField(
            data,
            'feedback.minContentLength',
            DEFAULTS.feedbackMinContentLength
          ),
          feedbackMaxContentLength: numberField(
            data,
            'feedback.maxContentLength',
            DEFAULTS.feedbackMaxContentLength
          ),
          feedbackMaxImageSize: numberField(
            data,
            'feedback.maxImageSize',
            DEFAULTS.feedbackMaxImageSize
          ),
          feedbackMaxDrawingSize: numberField(
            data,
            'feedback.maxDrawingSize',
            DEFAULTS.feedbackMaxDrawingSize
          ),
          feedbackMaxDocumentSize: numberField(
            data,
            'feedback.maxDocumentSize',
            DEFAULTS.feedbackMaxDocumentSize
          ),
          feedbackMaxImageCount: numberField(
            data,
            'feedback.maxImageCount',
            DEFAULTS.feedbackMaxImageCount
          ),
          feedbackMaxDrawingCount: numberField(
            data,
            'feedback.maxDrawingCount',
            DEFAULTS.feedbackMaxDrawingCount
          ),
          feedbackMaxDocumentCount: numberField(
            data,
            'feedback.maxDocumentCount',
            DEFAULTS.feedbackMaxDocumentCount
          ),
          feedbackMaxAttachmentCount: numberField(
            data,
            'feedback.maxAttachmentCount',
            DEFAULTS.feedbackMaxAttachmentCount
          ),
          brandProfile: objectField<RuntimeBrandProfile>(
            data,
            'brandProfile',
            DEFAULTS.brandProfile
          ),
        };
        notifyRuntimeConfig();
      }
    } catch {
      // 保持默认值
    } finally {
      fetched = true;
    }
  })();
  return fetchPromise;
}

/** 非组件上下文触发配置加载（main.ts 启动期用；已加载则立即返回） */
export function ensureRuntimeConfig(): Promise<void> {
  return fetchConfig();
}

/** 当前配置快照（非组件上下文读取用；未取回时为默认值） */
export function getRuntimeConfigSnapshot(): PublicRuntimeConfig {
  return config.value;
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
