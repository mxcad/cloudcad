<template>
  <v-container class="pa-6 pa-lg-8" style="max-width: 1400px;">
    <div class="d-flex align-center justify-between mb-6">
      <div class="d-flex align-center gap-4">
        <div class="rounded-xl d-flex align-center justify-center" style="width: 48px; height: 48px; background: linear-gradient(135deg, #0891b2, #06b6d4);">
          <v-icon color="white">mdi-clipboard-list</v-icon>
        </div>
        <div>
          <h1 class="text-h4 font-weight-bold mb-0">{{ t('auditLog.title') }}</h1>
          <p class="text-body-2 text-medium-emphasis mb-0">{{ t('auditLog.subtitle') }}</p>
        </div>
      </div>
      <div class="d-flex gap-2">
        <v-btn variant="outlined" @click="refresh" :loading="loading">
          <v-icon class="mr-1">mdi-refresh</v-icon>
          {{ t('common.refresh') }}
        </v-btn>
        <v-btn color="primary" @click="exportLogs">
          <v-icon class="mr-1">mdi-download</v-icon>
          {{ t('common.export') }}
        </v-btn>
      </div>
    </div>

    <v-card variant="outlined" class="mb-6">
      <v-card-text class="pa-4">
        <v-row align="center" class="mb-4">
          <v-col cols="12" md="3">
            <v-text-field
              v-model="searchTerm"
              prepend-icon="mdi-magnify"
              :label="t('auditLog.searchLog')"
              variant="outlined"
              density="compact"
              clearable
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-select
              v-model="selectedAction"
              :items="actionOptions"
              :label="t('auditLog.actionType')"
              variant="outlined"
              density="compact"
              clearable
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-select
              v-model="selectedUser"
              :items="userOptions"
              :label="t('auditLog.operatingUser')"
              variant="outlined"
              density="compact"
              clearable
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-select
              v-model="selectedResource"
              :items="resourceOptions"
              :label="t('auditLog.resourceType')"
              variant="outlined"
              density="compact"
              clearable
            />
          </v-col>
          <v-col cols="12" md="3">
            <div class="d-flex gap-2">
              <v-menu>
                <template v-slot:activator="{ props }">
                  <v-btn v-bind="props" variant="outlined" block>
                    <v-icon class="mr-1">mdi-calendar</v-icon>
                    {{ dateRangeText }}
                  </v-btn>
                </template>
                <v-card>
                  <v-card-text>
                    <v-date-picker v-model="selectedDates" multiple range header-input-level="2">
                      <template v-slot:header>
                        <v-app-bar color="primary" density="compact">
                          <v-app-bar-title>{{ t('auditLog.dateFilter') }}</v-app-bar-title>
                        </v-app-bar>
                      </template>
                    </v-date-picker>
                  </v-card-text>
                  <v-card-actions class="justify-end gap-2">
                    <v-btn text @click="selectedDates = null">{{ t('common.clear') }}</v-btn>
                    <v-btn color="primary" text @click="applyDateFilter">{{ t('common.apply') }}</v-btn>
                  </v-card-actions>
                </v-card>
              </v-menu>
              <v-btn variant="outlined" @click="resetFilters">
                {{ t('common.reset') }}
              </v-btn>
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card variant="outlined">
      <v-data-table
        :headers="headers"
        :items="filteredLogs"
        :loading="loading"
        :items-per-page="pageSize"
        :page="currentPage"
        :total-items="totalLogs"
        :server-items-length="totalLogs"
        class="users-table"
        @update:page="handlePageChange"
      >
        <template v-slot:item.action="{ item }">
          <v-chip :color="getActionColor(item.action)" variant="tonal" size="small">
            {{ getActionText(item.action) }}
          </v-chip>
        </template>

        <template v-slot:item.status="{ item }">
          <v-chip :color="item.success ? 'success' : 'error'" variant="tonal" size="small">
            {{ item.success ? t('common.success') : t('common.failure') }}
          </v-chip>
        </template>

        <template v-slot:item.details="{ item }">
          <v-btn icon="mdi-eye" variant="text" size="small" @click="showDetails(item)">
            <v-tooltip location="top">{{ t('common.details') }}</v-tooltip>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="detailsDialogOpen" max-width="800">
      <v-card>
        <v-card-title>{{ t('auditLog.logDetails') }}</v-card-title>
        <v-card-text>
          <v-list density="compact">
            <v-list-item v-if="selectedLog">
              <template v-slot:prepend><v-icon>mdi-user</v-icon></template>
              <v-list-item-title>{{ t('auditLog.operatingUser') }}</v-list-item-title>
              <v-list-item-subtitle>{{ selectedLog.user?.name || selectedLog.username || t('common.unknown') }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider />
            <v-list-item>
              <template v-slot:prepend><v-icon>mdi-cursor-default-click</v-icon></template>
              <v-list-item-title>{{ t('auditLog.actionType') }}</v-list-item-title>
              <v-list-item-subtitle>{{ getActionText(selectedLog?.action) }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider />
            <v-list-item>
              <template v-slot:prepend><v-icon>mdi-folder</v-icon></template>
              <v-list-item-title>{{ t('auditLog.resourceType') }}</v-list-item-title>
              <v-list-item-subtitle>{{ getResourceText(selectedLog?.resourceType) }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider />
            <v-list-item>
              <template v-slot:prepend><v-icon>mdi-tag</v-icon></template>
              <v-list-item-title>{{ t('auditLog.resourceId') }}</v-list-item-title>
              <v-list-item-subtitle>{{ selectedLog?.resourceId || t('common.none') }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider />
            <v-list-item>
              <template v-slot:prepend><v-icon>mdi-clock</v-icon></template>
              <v-list-item-title>{{ t('auditLog.operatingTime') }}</v-list-item-title>
              <v-list-item-subtitle>{{ formatDate(selectedLog?.createdAt) }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider />
            <v-list-item>
              <template v-slot:prepend><v-icon>mdi-lan</v-icon></template>
              <v-list-item-title>{{ t('auditLog.ipAddress') }}</v-list-item-title>
              <v-list-item-subtitle>{{ selectedLog?.ipAddress || t('common.none') }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider />
            <v-list-item>
              <template v-slot:prepend><v-icon>mdi-text</v-icon></template>
              <v-list-item-title>{{ t('auditLog.description') }}</v-list-item-title>
              <v-list-item-subtitle>{{ selectedLog?.description || t('auditLog.noDescription') }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider />
            <v-list-item v-if="selectedLog?.details">
              <template v-slot:prepend><v-icon>mdi-json</v-icon></template>
              <v-list-item-title>{{ t('auditLog.details') }}</v-list-item-title>
              <v-list-item-subtitle>
                <pre class="bg-gray-100 p-3 rounded text-sm">{{ JSON.stringify(selectedLog.details, null, 2) }}</pre>
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="detailsDialogOpen = false">{{ t('common.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useI18n } from '@/composables/useI18n';
import { auditApi } from '@/services/auditApi';

const { t } = useI18n();

useDocumentTitle(t('auditLog.title'));

const loading = ref(false);
const logs = ref<any[]>([]);
const totalLogs = ref(0);
const searchTerm = ref('');
const selectedAction = ref<string | null>(null);
const selectedUser = ref<string | null>(null);
const selectedResource = ref<string | null>(null);
const selectedDates = ref<any>(null);
const currentPage = ref(1);
const pageSize = 20;

const detailsDialogOpen = ref(false);
const selectedLog = ref<any>(null);

const actionOptions = [
  { title: t('auditLog.create'), value: 'CREATE' },
  { title: t('auditLog.update'), value: 'UPDATE' },
  { title: t('auditLog.delete'), value: 'DELETE' },
  { title: t('auditLog.login'), value: 'LOGIN' },
  { title: t('auditLog.logout'), value: 'LOGOUT' },
  { title: t('auditLog.download'), value: 'DOWNLOAD' },
  { title: t('auditLog.upload'), value: 'UPLOAD' },
];

const userOptions = ref([
  { title: t('auditLog.admin'), value: 'admin' },
  { title: t('auditLog.user1'), value: 'user1' },
]);

const resourceOptions = [
  { title: t('auditLog.user'), value: 'USER' },
  { title: t('auditLog.project'), value: 'PROJECT' },
  { title: t('auditLog.file'), value: 'FILE' },
  { title: t('auditLog.role'), value: 'ROLE' },
];

const headers = [
  { key: 'id', title: 'ID', width: '80px' },
  { key: 'user', title: t('auditLog.operatingUser'), width: '150px' },
  { key: 'action', title: t('auditLog.actionType'), width: '120px' },
  { key: 'resourceType', title: t('auditLog.resourceType'), width: '120px' },
  { key: 'resourceId', title: t('auditLog.resourceId'), width: '120px' },
  { key: 'ipAddress', title: t('auditLog.ipAddress'), width: '120px' },
  { key: 'status', title: t('common.status'), width: '100px' },
  { key: 'createdAt', title: t('auditLog.operatingTime'), width: '180px' },
  { key: 'details', title: t('common.action'), width: '80px' },
];

const dateRangeText = computed(() => {
  if (!selectedDates.value?.start || !selectedDates.value?.end) return t('auditLog.selectDate');
  return `${selectedDates.value.start.toLocaleDateString()} - ${selectedDates.value.end.toLocaleDateString()}`;
});

const filteredLogs = computed(() => {
  let result = logs.value;

  if (searchTerm.value) {
    const term = searchTerm.value.toLowerCase();
    result = result.filter(log => 
      (log.user?.name || log.username || '').toLowerCase().includes(term) ||
      (log.description || '').toLowerCase().includes(term)
    );
  }

  if (selectedAction.value) {
    result = result.filter(log => log.action === selectedAction.value);
  }

  return result;
});

const loadData = async () => {
  loading.value = true;
  try {
    const response = await auditApi.getLogs({
      page: currentPage.value,
      limit: pageSize,
      search: searchTerm.value,
      action: selectedAction.value || undefined,
    });
    logs.value = response.data || [];
    totalLogs.value = logs.value.length;
  } catch (error) {
    console.error('加载日志失败:', error);
  } finally {
    loading.value = false;
  }
};

const refresh = () => {
  loadData();
};

const handlePageChange = (page: number) => {
  currentPage.value = page;
  loadData();
};

const showDetails = (log: any) => {
  selectedLog.value = log;
  detailsDialogOpen.value = true;
};

const exportLogs = async () => {
  try {
    // TODO: 实现导出功能
    const blob = new Blob(['Log data'], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  } catch (error) {
    console.error('导出失败:', error);
  }
};

const getActionColor = (action: string) => {
  const colors: Record<string, string> = {
    CREATE: 'success',
    UPDATE: 'info',
    DELETE: 'error',
    LOGIN: 'primary',
    LOGOUT: 'secondary',
    DOWNLOAD: 'info',
    UPLOAD: 'success',
  };
  return colors[action] || 'default';
};

const getActionText = (action: string) => {
  const texts: Record<string, string> = {
    CREATE: t('auditLog.create'),
    UPDATE: t('auditLog.update'),
    DELETE: t('auditLog.delete'),
    LOGIN: t('auditLog.login'),
    LOGOUT: t('auditLog.logout'),
    DOWNLOAD: t('auditLog.download'),
    UPLOAD: t('auditLog.upload'),
  };
  return texts[action] || action;
};

const getResourceText = (resource: string) => {
  const texts: Record<string, string> = {
    USER: t('auditLog.user'),
    PROJECT: t('auditLog.project'),
    FILE: t('auditLog.file'),
    ROLE: t('auditLog.role'),
  };
  return texts[resource] || resource;
};

const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('zh-CN');
};

const resetFilters = () => {
  searchTerm.value = '';
  selectedAction.value = null;
  selectedUser.value = null;
  selectedResource.value = null;
  selectedDates.value = null;
  loadData();
};

const applyDateFilter = () => {
  // TODO: 应用日期过滤
  refresh();
};

onMounted(() => {
  // 临时数据
  logs.value = [
    { id: 1, user: { name: '管理员' }, username: 'admin', action: 'LOGIN', success: true, resourceType: 'USER', resourceId: '1', ipAddress: '192.168.1.1', description: '用户登录', createdAt: new Date().toISOString(), details: {} },
    { id: 2, user: { name: '用户1' }, username: 'user1', action: 'CREATE', success: true, resourceType: 'PROJECT', resourceId: '100', ipAddress: '192.168.1.2', description: '创建项目', createdAt: new Date(Date.now() - 3600000).toISOString(), details: {} },
    { id: 3, user: { name: '管理员' }, username: 'admin', action: 'UPDATE', success: true, resourceType: 'FILE', resourceId: '200', ipAddress: '192.168.1.1', description: '更新文件', createdAt: new Date(Date.now() - 7200000).toISOString(), details: {} },
    { id: 4, user: { name: '用户2' }, username: 'user2', action: 'DELETE', success: false, resourceType: 'ROLE', resourceId: '300', ipAddress: '192.168.1.3', description: '删除角色失败', createdAt: new Date(Date.now() - 10800000).toISOString(), details: {} },
    { id: 5, user: { name: '管理员' }, username: 'admin', action: 'DOWNLOAD', success: true, resourceType: 'FILE', resourceId: '400', ipAddress: '192.168.1.1', description: '下载文件', createdAt: new Date(Date.now() - 14400000).toISOString(), details: {} },
  ];
  totalLogs.value = logs.value.length;
});
</script>
