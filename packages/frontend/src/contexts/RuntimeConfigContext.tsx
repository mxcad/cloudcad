import React, { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  allowRegister: boolean;
  wechatEnabled: boolean;
  wechatAutoRegister: boolean;
  maxFileSize: number;
  collaborationEnabled: boolean;
  /** 协同功能域名白名单（逗号分隔，为空则不限制） */
  collaborationDomains: string;
  batchDownloadEnabled: boolean;
  /** 免费用户（含游客）是否允许导出下载转换（mxweb 转其他格式） */
  freeExportDownloadEnabled: boolean;
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
};

interface RuntimeConfigContextType {
  config: PublicRuntimeConfig;
  loading: boolean;
}

const DEFAULT_CONFIG: PublicRuntimeConfig = {
  mailEnabled: false,
  requireEmailVerification: false,
  smsEnabled: false,
  requirePhoneVerification: false,
  supportEmail: '',
  supportPhone: '',
  docsUrl: '',
  brandTitle: '',
  brandSubtitle: '',
  brandTagline: '',
  brandLogo: '',
  allowRegister: true,
  wechatEnabled: false,
  wechatAutoRegister: false,
  maxFileSize: 100,
  collaborationEnabled: true,
  collaborationDomains: '',
  batchDownloadEnabled: false,
  freeExportDownloadEnabled: false,
  userCancelGraceDays: 7,
  securityMode: 'normal',
  // 回落值 = 后端 secure 基线默认（与 @cloudcad/platform 的 PASSWORD_POLICY 兜底一致）
  passwordPolicyMinLength: 10,
  passwordPolicyMinCategories: 3,
  brandProfile: {},
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
    supportEmail: String(data.supportEmail ?? ''),
    supportPhone: String(data.supportPhone ?? ''),
    docsUrl: String(data.docsUrl ?? ''),
    brandTitle: String(data.brandTitle ?? ''),
    brandSubtitle: String(data.brandSubtitle ?? ''),
    brandTagline: String(data.brandTagline ?? ''),
    brandLogo: String(data.brandLogo ?? ''),
    allowRegister: Boolean(data.allowRegister ?? true),
    wechatEnabled: Boolean(data.wechatEnabled ?? false),
    wechatAutoRegister: Boolean(data.wechatAutoRegister ?? false),
    maxFileSize: Number(data.maxFileSize ?? 100),
    collaborationEnabled: Boolean(data.collaborationEnabled ?? true),
    collaborationDomains: String(data.collaborationDomains ?? ''),
    batchDownloadEnabled: Boolean(data.batchDownloadEnabled ?? false),
    freeExportDownloadEnabled: Boolean(data.freeExportDownloadEnabled ?? false),
    userCancelGraceDays: Number(data.userCancelGraceDays ?? 7),
    securityMode: data.securityMode === 'secure' ? 'secure' : 'normal',
    // 旧后端未公开该两键（isPublic 未回填）时回落 secure 基线默认
    passwordPolicyMinLength: Number(data.passwordPolicyMinLength ?? 10),
    passwordPolicyMinCategories: Number(data.passwordPolicyMinCategories ?? 3),
    brandProfile: toBrandConfig(data.brandProfile),
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
