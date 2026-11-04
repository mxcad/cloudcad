import React, { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RUNTIME_CONFIG_DEFAULTS,
  RUNTIME_CONFIG_FAIL_SAFE,
} from '@cloudcad/contracts/runtime-config/defaults';
import { runtimeConfigControllerGetPublicConfigs } from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import { STALE_TIME_DEFAULT } from '@/constants/timeouts';
import { setUploadMaxFileSize } from '@/utils/mxcadUploadUtils';
import type { RuntimeBrandConfig } from '@/constants/appConfig';

export type PublicRuntimeConfig = {
  mailEnabled: boolean;
  requireEmailVerification: boolean;
  smsEnabled: boolean;
  requirePhoneVerification: boolean;
  supportEmail: string;
  supportPhone: string;
  /** 客服服务时间（客服弹框）；留空回落品牌档案整块 support.hours → config.json → 内置默认 */
  supportHours: string;
  /** 帮助文档地址（「实时协同」提示里的「查看文档」链接） */
  docsUrl: string;
  /** 品牌标题（页签标题 + 认证页品牌名）；留空回落品牌档案整块 title → config.json → 内置默认 */
  brandTitle: string;
  /** 侧边栏品牌副标题；留空回落品牌档案整块 subtitle → config.json → 内置默认 */
  brandSubtitle: string;
  /** 品牌标语（登录/认证页）；留空回落品牌档案整块 tagline → config.json → 内置默认 */
  brandTagline: string;
  /** Logo URL（favicon + 认证页 Logo）；留空回落品牌档案整块 logo → config.json → 内置默认 */
  brandLogo: string;
  /**
   * CAD 编辑器标题栏标题（编辑器 ini 的 title/headerTitle）。
   * 刻意独立于 brandTitle：那是平台品牌名（页签 + 认证页），改它不应带动编辑器文案。
   * 留空时使用编辑器 ini 自带的值。
   */
  brandEditorTitle: string;
  /** 版权行模板（{year}/{appName} 占位符）；留空回落品牌档案整块 copyrightLine → config.json → 内置默认 */
  brandCopyrightLine: string;
  /** 版权年份（版权行 {year} 取值）；留空回落品牌档案整块 copyrightYear → config.json → 内置默认 */
  brandCopyrightYear: string;
  /** 版权持有方（法务条款/页脚）；留空回落品牌档案整块 copyrightHolder → config.json → 内置默认 */
  brandCopyrightHolder: string;
  /** 法务产品全称（法务条款正文）；留空回落品牌档案整块 legal.productName → 内置按语言值 */
  brandLegalProductName: string;
  /** 法务产品短名（i18n 插值）；留空回落品牌档案整块 legal.productShortName → 内置默认 */
  brandLegalProductShortName: string;
  allowRegister: boolean;
  /** 注册赠送会员开关：开启时注册页展示「注册即送 VIP 免费试用」营销吸引点 */
  registerGiftEnabled: boolean;
  /** 注册赠送会员月数（注册页营销提示展示；月 = 30 天） */
  registerGiftMonths: number;
  wechatEnabled: boolean;
  wechatAutoRegister: boolean;
  maxFileSize: number;
  collaborationEnabled: boolean;
  /** 协同功能域名白名单（逗号分隔，为空则不限制） */
  collaborationDomains: string;
  batchDownloadEnabled: boolean;
  /** 免费用户（含游客）是否允许导出下载转换（mxweb 转其他格式） */
  freeExportDownloadEnabled: boolean;
  /** 会员中心开关：关闭时不显示会员相关界面（原 VITE_MEMBERSHIP_ENABLED 构建期常量已改为运行时配置） */
  membershipEnabled: boolean;
  /** 注销冷静期天数：期间重新登录自动取消注销，逾期需联系客服恢复 */
  userCancelGraceDays: number;
  /** 安全模式：secure=等保收紧 / normal=便利优先（ADR-0077） */
  securityMode: 'secure' | 'normal';
  /** 口令策略：最小长度（后端 passwordPolicyMinLength 生效值；旧后端无此键时回落 10） */
  passwordPolicyMinLength: number;
  /** 口令策略：至少需要的字符类别数（后端 passwordPolicyMinCategories 生效值；回落 3） */
  passwordPolicyMinCategories: number;
  /** 品牌档案（标题/标语/Logo/版权/法务主体），覆盖前端内置默认值与 config.json */
  brandProfile: RuntimeBrandConfig;
  /** 匿名反馈开关：关闭后未登录用户无法提交反馈（登录用户不受影响） */
  feedbackAnonymousEnabled: boolean;
  /** 匿名每日每 IP 提交上限 */
  feedbackAnonymousDailyLimit: number;
  /** 登录用户每日提交上限 */
  feedbackUserDailyLimit: number;
  /** 反馈内容最短字数 */
  feedbackMinContentLength: number;
  /** 反馈内容最长字数 */
  feedbackMaxContentLength: number;
  /** 反馈图片附件单张上限（MB） */
  feedbackMaxImageSize: number;
  /** 反馈图纸附件单文件上限（MB） */
  feedbackMaxDrawingSize: number;
  /** 反馈文档附件单文件上限（MB） */
  feedbackMaxDocumentSize: number;
  /** 单条反馈图片附件数量上限 */
  feedbackMaxImageCount: number;
  /** 单条反馈图纸附件数量上限 */
  feedbackMaxDrawingCount: number;
  /** 单条反馈文档附件数量上限 */
  feedbackMaxDocumentCount: number;
  /** 单条反馈附件总数上限 */
  feedbackMaxAttachmentCount: number;
};

