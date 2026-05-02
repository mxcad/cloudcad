import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import {
  fetchBrandConfig,
  cachedBrandConfig,
  type BrandConfig,
} from '../constants/appConfig';

interface BrandContextValue {
  config: BrandConfig | null;
  loading: boolean;
}

const BrandContext = createContext<BrandContextValue>({
  config: null,
  loading: true,
});

export function BrandProvider({ children }: { children: ReactNode }) {
  // 使用缓存值初始化，避免重复请求和不必要的重渲染
  const [config, setConfig] = useState<BrandConfig | null>(
    cachedBrandConfig || null
  );
  const [loading, setLoading] = useState(!cachedBrandConfig);

  useEffect(() => {
    // 如果已有缓存，直接使用，不再请求
    if (cachedBrandConfig) {
      setConfig(cachedBrandConfig);
      setLoading(false);
      return;
    }

    // 否则发起请求
    fetchBrandConfig().then((cfg) => {
      setConfig(cfg);
      setLoading(false);
    });
  }, []);

  return (
    <BrandContext.Provider value={{ config, loading }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrandConfig() {
  return useContext(BrandContext);
}

export { type BrandConfig };
