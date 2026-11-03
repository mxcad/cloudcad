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

// 兜底值全部来自 @cloudcad/contracts 的 RUNTIME_CONFIG_DEFAULTS（与后端 defaultValue 同一事实源），
// 口令策略两键刻意用 RUNTIME_CONFIG_FAIL_SAFE（secure 基线 10/3，接口失败回退到更严侧）。
const DEFAULT_CONFIG: PublicRuntimeConfig = {
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
  brandEditorTitle: RUNTIME_CONFIG_DEFAULTS.brandEditorTitle,
  brandCopyrightLine: RUNTIME_CONFIG_DEFAULTS.brandCopyrightLine,
  brandCopyrightYear: RUNTIME_CONFIG_DEFAULTS.brandCopyrightYear,
  brandCopyrightHolder: RUNTIME_CONFIG_DEFAULTS.brandCopyrightHolder,
  brandLegalProductName: RUNTIME_CONFIG_DEFAULTS.brandLegalProductName,
  brandLegalProductShortName: RUNTIME_CONFIG_DEFAULTS.brandLegalProductShortName,
  allowRegister: RUNTIME_CONFIG_DEFAULTS.allowRegister,
  registerGiftEnabled: RUNTIME_CONFIG_DEFAULTS.registerGiftEnabled,
  registerGiftMonths: RUNTIME_CONFIG_DEFAULTS.registerGiftMonths,
  wechatEnabled: RUNTIME_CONFIG_DEFAULTS.wechatEnabled,
  wechatAutoRegister: RUNTIME_CONFIG_DEFAULTS.wechatAutoRegister,
  maxFileSize: RUNTIME_CONFIG_DEFAULTS.maxFileSize,
  collaborationEnabled: RUNTIME_CONFIG_DEFAULTS.collaborationEnabled,
  collaborationDomains: RUNTIME_CONFIG_DEFAULTS.collaborationDomains,
  batchDownloadEnabled: RUNTIME_CONFIG_DEFAULTS.batchDownloadEnabled,
  freeExportDownloadEnabled: RUNTIME_CONFIG_DEFAULTS.freeExportDownloadEnabled,
  membershipEnabled: RUNTIME_CONFIG_DEFAULTS.membershipEnabled,
  userCancelGraceDays: RUNTIME_CONFIG_DEFAULTS.userCancelGraceDays,
  securityMode: RUNTIME_CONFIG_DEFAULTS.securityMode,
  // 刻意 fail-safe（接口失败回退到 secure 基线），见 contracts RUNTIME_CONFIG_FAIL_SAFE
  passwordPolicyMinLength: RUNTIME_CONFIG_FAIL_SAFE.passwordPolicyMinLength,
  passwordPolicyMinCategories: RUNTIME_CONFIG_FAIL_SAFE.passwordPolicyMinCategories,
  brandProfile: {},
  // 反馈配置（缺键回落后端默认值，见 contracts RUNTIME_CONFIG_DEFAULTS feedback.*）
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
};

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

