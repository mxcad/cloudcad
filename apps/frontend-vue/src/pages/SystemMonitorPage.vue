<template>
  <v-container class="pa-6 pa-lg-8" style="max-width: 1600px;">
    <div class="d-flex align-center justify-between mb-6">
      <div class="d-flex align-center gap-4">
        <div class="rounded-xl d-flex align-center justify-center" style="width: 48px; height: 48px; background: linear-gradient(135deg, #16a34a, #22c55e);">
          <v-icon color="white">mdi-speedometer</v-icon>
        </div>
        <div>
          <h1 class="text-h4 font-weight-bold mb-0">系统监控</h1>
          <p class="text-body-2 text-medium-emphasis mb-0">实时监控系统健康状态和性能指标</p>
        </div>
      </div>
      <div class="d-flex gap-2">
        <v-btn variant="outlined" @click="refresh" :loading="loading">
          <v-icon class="mr-1">mdi-refresh</v-icon>
          刷新
        </v-btn>
      </div>
    </div>

    <v-row class="mb-6">
      <v-col cols="12" md="6" lg="3">
        <v-card variant="outlined">
          <v-card-text class="pa-6 text-center">
            <div class="rounded-full d-inline-flex align-center justify-center" style="width: 64px; height: 64px; background-color: rgba(34, 197, 94, 0.1);">
              <v-icon color="success" size="x-large">mdi-memory</v-icon>
            </div>
            <h3 class="text-h5 font-weight-bold mt-4 mb-1">{{ stats.memoryUsage }}%</h3>
            <p class="text-body-2 text-medium-emphasis mb-0">内存使用率</p>
            <v-progress-linear :model-value="stats.memoryUsage" color="success" height="8" class="mt-4" />
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="6" lg="3">
        <v-card variant="outlined">
          <v-card-text class="pa-6 text-center">
            <div class="rounded-full d-inline-flex align-center justify-center" style="width: 64px; height: 64px; background-color: rgba(59, 130, 246, 0.1);">
              <v-icon color="primary" size="x-large">mdi-chart-timeline-variant</v-icon>
            </div>
            <h3 class="text-h5 font-weight-bold mt-4 mb-1">{{ stats.cpuUsage }}%</h3>
            <p class="text-body-2 text-medium-emphasis mb-0">CPU使用率</p>
            <v-progress-linear :model-value="stats.cpuUsage" color="primary" height="8" class="mt-4" />
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="6" lg="3">
        <v-card variant="outlined">
          <v-card-text class="pa-6 text-center">
            <div class="rounded-full d-inline-flex align-center justify-center" style="width: 64px; height: 64px; background-color: rgba(249, 115, 22, 0.1);">
              <v-icon color="warning" size="x-large">mdi-database</v-icon>
            </div>
            <h3 class="text-h5 font-weight-bold mt-4 mb-1">{{ stats.diskUsage }}%</h3>
            <p class="text-body-2 text-medium-emphasis mb-0">磁盘使用率</p>
            <v-progress-linear :model-value="stats.diskUsage" color="warning" height="8" class="mt-4" />
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="6" lg="3">
        <v-card variant="outlined">
          <v-card-text class="pa-6 text-center">
            <div class="rounded-full d-inline-flex align-center justify-center" style="width: 64px; height: 64px; background-color: rgba(236, 72, 153, 0.1);">
              <v-icon color="pink" size="x-large">mdi-account-group</v-icon>
            </div>
            <h3 class="text-h5 font-weight-bold mt-4 mb-1">{{ stats.activeUsers }}</h3>
            <p class="text-body-2 text-medium-emphasis mb-0">在线用户</p>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card variant="outlined" class="mb-6">
      <v-card-title class="pt-6 px-6 pb-0">
        <v-icon class="mr-2">mdi-clock</v-icon>
        服务状态
      </v-card-title>
      <v-card-text class="pa-6">
        <v-list density="compact">
          <v-list-item v-for="service in services" :key="service.name" :prepend-avatar="service.healthy ? 'mdi-check-circle' : 'mdi-alert'" :prepend-avatar-color="service.healthy ? 'success' : 'error'">
            <v-list-item-title>{{ service.name }}</v-list-item-title>
            <v-list-item-subtitle>{{ service.description }}</v-list-item-subtitle>
            <template v-slot:append>
              <span class="text-sm text-medium-emphasis">{{ service.updatedAt }}</span>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-card variant="outlined" class="mb-6">
      <v-card-title class="pt-6 px-6 pb-0">
        <v-icon class="mr-2">mdi-chart-line</v-icon>
        性能图表
      </v-card-title>
      <v-card-text class="pa-6">
        <v-row>
          <v-col cols="12" md="6">
            <div class="d-flex align-center justify-center" style="min-height: 250px; background-color: #f3f4f6; border-radius: 8px;">
              <div class="text-center">
                <v-icon color="primary" size="x-large">mdi-chart-line</v-icon>
                <p class="mt-2">CPU 图表</p>
              </div>
            </div>
          </v-col>
          <v-col cols="12" md="6">
            <div class="d-flex align-center justify-center" style="min-height: 250px; background-color: #f3f4f6; border-radius: 8px;">
              <div class="text-center">
                <v-icon color="success" size="x-large">mdi-chart-bar</v-icon>
                <p class="mt-2">内存 图表</p>
              </div>
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card variant="outlined">
      <v-card-title class="pt-6 px-6 pb-0">
        <v-icon class="mr-2">mdi-lightning-bolt</v-icon>
        系统事件
      </v-card-title>
      <v-card-text class="pa-6">
        <v-data-table
          :headers="eventHeaders"
          :items="recentEvents"
          :items-per-page="10"
          class="events-table"
        >
          <template v-slot:item.level="{ item }">
            <v-chip :color="getEventColor(item.level)" variant="tonal" size="small">
              {{ item.level }}
            </v-chip>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { adminApi } from '@/services/adminApi';