interface RuntimeConfigContextType {
  config: PublicRuntimeConfig;
  loading: boolean;
}

/**
 * 公开配置字段描述符 —— 「后端键 → 前端平铺键 → 类型收敛」的唯一事实源。
 *
 * 收敛自原先三张平行表（`PublicRuntimeConfig` 类型 / `DEFAULT_CONFIG` / `mapPublicConfig`）：
 * 现在类型仍是接口（seam），但默认值与映射都从本注册表派生，新增一个公开键只改这一处
 * （外加 contracts 的 RUNTIME_CONFIG_DEFAULTS 与后端 constants），不再三处重复。
 *
 * 注意保留的历史差异（勿「统一」掉）：
 * - `mailEnabled/smsEnabled/requireEmailVerification/requirePhoneVerification` 是 `Boolean(v)`
 *   **不带** `?? 默认`——接口返回缺键时收敛为 false，而非出厂默认（历史行为）。
 * - 口令策略两键回落到 `RUNTIME_CONFIG_FAIL_SAFE`（secure 基线），非出厂默认。
 * - 反馈键在后端是点分形（`feedback.minContentLength`），此处 `backendKey` 承担映射。
 */
type PublicConfigField = {
  key: keyof PublicRuntimeConfig;
  /** 后端返回的键名；缺省 = 前端平铺键 */
  backendKey?: string;
  /** 类型收敛（`value` 可能为字符串/数组脏值），`fallback` 由字段声明 */
  coerce: (value: unknown, fallback: unknown) => unknown;
  /** 接口失败/缺键时的回退值 */
  fallback: unknown;
};

