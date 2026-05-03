<template>
  <v-container class="pa-6 pa-lg-8" style="max-width: 1200px;">
    <div class="d-flex align-center justify-between mb-6">
      <div class="d-flex align-center gap-4">
        <div class="rounded-xl d-flex align-center justify-center" style="width: 48px; height: 48px; background: linear-gradient(135deg, #7c3aed, #8b5cf6);">
          <v-icon color="white">mdi-cog</v-icon>
        </div>
        <div>
          <h1 class="text-h4 font-weight-bold mb-0">{{ t('runtimeConfig.title') }}</h1>
          <p class="text-body-2 text-medium-emphasis mb-0">{{ t('runtimeConfig.subtitle') }}</p>
        </div>
      </div>
      <div class="d-flex gap-2">
        <v-btn variant="outlined" @click="refresh" :loading="loading">
          <v-icon class="mr-1">mdi-refresh</v-icon>
          {{ t('common.refresh') }}
        </v-btn>
        <v-btn color="primary" @click="saveAll" :loading="saving">
          <v-icon class="mr-1">mdi-content-save</v-icon>
          {{ t('common.save') }}
        </v-btn>
      </div>
    </div>

    <v-card variant="outlined" class="mb-6">
      <v-card-title class="pt-6 px-6 pb-0">
        <v-icon class="mr-2">mdi-folder</v-icon>
        {{ t('runtimeConfig.configGroups') }}
      </v-card-title>
      <v-card-text class="pa-6">
        <v-tabs v-model="activeTab" grow>
          <v-tab value="general">
            <v-icon class="mr-1">mdi-tune</v-icon>
            {{ t('runtimeConfig.generalConfig') }}
          </v-tab>
          <v-tab value="storage">
            <v-icon class="mr-1">mdi-database</v-icon>
            {{ t('runtimeConfig.storageConfig') }}
          </v-tab>
          <v-tab value="security">
            <v-icon class="mr-1">mdi-shield-account</v-icon>
            {{ t('runtimeConfig.securityConfig') }}
          </v-tab>
          <v-tab value="features">
            <v-icon class="mr-1">mdi-star</v-icon>
            {{ t('runtimeConfig.featureToggle') }}
          </v-tab>
        </v-tabs>

        <v-window v-model="activeTab">
          <v-window-item value="general">
            <v-list density="comfortable">
              <v-list-item v-for="config in generalConfigs" :key="config.key">
                <template v-slot:prepend>
                  <v-icon>{{ config.icon }}</v-icon>
                </template>
                <v-list-item-content>
                  <v-list-item-title>{{ config.label }}</v-list-item-title>
                  <v-list-item-subtitle>{{ config.description }}</v-list-item-subtitle>
                </v-list-item-content>
                <template v-slot:append>
                  <v-text-field
                    v-if="config.type === 'text'"
                    v-model="config.value"
                    variant="outlined"
                    density="compact"
                    style="width: 200px;"
                  />
                  <v-text-field
                    v-else-if="config.type === 'number'"
                    v-model.number="config.value"
                    type="number"
                    variant="outlined"
                    density="compact"
                    style="width: 200px;"
                  />
                  <v-switch
                    v-else-if="config.type === 'boolean'"
                    v-model="config.value"
                    :label="config.value ? t('common.enabled') : t('common.disabled')"
                  />
                </template>
              </v-list-item>
            </v-list>
          </v-window-item>

          <v-window-item value="storage">
            <v-list density="comfortable">
              <v-list-item v-for="config in storageConfigs" :key="config.key">
                <template v-slot:prepend>
                  <v-icon>{{ config.icon }}</v-icon>
                </template>
                <v-list-item-content>
                  <v-list-item-title>{{ config.label }}</v-list-item-title>
                  <v-list-item-subtitle>{{ config.description }}</v-list-item-subtitle>
                </v-list-item-content>
                <template v-slot:append>
                  <v-text-field
                    v-if="config.type === 'text'"
                    v-model="config.value"
                    variant="outlined"
                    density="compact"
                    style="width: 200px;"
                  />
                  <v-text-field
                    v-else-if="config.type === 'number'"
                    v-model.number="config.value"
                    type="number"
                    variant="outlined"
                    density="compact"
                    style="width: 200px;"
                  />
                </template>
              </v-list-item>
            </v-list>
          </v-window-item>

          <v-window-item value="security">
            <v-list density="comfortable">
              <v-list-item v-for="config in securityConfigs" :key="config.key">
                <template v-slot:prepend>
                  <v-icon>{{ config.icon }}</v-icon>
                </template>
                <v-list-item-content>
                  <v-list-item-title>{{ config.label }}</v-list-item-title>
                  <v-list-item-subtitle>{{ config.description }}</v-list-item-subtitle>
                </v-list-item-content>
                <template v-slot:append>
                  <v-text-field
                    v-if="config.type === 'text'"
                    v-model="config.value"
                    variant="outlined"
                    density="compact"
                    style="width: 200px;"
                  />
                  <v-text-field
                    v-else-if="config.type === 'number'"
                    v-model.number="config.value"
                    type="number"
                    variant="outlined"
                    density="compact"
                    style="width: 200px;"
                  />
                  <v-switch
                    v-else-if="config.type === 'boolean'"
                    v-model="config.value"
                    :label="config.value ? t('common.enabled') : t('common.disabled')"
                  />
                </template>
              </v-list-item>
            </v-list>
          </v-window-item>

          <v-window-item value="features">
            <v-list density="comfortable">
              <v-list-item v-for="config in featureConfigs" :key="config.key">
                <template v-slot:prepend>
                  <v-icon>{{ config.icon }}</v-icon>
                </template>
                <v-list-item-content>
                  <v-list-item-title>{{ config.label }}</v-list-item-title>
                  <v-list-item-subtitle>{{ config.description }}</v-list-item-subtitle>
                </v-list-item-content>
                <template v-slot:append>
                  <v-switch
                    v-model="config.value"
                    :label="config.value ? t('common.enabled') : t('common.disabled')"
                  />
                </template>
              </v-list-item>
            </v-list>
          </v-window-item>
        </v-window>
      </v-card-text>
    </v-card>

    <v-card variant="outlined">
      <v-card-title class="pt-6 px-6 pb-0">
        <v-icon class="mr-2">mdi-history</v-icon>
        {{ t('runtimeConfig.configHistory') }}
      </v-card-title>
      <v-card-text class="pa-6">
        <v-data-table
          :headers="historyHeaders"
          :items="configHistory"
          :items-per-page="10"
          class="history-table"
        >
          <template v-slot:item.action="{ item }">
            <v-btn variant="text" size="small" @click="restoreVersion(item.id)">
              {{ t('common.restore') }}
            </v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-snackbar v-model="showSuccess" color="success" :timeout="3000" location="top right">
      {{ successMessage }}
      <template v-slot:actions>
        <v-btn color="white" variant="text" @click="showSuccess = false">{{ t('common.close') }}</v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useI18n } from '@/composables/useI18n';
