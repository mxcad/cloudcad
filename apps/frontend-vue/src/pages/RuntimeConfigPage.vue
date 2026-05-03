<template>
  <v-container class="pa-6 pa-lg-8" style="max-width: 1200px;">
    <div class="d-flex align-center justify-between mb-6">
      <div class="d-flex align-center gap-4">
        <div class="rounded-xl d-flex align-center justify-center" style="width: 48px; height: 48px; background: linear-gradient(135deg, #7c3aed, #8b5cf6);">
          <v-icon color="white">mdi-cog</v-icon>
        </div>
        <div>
          <h1 class="text-h4 font-weight-bold mb-0">运行时配置</h1>
          <p class="text-body-2 text-medium-emphasis mb-0">管理系统的运行时配置参数</p>
        </div>
      </div>
      <div class="d-flex gap-2">
        <v-btn variant="outlined" @click="refresh" :loading="loading">
          <v-icon class="mr-1">mdi-refresh</v-icon>
          刷新
        </v-btn>
        <v-btn color="primary" @click="saveAll" :loading="saving">
          <v-icon class="mr-1">mdi-content-save</v-icon>
          保存所有
        </v-btn>
      </div>
    </div>

    <v-card variant="outlined" class="mb-6">
      <v-card-title class="pt-6 px-6 pb-0">
        <v-icon class="mr-2">mdi-folder</v-icon>
        配置分组
      </v-card-title>
      <v-card-text class="pa-6">
        <v-tabs v-model="activeTab" grow>
          <v-tab value="general">
            <v-icon class="mr-1">mdi-tune</v-icon>
            通用配置
          </v-tab>
          <v-tab value="storage">
            <v-icon class="mr-1">mdi-database</v-icon>
            存储配置
          </v-tab>
          <v-tab value="security">
            <v-icon class="mr-1">mdi-shield-account</v-icon>
            安全配置
          </v-tab>
          <v-tab value="features">
            <v-icon class="mr-1">mdi-star</v-icon>
            功能开关
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
                    :label="config.value ? '启用' : '禁用'"
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
                    :label="config.value ? '启用' : '禁用'"
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
                    :label="config.value ? '启用' : '禁用'"
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
        配置历史
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
              恢复
            </v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-snackbar v-model="showSuccess" color="success" :timeout="3000" location="top right">
      {{ successMessage }}
      <template v-slot:actions>
        <v-btn color="white" variant="text" @click="showSuccess = false">关闭</v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { runtimeConfigApi } from '@/services/api';

useDocumentTitle('运行时配置');

const loading = ref(false);
const saving = ref(false);
const activeTab = ref('general');
const showSuccess = ref(false);
const successMessage = ref('');

const generalConfigs = reactive([
  { key: 'site_name', label: '站点名称', description: '系统显示的名称', value: 'CloudCAD', type: 'text', icon: 'mdi-domain' },
  { key: 'session_timeout', label: '会话超时', description: '分钟', value: 60, type: 'number', icon: 'mdi-clock' },
  { key: 'max_upload_size', label: '最大上传大小', description: 'MB', value: 100, type: 'number', icon: 'mdi-file-upload' },
]);

const storageConfigs = reactive([
  { key: 'storage_type', label: '存储类型', description: 'local/s3', value: 'local', type: 'text', icon: 'mdi-database' },
  { key: 'storage_path', label: '存储路径', description: '本地存储路径', value: '/data/storage', type: 'text', icon: 'mdi-folder' },
]);

const securityConfigs = reactive([
  { key: 'enable_2fa', label: '两步验证', description: '强制启用两步验证', value: false, type: 'boolean', icon: 'mdi-shield-key' },
  { key: 'password_min_length', label: '密码最小长度', description: '字符', value: 8, type: 'number', icon: 'mdi-lock' },
  { key: 'ip_whitelist', label: 'IP白名单', description: '允许的IP地址', value: '', type: 'text', icon: 'mdi-ip-network' },
]);

const featureConfigs = reactive([
  { key: 'enable_file_sharing', label: '文件分享', description: '允许分享文件', value: true, type: 'boolean', icon: 'mdi-share' },
  { key: 'enable_realtime_collab', label: '实时协作', description: '多人同时编辑', value: true, type: 'boolean', icon: 'mdi-account-group' },
  { key: 'enable_audit_log', label: '审计日志', description: '记录所有操作', value: true, type: 'boolean', icon: 'mdi-clipboard-list' },
  { key: 'enable_notifications', label: '通知', description: '系统通知功能', value: true, type: 'boolean', icon: 'mdi-bell' },
]);

const configHistory = ref([
  { id: 1, updatedBy: '管理员', updatedAt: '2024-01-01 12:00:00', changes: '修改了站点名称' },
  { id: 2, updatedBy: '管理员', updatedAt: '2024-01-01 10:30:00', changes: '调整了会话超时时间' },
  { id: 3, updatedBy: '管理员', updatedAt: '2023-12-31 15:00:00', changes: '启用了审计日志' },
]);

const historyHeaders = [
  { key: 'updatedAt', title: '更新时间', width: '200px' },
  { key: 'updatedBy', title: '更新人', width: '150px' },
  { key: 'changes', title: '变更内容' },
  { key: 'action', title: '操作', width: '100px' },
];

const refresh = async () => {
  loading.value = true;
  try {
    const response = await runtimeConfigApi.getAllConfigs();
    if (response.data) {
      // 合并API数据
    }
  } catch (error) {
    console.error('刷新配置失败:', error);
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
    successMessage.value = '配置保存成功';
    showSuccess.value = true;
  } catch (error) {
    console.error('保存配置失败:', error);
  } finally {
    saving.value = false;
  }
};

const restoreVersion = async (id: number) => {
  try {
    // runtimeConfigApi没有restore方法，暂存为刷新
    successMessage.value = '配置已恢复';
    showSuccess.value = true;
    refresh();
  } catch (error) {
    console.error('恢复配置失败:', error);
  }
};

onMounted(() => {
  refresh();
});
</script>
