import { ref } from 'vue';
import { runtimeConfigControllerGetPublicConfigs } from '@/api-sdk';

export interface PublicRuntimeConfig {
  collaborationEnabled: boolean;
  /** 免费用户（含游客）是否允许导出下载转换（mxweb 转其他格式） */
  freeExportDownloadEnabled: boolean;
}

const config = ref<PublicRuntimeConfig>({
  collaborationEnabled: false,
  freeExportDownloadEnabled: false,
});

let fetched = false;
let fetchPromise: Promise<void> | null = null;

async function fetchConfig(): Promise<void> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = (async () => {
    try {
      const result = await runtimeConfigControllerGetPublicConfigs();
      const data = result.data as Record<string, unknown> | undefined;
      if (data) {
        config.value = {
          collaborationEnabled: Boolean(data.collaborationEnabled ?? false),
          freeExportDownloadEnabled: Boolean(
            data.freeExportDownloadEnabled ?? false
          ),
        };
      }
    } catch {
      // 保持默认值
    } finally {
      fetched = true;
    }
  })();
  return fetchPromise;
}

export function useRuntimeConfig() {
  const loading = ref(!fetched);

  if (!fetched) {
    fetchConfig().finally(() => {
      loading.value = false;
    });
  } else {
    loading.value = false;
  }

  return {
    config,
    loading,
  };
}