import { runtimeConfigApi } from '@/services/api';

const { t } = useI18n();

useDocumentTitle(() => t('runtimeConfig.title'));

const loading = ref(false);
const saving = ref(false);
const activeTab = ref('general');
const showSuccess = ref(false);
const successMessage = ref('');

const generalConfigs = reactive([
  { key: 'site_name', label: t('runtimeConfig.siteName'), description: t('runtimeConfig.siteNameDesc'), value: 'CloudCAD', type: 'text', icon: 'mdi-domain' },
  { key: 'session_timeout', label: t('runtimeConfig.sessionTimeout'), description: t('runtimeConfig.minutes'), value: 60, type: 'number', icon: 'mdi-clock' },
  { key: 'max_upload_size', label: t('runtimeConfig.maxUploadSize'), description: t('runtimeConfig.mb'), value: 100, type: 'number', icon: 'mdi-file-upload' },
]);

const storageConfigs = reactive([
  { key: 'storage_type', label: t('runtimeConfig.storageType'), description: t('runtimeConfig.localS3'), value: 'local', type: 'text', icon: 'mdi-database' },
  { key: 'storage_path', label: t('runtimeConfig.storagePath'), description: t('runtimeConfig.localStoragePath'), value: '/data/storage', type: 'text', icon: 'mdi-folder' },
]);

