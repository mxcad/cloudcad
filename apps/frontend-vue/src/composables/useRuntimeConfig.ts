import { ref, readonly } from 'vue';
import { getApiClient } from '@/services/apiClient';

/**
 * 运行时配置 Composable
 *
 * 来源：apps/frontend/src/contexts/RuntimeConfigContext.tsx
 * 照搬全部逻辑：从 /api/runtime-config/public 获取运行时配置
 */

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

// 模块级单例，避免每个组件实例都请求
const config = ref<PublicRuntimeConfig>({ ...DEFAULT_CONFIG });
const loading = ref(true);
let initialized = false;

async function refreshConfig(): Promise<void> {
  try {
    loading.value = true;
    const response = await getApiClient().get('/api/runtime-config/public');
    const data = response.data as Record<string, string | number | boolean>;
    config.value = {
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
    };
  } catch (error) {
    console.error('加载运行时配置失败:', error);
    config.value = { ...DEFAULT_CONFIG };
  } finally {
    loading.value = false;
  }
}

// 首次导入时自动加载
if (!initialized) {
  initialized = true;
  refreshConfig();
}

export function useRuntimeConfig() {
  return {
    config: readonly(config),
    loading: readonly(loading),
    refreshConfig,
  };
}
