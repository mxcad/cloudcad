import { ref, readonly } from 'vue';

/**
 * 品牌配置 Composable
 *
 * 来源：apps/frontend/src/contexts/BrandContext.tsx + constants/appConfig.ts
 * 照搬全部逻辑：从 /ini/brandConfig.json 获取品牌配置
 */

export interface BrandConfig {
  title: string;
  logo: string;
  description?: string;
}

const DEFAULT_BRAND: BrandConfig = {
  title: 'CloudCAD',
  logo: '/logo.png',
  description: '专业云端 CAD 图纸管理平台',
};

const config = ref<BrandConfig>({ ...DEFAULT_BRAND });
const loading = ref(true);
let initialized = false;

async function fetchBrandConfig(): Promise<BrandConfig> {
  try {
    const res = await fetch('/ini/brandConfig.json');
    if (!res.ok) return { ...DEFAULT_BRAND };
    const data = await res.json();
    return {
      title: data.title || DEFAULT_BRAND.title,
      logo: data.logo || DEFAULT_BRAND.logo,
      description: data.description || DEFAULT_BRAND.description,
    };
  } catch {
    return { ...DEFAULT_BRAND };
  }
}

async function loadBrandConfig(): Promise<void> {
  try {
    loading.value = true;
    const cfg = await fetchBrandConfig();
    config.value = cfg;
  } finally {
    loading.value = false;
  }
}

if (!initialized) {
  initialized = true;
  loadBrandConfig();
}

export function useBrandConfig() {
  return {
    config: readonly(config),
    loading: readonly(loading),
    refreshConfig: loadBrandConfig,
  };
}