const PUBLIC_CONFIG_FIELDS = [
  // 布尔（不带默认回退，历史行为）：Boolean(缺键) = false
  { key: 'mailEnabled', coerce: (v: unknown) => Boolean(v), fallback: RUNTIME_CONFIG_DEFAULTS.mailEnabled },
  { key: 'requireEmailVerification', coerce: (v: unknown) => Boolean(v), fallback: RUNTIME_CONFIG_DEFAULTS.requireEmailVerification },
  { key: 'smsEnabled', coerce: (v: unknown) => Boolean(v), fallback: RUNTIME_CONFIG_DEFAULTS.smsEnabled },
  { key: 'requirePhoneVerification', coerce: (v: unknown) => Boolean(v), fallback: RUNTIME_CONFIG_DEFAULTS.requirePhoneVerification },
  // 字符串（带默认回退）
  { key: 'supportEmail', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.supportEmail },
  { key: 'supportPhone', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.supportPhone },
  { key: 'supportHours', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.supportHours },
  { key: 'docsUrl', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.docsUrl },
  { key: 'brandTitle', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.brandTitle },
  { key: 'brandSubtitle', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.brandSubtitle },
  { key: 'brandTagline', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.brandTagline },
  { key: 'brandLogo', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.brandLogo },
  // 编辑器专属标题面：缺键（旧后端未上线）回落空串 = 使用编辑器 ini 自带值
  { key: 'brandEditorTitle', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.brandEditorTitle },
  { key: 'brandCopyrightLine', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.brandCopyrightLine },
  { key: 'brandCopyrightYear', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.brandCopyrightYear },
  { key: 'brandCopyrightHolder', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.brandCopyrightHolder },
  { key: 'brandLegalProductName', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.brandLegalProductName },
  { key: 'brandLegalProductShortName', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.brandLegalProductShortName },
  // 布尔（带默认回退）
  { key: 'allowRegister', coerce: (v: unknown, fb: unknown) => Boolean(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.allowRegister },
  // 缺键回落开启（与后端默认一致）：旧后端未公开该键时注册页仍展示营销吸引点
  { key: 'registerGiftEnabled', coerce: (v: unknown, fb: unknown) => Boolean(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.registerGiftEnabled },
  { key: 'registerGiftMonths', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.registerGiftMonths },
  { key: 'wechatEnabled', coerce: (v: unknown, fb: unknown) => Boolean(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.wechatEnabled },
  { key: 'wechatAutoRegister', coerce: (v: unknown, fb: unknown) => Boolean(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.wechatAutoRegister },
  { key: 'maxFileSize', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.maxFileSize },
  { key: 'collaborationEnabled', coerce: (v: unknown, fb: unknown) => Boolean(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.collaborationEnabled },
  { key: 'collaborationDomains', coerce: (v: unknown, fb: unknown) => String(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.collaborationDomains },
  { key: 'batchDownloadEnabled', coerce: (v: unknown, fb: unknown) => Boolean(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.batchDownloadEnabled },
  // 缺键回落开启（同 membershipEnabled）：配置拉取结果缺键不能把免费导出静默关掉
  { key: 'freeExportDownloadEnabled', coerce: (v: unknown, fb: unknown) => Boolean(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.freeExportDownloadEnabled },
  // 缺键（旧后端未上线此键）回落开启：配置拉取结果缺键不能把会员中心整块藏掉
  { key: 'membershipEnabled', coerce: (v: unknown, fb: unknown) => Boolean(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.membershipEnabled },
  { key: 'userCancelGraceDays', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.userCancelGraceDays },
  // 枚举
  { key: 'securityMode', coerce: (v: unknown, fb: unknown) => (v === 'secure' ? 'secure' : fb), fallback: RUNTIME_CONFIG_DEFAULTS.securityMode },
  // 口令策略：旧后端未公开该两键（isPublic 未回填）时回落刻意 fail-safe（secure 基线）
  { key: 'passwordPolicyMinLength', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_FAIL_SAFE.passwordPolicyMinLength },
  { key: 'passwordPolicyMinCategories', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_FAIL_SAFE.passwordPolicyMinCategories },
  // 品牌档案对象
  { key: 'brandProfile', coerce: (v: unknown) => toBrandConfig(v), fallback: {} },
  // 反馈配置：后端键为点分形，前端类型为平铺形，backendKey 承担映射；缺键回落后端默认值
  { key: 'feedbackAnonymousEnabled', backendKey: 'feedback.anonymousEnabled', coerce: (v: unknown, fb: unknown) => Boolean(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.feedbackAnonymousEnabled },
  { key: 'feedbackAnonymousDailyLimit', backendKey: 'feedback.anonymousDailyLimit', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.feedbackAnonymousDailyLimit },
  { key: 'feedbackUserDailyLimit', backendKey: 'feedback.userDailyLimit', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.feedbackUserDailyLimit },
  { key: 'feedbackMinContentLength', backendKey: 'feedback.minContentLength', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.feedbackMinContentLength },
  { key: 'feedbackMaxContentLength', backendKey: 'feedback.maxContentLength', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.feedbackMaxContentLength },
  { key: 'feedbackMaxImageSize', backendKey: 'feedback.maxImageSize', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.feedbackMaxImageSize },
  { key: 'feedbackMaxDrawingSize', backendKey: 'feedback.maxDrawingSize', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.feedbackMaxDrawingSize },
  { key: 'feedbackMaxDocumentSize', backendKey: 'feedback.maxDocumentSize', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.feedbackMaxDocumentSize },
  { key: 'feedbackMaxImageCount', backendKey: 'feedback.maxImageCount', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.feedbackMaxImageCount },
  { key: 'feedbackMaxDrawingCount', backendKey: 'feedback.maxDrawingCount', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.feedbackMaxDrawingCount },
  { key: 'feedbackMaxDocumentCount', backendKey: 'feedback.maxDocumentCount', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.feedbackMaxDocumentCount },
  { key: 'feedbackMaxAttachmentCount', backendKey: 'feedback.maxAttachmentCount', coerce: (v: unknown, fb: unknown) => Number(v ?? fb), fallback: RUNTIME_CONFIG_DEFAULTS.feedbackMaxAttachmentCount },
] as const satisfies readonly {
  key: keyof PublicRuntimeConfig;
  backendKey?: string;
  coerce: (value: unknown, fallback: unknown) => unknown;
  fallback: unknown;
}[];

// 编译期穷尽检查：注册表必须覆盖 PublicRuntimeConfig 的全部键，缺一个即编译错。
type FieldKey = (typeof PUBLIC_CONFIG_FIELDS)[number]['key'];
type _ExhaustiveCheck = Exclude<keyof PublicRuntimeConfig, FieldKey> extends never
  ? 'OK'
  : 'MISSING';
const _exhaustive: _ExhaustiveCheck = 'OK';

// 迭代用宽化视图（字面数组的元素类型过窄，backendKey 只在部分成员声明）
const PUBLIC_CONFIG_FIELD_LIST: readonly PublicConfigField[] = PUBLIC_CONFIG_FIELDS;

const RuntimeConfigContext = createContext<
  RuntimeConfigContextType | undefined
>(undefined);

export const useRuntimeConfig = () => {
  const context = useContext(RuntimeConfigContext);
  if (context === undefined) {
    throw new Error(
      'useRuntimeConfig must be used within a RuntimeConfigProvider'
    );
  }
  return context;
};

interface RuntimeConfigProviderProps {
  children: ReactNode;
}

/** 公开配置值：绝大多数是标量，`brandProfile` 是对象（后端 json 类型） */
type PublicConfigValue = string | number | boolean | Record<string, unknown>;

/** 把可能是字符串/数组的脏值安全收敛为品牌档案对象，非法输入视为空覆盖 */
function toBrandConfig(value: unknown): RuntimeBrandConfig {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RuntimeBrandConfig)
    : {};
}

// 兜底值全部来自注册表（fallback 由各字段声明，引用 contracts 的 RUNTIME_CONFIG_DEFAULTS / FAIL_SAFE）
const DEFAULT_CONFIG = PUBLIC_CONFIG_FIELD_LIST.reduce((acc, field) => {
  (acc as Record<string, unknown>)[field.key] = field.fallback;
  return acc;
}, {} as PublicRuntimeConfig);

function mapPublicConfig(
  data: Record<string, PublicConfigValue>
): PublicRuntimeConfig {
  const out = {} as Record<string, unknown>;
  for (const field of PUBLIC_CONFIG_FIELD_LIST) {
    const raw = data[field.backendKey ?? field.key];
    out[field.key] = field.coerce(raw, field.fallback);
  }
  return out as PublicRuntimeConfig;
}

async function fetchPublicConfigs(): Promise<PublicRuntimeConfig> {
  const result = await runtimeConfigControllerGetPublicConfigs({
    throwOnError: true,
  });
  // SDK 默认不抛错：显式抛出使 react-query 进入 error 态，
  // 上层 useEffect 能记录真实失败原因（UI 仍按设计回退 DEFAULT_CONFIG）
  const data = (result.data ?? {}) as Record<string, PublicConfigValue>;
  return mapPublicConfig(data);
}

/** 把公开配置的 maxFileSize（MB）同步进 mxcadUploadUtils 模块缓存（单一同步点，非 React 消费者经 fetchMaxFileSizeFromBackend 读取） */
function useSyncMaxFileSize(maxFileSize: number): void {
  React.useEffect(() => {
    setUploadMaxFileSize(maxFileSize);
  }, [maxFileSize]);
}

export const RuntimeConfigProvider: React.FC<RuntimeConfigProviderProps> = ({
  children,
}) => {
  // server 配置统一走 react-query（ADR-0030）；失败时回退 DEFAULT_CONFIG
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.runtimeConfig.public,
    queryFn: fetchPublicConfigs,
    staleTime: STALE_TIME_DEFAULT,
  });

  React.useEffect(() => {
    if (error) {
      console.error('加载运行时配置失败:', error);
    }
  }, [error]);

  const config = data ?? DEFAULT_CONFIG;
  useSyncMaxFileSize(config.maxFileSize);

  return (
    <RuntimeConfigContext.Provider
      value={{ config: data ?? DEFAULT_CONFIG, loading: isLoading }}
    >
      {children}
    </RuntimeConfigContext.Provider>
  );
};
