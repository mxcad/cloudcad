import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { runtimeConfigApi } from '../services/runtimeConfigApi';

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
};

interface RuntimeConfigContextType {
  config: PublicRuntimeConfig;
  loading: boolean;
  refreshConfig: () => Promise<void>;
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

export const RuntimeConfigProvider: React.FC<RuntimeConfigProviderProps> = ({
  children,
}) => {
  const [config, setConfig] = useState<PublicRuntimeConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const refreshConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await runtimeConfigApi.getPublicConfigs();
      const data = response.data as Record<string, string | number | boolean>;
      setConfig({
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
      });
    } catch (error) {
      console.error('加载运行时配置失败:', error);
      // 加载失败时使用默认配置
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  const value = useMemo<RuntimeConfigContextType>(
    () => ({
      config,
      loading,
      refreshConfig,
    }),
    [config, loading, refreshConfig]
  );

  return (
    <RuntimeConfigContext.Provider value={value}>
      {children}
    </RuntimeConfigContext.Provider>
  );
};