function mapPublicConfig(
  data: Record<string, PublicConfigValue>
): PublicRuntimeConfig {
  return {
    mailEnabled: Boolean(data.mailEnabled),
    requireEmailVerification: Boolean(data.requireEmailVerification),
    smsEnabled: Boolean(data.smsEnabled),
    requirePhoneVerification: Boolean(data.requirePhoneVerification),
    supportEmail: String(data.supportEmail ?? RUNTIME_CONFIG_DEFAULTS.supportEmail),
    supportPhone: String(data.supportPhone ?? RUNTIME_CONFIG_DEFAULTS.supportPhone),
    supportHours: String(data.supportHours ?? RUNTIME_CONFIG_DEFAULTS.supportHours),
    docsUrl: String(data.docsUrl ?? RUNTIME_CONFIG_DEFAULTS.docsUrl),
    brandTitle: String(data.brandTitle ?? RUNTIME_CONFIG_DEFAULTS.brandTitle),
    brandSubtitle: String(data.brandSubtitle ?? RUNTIME_CONFIG_DEFAULTS.brandSubtitle),
    brandTagline: String(data.brandTagline ?? RUNTIME_CONFIG_DEFAULTS.brandTagline),
    brandLogo: String(data.brandLogo ?? RUNTIME_CONFIG_DEFAULTS.brandLogo),
    // 编辑器专属标题面：缺键（旧后端未上线）回落空串 = 使用编辑器 ini 自带值
    brandEditorTitle: String(data.brandEditorTitle ?? RUNTIME_CONFIG_DEFAULTS.brandEditorTitle),
    brandCopyrightLine: String(data.brandCopyrightLine ?? RUNTIME_CONFIG_DEFAULTS.brandCopyrightLine),
    brandCopyrightYear: String(data.brandCopyrightYear ?? RUNTIME_CONFIG_DEFAULTS.brandCopyrightYear),
    brandCopyrightHolder: String(data.brandCopyrightHolder ?? RUNTIME_CONFIG_DEFAULTS.brandCopyrightHolder),
    brandLegalProductName: String(data.brandLegalProductName ?? RUNTIME_CONFIG_DEFAULTS.brandLegalProductName),
    brandLegalProductShortName: String(data.brandLegalProductShortName ?? RUNTIME_CONFIG_DEFAULTS.brandLegalProductShortName),
    allowRegister: Boolean(data.allowRegister ?? RUNTIME_CONFIG_DEFAULTS.allowRegister),
    // 缺键回落开启（与后端默认一致）：旧后端未公开该键时注册页仍展示营销吸引点
    registerGiftEnabled: Boolean(data.registerGiftEnabled ?? RUNTIME_CONFIG_DEFAULTS.registerGiftEnabled),
    registerGiftMonths: Number(data.registerGiftMonths ?? RUNTIME_CONFIG_DEFAULTS.registerGiftMonths),
    wechatEnabled: Boolean(data.wechatEnabled ?? RUNTIME_CONFIG_DEFAULTS.wechatEnabled),
    wechatAutoRegister: Boolean(data.wechatAutoRegister ?? RUNTIME_CONFIG_DEFAULTS.wechatAutoRegister),
    maxFileSize: Number(data.maxFileSize ?? RUNTIME_CONFIG_DEFAULTS.maxFileSize),
    collaborationEnabled: Boolean(data.collaborationEnabled ?? RUNTIME_CONFIG_DEFAULTS.collaborationEnabled),
    collaborationDomains: String(data.collaborationDomains ?? RUNTIME_CONFIG_DEFAULTS.collaborationDomains),
    batchDownloadEnabled: Boolean(data.batchDownloadEnabled ?? RUNTIME_CONFIG_DEFAULTS.batchDownloadEnabled),
    // 缺键回落开启（同 membershipEnabled）：配置拉取结果缺键不能把免费导出静默关掉
    freeExportDownloadEnabled: Boolean(data.freeExportDownloadEnabled ?? RUNTIME_CONFIG_DEFAULTS.freeExportDownloadEnabled),
    // 缺键（旧后端未上线此键）回落开启：配置拉取结果缺键不能把会员中心整块藏掉
    membershipEnabled: Boolean(data.membershipEnabled ?? RUNTIME_CONFIG_DEFAULTS.membershipEnabled),
    userCancelGraceDays: Number(data.userCancelGraceDays ?? RUNTIME_CONFIG_DEFAULTS.userCancelGraceDays),
    securityMode: data.securityMode === 'secure' ? 'secure' : RUNTIME_CONFIG_DEFAULTS.securityMode,
    // 旧后端未公开该两键（isPublic 未回填）时回落刻意 fail-safe（secure 基线）
    passwordPolicyMinLength: Number(data.passwordPolicyMinLength ?? RUNTIME_CONFIG_FAIL_SAFE.passwordPolicyMinLength),
    passwordPolicyMinCategories: Number(data.passwordPolicyMinCategories ?? RUNTIME_CONFIG_FAIL_SAFE.passwordPolicyMinCategories),
    brandProfile: toBrandConfig(data.brandProfile),
    // 反馈配置：后端键为点分形（feedback.minContentLength），前端类型为平铺形，此处做映射；
    // 缺键回落后端默认值（见 contracts RUNTIME_CONFIG_DEFAULTS feedback.*）
    feedbackAnonymousEnabled: Boolean(data['feedback.anonymousEnabled'] ?? RUNTIME_CONFIG_DEFAULTS.feedbackAnonymousEnabled),
    feedbackAnonymousDailyLimit: Number(data['feedback.anonymousDailyLimit'] ?? RUNTIME_CONFIG_DEFAULTS.feedbackAnonymousDailyLimit),
    feedbackUserDailyLimit: Number(data['feedback.userDailyLimit'] ?? RUNTIME_CONFIG_DEFAULTS.feedbackUserDailyLimit),
    feedbackMinContentLength: Number(data['feedback.minContentLength'] ?? RUNTIME_CONFIG_DEFAULTS.feedbackMinContentLength),
    feedbackMaxContentLength: Number(data['feedback.maxContentLength'] ?? RUNTIME_CONFIG_DEFAULTS.feedbackMaxContentLength),
    feedbackMaxImageSize: Number(data['feedback.maxImageSize'] ?? RUNTIME_CONFIG_DEFAULTS.feedbackMaxImageSize),
    feedbackMaxDrawingSize: Number(data['feedback.maxDrawingSize'] ?? RUNTIME_CONFIG_DEFAULTS.feedbackMaxDrawingSize),
    feedbackMaxDocumentSize: Number(data['feedback.maxDocumentSize'] ?? RUNTIME_CONFIG_DEFAULTS.feedbackMaxDocumentSize),
    feedbackMaxImageCount: Number(data['feedback.maxImageCount'] ?? RUNTIME_CONFIG_DEFAULTS.feedbackMaxImageCount),
    feedbackMaxDrawingCount: Number(data['feedback.maxDrawingCount'] ?? RUNTIME_CONFIG_DEFAULTS.feedbackMaxDrawingCount),
    feedbackMaxDocumentCount: Number(data['feedback.maxDocumentCount'] ?? RUNTIME_CONFIG_DEFAULTS.feedbackMaxDocumentCount),
    feedbackMaxAttachmentCount: Number(data['feedback.maxAttachmentCount'] ?? RUNTIME_CONFIG_DEFAULTS.feedbackMaxAttachmentCount),
  };
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

  // 同步 maxFileSize 到 mxcadUploadUtils 模块变量（非 React 消费者如 mxcadManager 依赖此值）
  const config = data ?? DEFAULT_CONFIG;
  React.useEffect(() => {
    setUploadMaxFileSize(config.maxFileSize);
  }, [config.maxFileSize]);

  return (
    <RuntimeConfigContext.Provider
      value={{ config: data ?? DEFAULT_CONFIG, loading: isLoading }}
    >
      {children}
    </RuntimeConfigContext.Provider>
  );
};
