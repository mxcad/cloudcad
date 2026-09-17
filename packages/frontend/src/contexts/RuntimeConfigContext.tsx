import React, { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { runtimeConfigControllerGetPublicConfigs } from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import { STALE_TIME_DEFAULT } from '@/constants/timeouts';
import { setUploadMaxFileSize } from '@/utils/mxcadUploadUtils';

export type PublicRuntimeConfig = {
  mailEnabled: boolean;
  requireEmailVerification: boolean;
  smsEnabled: boolean;
  requirePhoneVerification: boolean;
  supportEmail: string;
  supportPhone: string;
  allowRegister: boolean;
  systemNotice: string;
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
  allowRegister: true,
  systemNotice: '',
  wechatEnabled: false,
  wechatAutoRegister: false,
  maxFileSize: 100,
  collaborationEnabled: false,
  collaborationDomains: '',
  batchDownloadEnabled: false,
  freeExportDownloadEnabled: false,
  userCancelGraceDays: 7,
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

function mapPublicConfig(
  data: Record<string, string | number | boolean>
): PublicRuntimeConfig {
  return {
    mailEnabled: Boolean(data.mailEnabled),
    requireEmailVerification: Boolean(data.requireEmailVerification),
    smsEnabled: Boolean(data.smsEnabled),
    requirePhoneVerification: Boolean(data.requirePhoneVerification),
    supportEmail: String(data.supportEmail ?? ''),
    supportPhone: String(data.supportPhone ?? ''),
    allowRegister: Boolean(data.allowRegister ?? true),
    systemNotice: String(data.systemNotice ?? ''),
    wechatEnabled: Boolean(data.wechatEnabled ?? false),
    wechatAutoRegister: Boolean(data.wechatAutoRegister ?? false),
    maxFileSize: Number(data.maxFileSize ?? 100),
    collaborationEnabled: Boolean(data.collaborationEnabled ?? false),
    collaborationDomains: String(data.collaborationDomains ?? ''),
    batchDownloadEnabled: Boolean(data.batchDownloadEnabled ?? false),
    freeExportDownloadEnabled: Boolean(data.freeExportDownloadEnabled ?? false),
    userCancelGraceDays: Number(data.userCancelGraceDays ?? 7),
  };
}

async function fetchPublicConfigs(): Promise<PublicRuntimeConfig> {
  const result = await runtimeConfigControllerGetPublicConfigs();
  // SDK 默认不抛错：显式抛出使 react-query 进入 error 态，
  // 上层 useEffect 能记录真实失败原因（UI 仍按设计回退 DEFAULT_CONFIG）
  if (result.error) throw result.error;
  const data = (result.data ?? {}) as Record<string, string | number | boolean>;
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
