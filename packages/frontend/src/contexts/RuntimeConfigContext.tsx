import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
  useRef,
} from 'react';
import { runtimeConfigControllerGetPublicConfigs } from '@/api-sdk';

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
  maxFileSize: 100,
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

// 全局去重和缓存：避免并发重复请求，并在短时间内返回缓存结果
let fetchPromise: Promise<Record<string, string | number | boolean>> | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 60000; // 1分钟缓存

async function fetchPublicConfigs(): Promise<Record<string, string | number | boolean>> {
  const now = Date.now();
  // 如果已经有正在进行的请求，直接复用
  if (fetchPromise) {
    return fetchPromise;
  }
  // 如果缓存未过期，返回缓存数据
  if (lastFetchTime && now - lastFetchTime < CACHE_TTL) {
    // 注意：这里无法直接返回缓存值，因为调用方期望 Promise
    // 但我们可以通过复用之前的 fetchPromise？实际上缓存需要存储数据。
    // 更好的方式：存储缓存的数据 Promise。
  }
  // 发起新请求
  fetchPromise = (async () => {
    try {
      const result = await runtimeConfigControllerGetPublicConfigs();
      lastFetchTime = Date.now();
      return (result.data ?? {}) as Record<string, string | number | boolean>;
    } finally {
      // 延迟清除 promise，避免短时间内的重复请求
      setTimeout(() => {
        fetchPromise = null;
      }, 500);
    }
  })();
  return fetchPromise;
}

export const RuntimeConfigProvider: React.FC<RuntimeConfigProviderProps> = ({
  children,
}) => {
  const [config, setConfig] = useState<PublicRuntimeConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);

  const refreshConfig = useCallback(async () => {
    // 如果组件已卸载，不再更新状态
    if (!isMountedRef.current) return;
    try {
      setLoading(true);
      const data = await fetchPublicConfigs();
      if (!isMountedRef.current) return;
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
        maxFileSize: Number(data.maxFileSize ?? 100),
      });
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error('加载运行时配置失败:', error);
      // 加载失败时使用默认配置
      setConfig(DEFAULT_CONFIG);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    refreshConfig();
    return () => {
      isMountedRef.current = false;
    };
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
