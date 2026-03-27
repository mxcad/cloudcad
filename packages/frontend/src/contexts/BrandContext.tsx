import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { fetchBrandConfig, type BrandConfig } from '../constants/appConfig';

interface BrandContextValue {
  config: BrandConfig | null;
  loading: boolean;
}

const BrandContext = createContext<BrandContextValue>({
  config: null,
  loading: true,
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<BrandConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