useDocumentTitle('系统监控');

const loading = ref(false);
const stats = ref({
  memoryUsage: 45,
  cpuUsage: 32,
  diskUsage: 67,
  activeUsers: 12,
});

const services = ref([
  { name: 'API Gateway', description: 'API 网关服务', healthy: true, updatedAt: '刚刚' },
  { name: 'Auth Service', description: '认证服务', healthy: true, updatedAt: '刚刚' },
  { name: 'File Storage', description: '文件存储服务', healthy: true, updatedAt: '1分钟前' },
  { name: 'Database', description: '数据库服务', healthy: true, updatedAt: '2分钟前' },
  { name: 'Cache Service', description: '缓存服务', healthy: false, updatedAt: '5分钟前' },
]);

const recentEvents = ref([
  { id: 1, level: 'INFO', message: '用户登录成功', source: 'AuthService', timestamp: '2024-01-01 12:00:00' },
  { id: 2, level: 'WARNING', message: '内存使用率超过阈值', source: 'SystemMonitor', timestamp: '2024-01-01 11:55:00' },
  { id: 3, level: 'ERROR', message: '缓存服务连接失败', source: 'CacheService', timestamp: '2024-01-01 11:45:00' },
  { id: 4, level: 'INFO', message: '文件上传成功', source: 'FileService', timestamp: '2024-01-01 11:30:00' },
  { id: 5, level: 'INFO', message: '项目创建成功', source: 'ProjectService', timestamp: '2024-01-01 11:25:00' },
]);

const eventHeaders = [
  { key: 'timestamp', title: '时间', width: '180px' },
  { key: 'level', title: '级别', width: '100px' },
  { key: 'source', title: '来源', width: '150px' },
  { key: 'message', title: '消息' },
];

let refreshInterval: any = null;

const refresh = async () => {
  loading.value = true;
  try {
    const response = await adminApi.getStats();
    if (response.data) {
      // 合并从API获取的数据
    }
  } catch (error) {
    console.error('刷新失败:', error);
  } finally {
    loading.value = false;
  }
};

const getEventColor = (level: string) => {
  const colors: Record<string, string> = {
    INFO: 'primary',
    WARNING: 'warning',
    ERROR: 'error',
    DEBUG: 'info',
  };
  return colors[level] || 'default';
};

onMounted(() => {
  refreshInterval = setInterval(refresh, 30000); // 每30秒刷新
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});
</script>