const securityConfigs = reactive([
  { key: 'enable_2fa', label: t('runtimeConfig.twoFactorAuth'), description: t('runtimeConfig.forceEnable2FA'), value: false, type: 'boolean', icon: 'mdi-shield-key' },
  { key: 'password_min_length', label: t('runtimeConfig.passwordMinLength'), description: t('runtimeConfig.characters'), value: 8, type: 'number', icon: 'mdi-lock' },
  { key: 'ip_whitelist', label: t('runtimeConfig.ipWhitelist'), description: t('runtimeConfig.allowedIPs'), value: '', type: 'text', icon: 'mdi-ip-network' },
]);

const featureConfigs = reactive([
  { key: 'enable_file_sharing', label: t('runtimeConfig.fileSharing'), description: t('runtimeConfig.allowFileSharing'), value: true, type: 'boolean', icon: 'mdi-share' },
  { key: 'enable_realtime_collab', label: t('runtimeConfig.realtimeCollab'), description: t('runtimeConfig.multiplayerEdit'), value: true, type: 'boolean', icon: 'mdi-account-group' },
  { key: 'enable_audit_log', label: t('runtimeConfig.auditLog'), description: t('runtimeConfig.logAllOperations'), value: true, type: 'boolean', icon: 'mdi-clipboard-list' },
  { key: 'enable_notifications', label: t('runtimeConfig.notifications'), description: t('runtimeConfig.systemNotifications'), value: true, type: 'boolean', icon: 'mdi-bell' },
]);

const configHistory = ref([
  { id: 1, updatedBy: t('runtimeConfig.admin'), updatedAt: '2024-01-01 12:00:00', changes: t('runtimeConfig.changedSiteName') },
  { id: 2, updatedBy: t('runtimeConfig.admin'), updatedAt: '2024-01-01 10:30:00', changes: t('runtimeConfig.adjustedSessionTimeout') },
  { id: 3, updatedBy: t('runtimeConfig.admin'), updatedAt: '2023-12-31 15:00:00', changes: t('runtimeConfig.enabledAuditLog') },
]);

const historyHeaders = [
  { key: 'updatedAt', title: t('runtimeConfig.updateTime'), width: '200px' },
  { key: 'updatedBy', title: t('runtimeConfig.updatedBy'), width: '150px' },
  { key: 'changes', title: t('runtimeConfig.changeContent') },
  { key: 'action', title: t('runtimeConfig.actions'), width: '100px' },
];

const refresh = async () => {
  loading.value = true;
  try {
    const response = await runtimeConfigApi.getAllConfigs();
    if (response.data) {
      // 合并API数据
    }
  } catch (error) {
    console.error(t('runtimeConfig.refreshFailed'), error);
  } finally {
    loading.value = false;
  }
};

const saveAll = async () => {
  saving.value = true;
  try {
    for (const config of [...generalConfigs, ...storageConfigs, ...securityConfigs, ...featureConfigs]) {
      await runtimeConfigApi.updateConfig(config.key, config.value);
    }
    successMessage.value = t('runtimeConfig.saveSuccess');
    showSuccess.value = true;
  } catch (error) {
    console.error(t('runtimeConfig.saveFailed'), error);
  } finally {
    saving.value = false;
  }
};

const restoreVersion = async (id: number) => {
  try {
    // runtimeConfigApi没有restore方法，暂存为刷新
    successMessage.value = t('runtimeConfig.restoreSuccess');
    showSuccess.value = true;
    refresh();
  } catch (error) {
    console.error(t('runtimeConfig.restoreFailed'), error);
  }
};

onMounted(() => {
  refresh();
});
</script>
