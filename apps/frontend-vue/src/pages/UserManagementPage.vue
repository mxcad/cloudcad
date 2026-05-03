<template>
  <v-container class="pa-6 pa-lg-8" style="max-width: 1200px;">
    <!-- 成功提示 -->
    <v-snackbar v-model="showSuccess" color="success" :timeout="3000" location="top right">
      {{ successMessage }}
      <template v-slot:actions>
        <v-btn color="white" variant="text" @click="showSuccess = false">关闭</v-btn>
      </template>
    </v-snackbar>

    <!-- 错误提示 -->
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="mb-6"
      :closable="true"
      @close="error = null"
    >
      <div class="d-flex align-center gap-2">
        <v-icon>mdi-alert-circle</v-icon>
        <span>{{ error }}</span>
        <v-btn variant="text" color="error" class="ml-auto" @click="loadData" :loading="loading">
          <v-icon size="small" class="mr-1">mdi-refresh</v-icon>
          重试
        </v-btn>
      </div>
    </v-alert>

    <!-- 访问被拒绝 -->
    <div v-if="!canAccess" class="text-center py-12">
      <v-icon size="64" color="error" class="mb-4">mdi-alert-circle</v-icon>
      <h2 class="text-h4 font-weight-bold mb-2">访问被拒绝</h2>
      <p class="text-body-1 mb-1">您没有权限访问此页面。</p>
      <p class="text-body-2 text-medium-emphasis">请联系管理员获取用户管理权限。</p>
    </div>

    <!-- 有限访问状态 -->
    <div v-else-if="!hasReadPermission" class="text-center py-12">
      <v-card variant="outlined" class="mx-auto" style="max-width: 500px;">
        <v-card-text class="text-center py-10">
          <v-icon size="48" color="warning" class="mb-4">mdi-alert-circle</v-icon>
          <h2 class="text-h5 font-weight-bold mb-3">无法查看用户列表</h2>
          <p class="text-body-1 mb-4">您没有查看用户列表的权限，但拥有以下操作权限：</p>
          <div class="d-flex flex-wrap justify-center gap-2 mb-4">
            <v-chip v-if="hasPermission('SYSTEM_USER_CREATE')" color="success" variant="tonal">
              创建用户
            </v-chip>
            <v-chip v-if="hasPermission('SYSTEM_USER_UPDATE')" color="primary" variant="tonal">
              更新用户
            </v-chip>
            <v-chip v-if="hasPermission('SYSTEM_USER_DELETE')" color="error" variant="tonal">
              删除用户
            </v-chip>
          </div>
          <p class="text-body-2 text-medium-emphasis">
            请联系管理员授予查看用户列表的权限（SYSTEM_USER_READ）
          </p>
        </v-card-text>
      </v-card>
    </div>

    <!-- 主要内容 -->
    <div v-else>
      <!-- 页面头部 -->
      <div class="d-flex align-center justify-between mb-6">
        <div class="d-flex align-center gap-4">
          <div
            class="rounded-xl d-flex align-center justify-center"
            style="width: 48px; height: 48px; background: linear-gradient(135deg, #6366f1, #0ea5e9);"
          >
            <v-icon color="white">mdi-account-group</v-icon>
          </div>
          <div>
            <h1 class="text-h4 font-weight-bold m-0">用户管理</h1>
            <p class="text-body-2 text-medium-emphasis m-0 mt-1">
              管理团队成员、分配角色及存储配额
            </p>
          </div>
        </div>
        <div class="d-flex gap-3">
          <v-btn
            v-if="hasPermission('SYSTEM_USER_DELETE')"
            variant="outlined"
            @click="openCleanupModal"
            :loading="loading"
          >
            <v-icon class="mr-1">mdi-sparkles</v-icon>
            清理已注销用户
          </v-btn>
          <v-btn
            v-if="hasPermission('SYSTEM_USER_CREATE')"
            color="primary"
            @click="openCreateModal"
            :loading="loading"
          >
            <v-icon class="mr-1">mdi-account-plus</v-icon>
            添加用户
          </v-btn>
        </div>
      </div>

      <!-- 用户Tab切换 -->
      <v-tabs v-model="userTab" class="mb-6" bg-color="transparent">
        <v-tab value="active">活跃用户</v-tab>
        <v-tab value="deleted">已注销</v-tab>
      </v-tabs>

      <!-- 筛选和搜索 -->
      <v-card variant="outlined" class="mb-6">
        <v-card-text>
          <v-row align="center" class="mb-4">
            <v-col cols="12" md="6">
              <v-text-field
                v-model="searchQuery"
                prepend-icon="mdi-magnify"
                label="搜索用户（邮箱、用户名、昵称）"
                variant="outlined"
                density="compact"
                clearable
                @input="currentPage = 1"
              />
            </v-col>
            <v-col cols="12" md="3">
              <v-select
                v-model="roleFilter"
                :items="roleOptions"
                label="角色筛选"
                variant="outlined"
                density="compact"
                clearable
                @update:model-value="currentPage = 1"
              />
            </v-col>
            <v-col cols="12" md="3">
              <v-select
                v-model="sortValue"
                :items="sortOptions"
                label="排序方式"
                variant="outlined"
                density="compact"
                @update:model-value="currentPage = 1"
              />
            </v-col>
          </v-row>
          <v-divider />
          <v-row align="center" class="pt-4">
            <v-col>
              <span class="text-body-2 text-medium-emphasis">
                共 <strong>{{ totalUsers }}</strong> 位用户，每页 {{ pageSize }} 条
              </span>
            </v-col>
            <v-col class="text-right">
              <v-pagination
                v-model="currentPage"
                :length="totalPages"
                :total-visible="5"
                density="compact"
              />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- 用户列表 -->
      <v-card variant="outlined">
        <!-- 加载状态 -->
        <div v-if="loading && users.length === 0" class="text-center py-12">
          <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
          <p class="text-body-1 text-medium-emphasis">加载用户列表...</p>
        </div>

        <!-- 空状态 -->
        <div v-else-if="users.length === 0" class="text-center py-12">
          <div class="rounded-3xl d-flex align-center justify-center mx-auto mb-4"
               style="width: 80px; height: 80px; background: rgba(var(--v-theme-surface-variant), 1);">
            <v-icon size="48" color="medium-emphasis">mdi-account-group</v-icon>
          </div>
          <h3 class="text-h5 font-weight-bold mb-2">
            {{ userTab === 'deleted' ? '暂无已注销用户' : '暂无用户' }}
          </h3>
          <p class="text-body-1 text-medium-emphasis mb-4" style="max-width: 400px; margin: 0 auto;">
            {{ searchQuery
              ? '未找到匹配的用户，请尝试其他搜索条件'
              : userTab === 'deleted'
                ? '当前没有已注销的用户'
                : '还没有任何用户，点击上方按钮添加第一个用户'
            }}
          </p>
          <v-btn
            v-if="!searchQuery && userTab === 'active' && hasPermission('SYSTEM_USER_CREATE')"
            color="primary"
            @click="openCreateModal"
          >
            <v-icon class="mr-1">mdi-account-plus</v-icon>
            添加用户
          </v-btn>
        </div>

        <!-- 表格 -->
        <v-data-table
          v-else
          :headers="headers"
          :items="users"
          :loading="loading"
          hide-default-footer
          class="users-table"
          :items-per-page="-1"
        >
          <template v-slot:item.user="{ item }">
            <div class="d-flex align-center gap-3">
              <v-avatar size="44">
                <img v-if="item.avatar" :src="item.avatar" :alt="item.username" />
                <v-icon v-else>mdi-account</v-icon>
              </v-avatar>
              <div class="min-w-0 flex-1">
                <div class="text-body-1 font-weight-medium text-truncate">
                  {{ item.nickname || item.username }}
                </div>
                <div class="text-body-2 text-medium-emphasis text-truncate">
                  {{ item.username }}
                </div>
              </div>
            </div>
          </template>

          <template v-slot:item.email="{ item }">
            <span v-if="item.email">{{ item.email }}</span>
            <span v-else class="text-medium-emphasis">未绑定</span>
          </template>

          <template v-slot:item.phone="{ item }">
            <span v-if="item.phone">{{ item.phone }}</span>
            <span v-else class="text-medium-emphasis">未绑定</span>
          </template>

          <template v-slot:item.role="{ item }">
            <v-chip variant="tonal" density="compact" prepend-icon="mdi-shield">
              {{ getRoleName(item.role?.name) }}
            </v-chip>
          </template>

          <template v-slot:item.quota="{ item }">
            <v-btn variant="tonal" density="compact" @click="openQuotaModal(item)">
              <v-icon class="mr-1">mdi-harddisk</v-icon>
              配额
            </v-btn>
          </template>

          <template v-slot:item.status="{ item }">
            <v-chip :color="getStatusColor(item.status)" variant="tonal" density="compact">
              {{ getStatusText(item.status) }}
            </v-chip>
          </template>

          <template v-slot:item.actions="{ item }">
            <div class="d-flex justify-end gap-1">
              <v-btn
                v-if="hasPermission('SYSTEM_USER_UPDATE')"
                icon="mdi-pencil"
                variant="text"
                size="small"
                @click="openEditModal(item)"
              />
              <v-btn
                v-if="userTab === 'deleted' && hasPermission('SYSTEM_USER_DELETE')"
                icon="mdi-restore"
                variant="text"
                size="small"
                color="primary"
                @click="restoreUser(item.id)"
              />
              <v-btn
                v-if="userTab === 'active' && hasPermission('SYSTEM_USER_DELETE')"
                icon="mdi-delete"
                variant="text"
                size="small"
                color="error"
                @click="openDeleteConfirm(item.id)"
              />
            </div>
          </template>
        </v-data-table>
      </v-card>
    </div>

    <!-- 创建/编辑用户模态框 -->
    <v-dialog v-model="showModal" max-width="600px">
      <v-card>
        <v-card-title>
          {{ editingUser ? '编辑用户' : '添加新用户' }}
        </v-card-title>
        <v-card-text>
          <v-form ref="formRef" v-model="validForm" @submit.prevent="handleSubmit">
            <v-row>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.username"
                  label="用户名"
                  :rules="usernameRules"
                  variant="outlined"
                  required
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.email"
                  label="邮箱"
                  :rules="emailRules"
                  variant="outlined"
                  :required="mailEnabled"
                />
              </v-col>
              <v-col v-if="smsEnabled" cols="12" md="6">
                <v-text-field
                  v-model="formData.phone"
                  label="手机号"
                  variant="outlined"
                  counter="11"
                />
              </v-col>
            </v-row>
            <v-row>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.password"
                  :label="editingUser ? '新密码' : '密码'"
                  type="password"
                  :rules="passwordRules"
                  variant="outlined"
                  :required="!editingUser"
                  :persistent-hint="true"
                  :hint="editingUser ? '留空则不修改' : '至少8个字符'"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="formData.nickname"
                  label="昵称"
                  variant="outlined"
                  persistent-hint
                  hint="可选"
                />
              </v-col>
            </v-row>
            <v-row>
              <v-col cols="12">
                <v-select
                  v-model="formData.roleId"
                  :items="roleSelectOptions"
                  label="角色"
                  variant="outlined"
                  required
                />
              </v-col>
            </v-row>
            <v-row v-if="editingUser">
              <v-col cols="12">
                <v-select
                  v-model="formData.status"
                  :items="statusOptions"
                  label="账户状态"
                  variant="outlined"
                />
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
        <v-card-actions class="justify-end gap-2">
          <v-btn variant="text" @click="showModal = false" :disabled="loading">取消</v-btn>
          <v-btn color="primary" @click="handleSubmit" :loading="loading">
            <v-icon v-if="loading" class="mr-1">mdi-loading</v-icon>
            {{ editingUser ? '保存修改' : '创建用户' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 删除确认模态框 -->
    <v-dialog v-model="showDeleteConfirm" max-width="500px">
      <v-card>
        <v-card-title>确认删除用户</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" class="mb-4">
            <div class="d-flex align-start gap-2">
              <v-icon size="24">mdi-alert-circle</v-icon>
              <div>
                <p class="font-weight-medium mb-1">注销用户</p>
                <p class="text-body-2 m-0">
                  {{ deleteImmediately ? '立即注销将彻底删除用户数据，无法恢复！' : '用户注销后将进入30天冷静期，冷静期后数据将自动清理。' }}
                </p>
              </div>
            </div>
          </v-alert>
          <p class="text-body-1 mb-4">确定要注销该用户吗？</p>
          <v-checkbox
            v-model="deleteImmediately"
            label="立即注销（不等待30天冷静期，直接清理数据）"
          />
        </v-card-text>
        <v-card-actions class="justify-end gap-2">
          <v-btn variant="text" @click="cancelDelete" :disabled="loading">取消</v-btn>
          <v-btn color="error" @click="confirmDelete" :loading="loading">
            <v-icon v-if="loading" class="mr-1">mdi-loading</v-icon>
            {{ deleteImmediately ? '立即注销' : '确认删除' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 存储配额配置模态框 -->
    <v-dialog v-model="showQuotaModal" max-width="450px">
      <v-card>
        <v-card-title>配置存储配额</v-card-title>
        <v-card-text>
          <div v-if="quotaUser" class="mb-6">
            <div class="d-flex align-center gap-3">
              <v-avatar size="44">
                <img v-if="quotaUser.avatar" :src="quotaUser.avatar" :alt="quotaUser.username" />
                <v-icon v-else>mdi-account</v-icon>
              </v-avatar>
              <div>
                <p class="text-body-1 font-weight-medium m-0">
                  {{ quotaUser.nickname || quotaUser.username }}
                </p>
                <p class="text-body-2 text-medium-emphasis m-0">@{{ quotaUser.username }}</p>
              </div>
            </div>
          </div>
          <div class="mb-4">
            <label class="text-body-2 font-weight-medium mb-2 d-flex align-center gap-2">
              <v-icon size="16">mdi-harddisk</v-icon>
              个人空间存储配额
            </label>
            <v-text-field
              v-model.number="userQuota"
              type="number"
              suffix="GB"
              variant="outlined"
              min="0"
            />
            <p class="text-body-2 text-medium-emphasis mt-2">默认配额：{{ formatQuota(defaultQuota) }}</p>
          </div>
        </v-card-text>
        <v-card-actions class="justify-end gap-2">
          <v-btn variant="text" @click="showQuotaModal = false" :disabled="quotaLoading">取消</v-btn>
          <v-btn color="primary" @click="saveUserQuota" :loading="quotaLoading">
            <v-icon v-if="quotaLoading" class="mr-1">mdi-loading</v-icon>
            <v-icon v-else class="mr-1">mdi-content-save</v-icon>
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 用户数据清理模态框 -->
    <v-dialog v-model="showCleanupModal" max-width="450px">
      <v-card>
        <v-card-title>清理已注销用户数据</v-card-title>
        <v-card-text>
          <div class="d-flex justify-around mb-6">
            <div class="text-center">
              <div class="text-h4 font-weight-bold">{{ cleanupStats?.pendingCleanup ?? 0 }}</div>
              <div class="text-body-2 text-medium-emphasis">待清理用户</div>
            </div>
            <div class="text-center">
              <div class="text-h4 font-weight-bold">{{ cleanupStats?.delayDays ?? 30 }} 天</div>
              <div class="text-body-2 text-medium-emphasis">冷静期</div>
            </div>
            <div class="text-center">
              <div class="text-h4 font-weight-bold">
                {{ cleanupStats?.expiryDate ? new Date(cleanupStats.expiryDate).toLocaleDateString('zh-CN') : '-' }}
              </div>
              <div class="text-body-2 text-medium-emphasis">过期截止</div>
            </div>
          </div>
          <p class="text-body-1 mb-3">
            点击"立即清理"将清理所有已注销超过 {{ cleanupStats?.delayDays ?? 30 }} 天的用户数据，包括：
          </p>
          <ul class="pl-4">
            <li>项目成员关系</li>
            <li>用户拥有的项目/个人空间</li>
            <li>审计日志</li>
            <li>文件存储（标记待清理）</li>
          </ul>
        </v-card-text>
        <v-card-actions class="justify-end gap-2">
          <v-btn variant="text" @click="showCleanupModal = false" :disabled="cleanupLoading">取消</v-btn>
          <v-btn color="primary" @click="handleCleanupTrigger" :loading="cleanupLoading">
            <v-icon v-if="cleanupLoading" class="mr-1">mdi-loading</v-icon>
            <v-icon v-else class="mr-1">mdi-sparkles</v-icon>
            立即清理
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useTheme } from 'vuetify';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { usersApi, rolesApi, runtimeConfigApi, projectsApi, userCleanupApi } from '@/services/api';
import { SystemPermission, getRoleDisplayName } from '@/constants/permissions';
import { usePermission } from '@/composables/usePermission';

useDocumentTitle('用户管理');

const { isDark } = useTheme();
const { hasPermission } = usePermission();

// 状态
const canAccess = ref(false);
const hasReadPermission = computed(() => hasPermission(SystemPermission.SYSTEM_USER_READ));
const users = ref<any[]>([]);
const roles = ref<any[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

// 搜索筛选分页
const searchQuery = ref('');
const roleFilter = ref('');
const userTab = ref<'active' | 'deleted'>('active');
const sortBy = ref('createdAt');
const sortOrder = ref<'asc' | 'desc'>('desc');
const currentPage = ref(1);
const pageSize = 20;
const totalUsers = ref(0);

// 运行时配置
const mailEnabled = ref(false);
const smsEnabled = ref(false);

// 模态框状态
const showModal = ref(false);
const editingUser = ref<any | null>(null);
const formData = ref({
  username: '',
  email: '',
  phone: '',
  password: '',
  roleId: '',
  nickname: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
});

const showDeleteConfirm = ref(false);
const userToDelete = ref<string | null>(null);
const deleteImmediately = ref(false);

// 配额相关
const showQuotaModal = ref(false);
const quotaLoading = ref(false);
const quotaUser = ref<any | null>(null);
const userQuota = ref(10);
const defaultQuota = ref(10);

// 清理相关
const showCleanupModal = ref(false);
const cleanupLoading = ref(false);
const cleanupStats = ref<{ pendingCleanup: number; expiryDate: string; delayDays: number } | null>(null);

// 成功提示
const showSuccess = ref(false);
const successMessage = ref('');

// 表单验证
const formRef = ref();
const validForm = ref(false);
const usernameRules = [
  (v: string) => !!v || '用户名不能为空',
  (v: string) => (v && v.length >= 3) || '用户名至少3个字符',
  (v: string) => (v && v.length <= 20) || '用户名最多20个字符',
  (v: string) => /^[a-zA-Z0-9_]+$/.test(v) || '用户名只能包含字母、数字和下划线'
];
const emailRules = [
  (v: string) => !mailEnabled.value || !!v || '邮箱不能为空',
  (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || '请输入有效的邮箱地址'
];
const passwordRules = [
  (v: string) => editingUser.value || !!v || '密码不能为空',
  (v: string) => !v || v.length >= 8 || '密码至少8个字符',
  (v: string) => !v || v.length <= 50 || '密码最多50个字符'
];

// 计算属性
const totalPages = computed(() => Math.ceil(totalUsers.value / pageSize) || 1);

const sortValue = computed({
  get: () => `${sortBy.value}-${sortOrder.value}`,
  set: (val: string) => {
    const [field, order] = val.split('-');
    if (field) sortBy.value = field;
    sortOrder.value = order as 'asc' | 'desc';
  }
});

const sortOptions = [
  { title: '创建时间（降序）', value: 'createdAt-desc' },
  { title: '创建时间（升序）', value: 'createdAt-asc' },
  { title: '用户名（升序）', value: 'username-asc' },
  { title: '用户名（降序）', value: 'username-desc' },
  { title: '邮箱（升序）', value: 'email-asc' },
  { title: '邮箱（降序）', value: 'email-desc' }
];

const roleOptions = computed(() => [
  { title: '所有角色', value: '' },
  ...roles.value.map((r: any) => ({
    title: getRoleDisplayName(r.name, r.isSystem),
    value: r.id
  }))
]);

const roleSelectOptions = computed(() =>
  roles.value.map((r: any) => ({
    title: getRoleDisplayName(r.name, r.isSystem),
    value: r.id
  }))
);

const statusOptions = [
  { title: '正常', value: 'ACTIVE' },
  { title: '未激活', value: 'INACTIVE' },
  { title: '已禁用', value: 'SUSPENDED' }
];

const headers = computed(() => {
  const baseHeaders = [
    { key: 'user', title: '用户', sortable: false },
    ...(mailEnabled.value ? [{ key: 'email', title: '邮箱', sortable: false }] : []),
    ...(smsEnabled.value ? [{ key: 'phone', title: '手机号', sortable: false }] : []),
    { key: 'role', title: '角色', sortable: false },
    { key: 'quota', title: '存储配额', sortable: false },
    { key: 'status', title: '状态', sortable: false },
    { key: 'actions', title: '操作', sortable: false }
  ];
  return baseHeaders;
});

// 方法
const initialize = async () => {
  const access = await checkAccess();
  if (access) {
    await Promise.all([loadData(), loadRoles(), loadRuntimeConfig()]);
  }
};

const checkAccess = async (): Promise<boolean> => {
  const access = hasPermission(SystemPermission.SYSTEM_USER_READ) ||
                 hasPermission(SystemPermission.SYSTEM_USER_CREATE) ||
                 hasPermission(SystemPermission.SYSTEM_USER_UPDATE) ||
                 hasPermission(SystemPermission.SYSTEM_USER_DELETE);
  canAccess.value = access;
  return access;
};

const loadRuntimeConfig = async () => {
  try {
    const response = await runtimeConfigApi.getPublicConfigs();
    const data = response.data as Record<string, any>;
    mailEnabled.value = data?.mailEnabled === true;
    smsEnabled.value = data?.smsEnabled === true;
  } catch (err) {
    console.error('加载运行时配置失败:', err);
    mailEnabled.value = false;
    smsEnabled.value = false;
  }
};

const loadRoles = async () => {
  try {
    const response = await rolesApi.list();
    roles.value = response.data;
  } catch (err) {
    console.error('加载角色列表失败:', err);
  }
};

const loadData = async () => {
  loading.value = true;
  error.value = null;
  try {
    const response = await usersApi.list({
      search: searchQuery.value || undefined,
      roleId: roleFilter.value || undefined,
      status: userTab.value === 'deleted' ? 'DELETED' : undefined,
      page: currentPage.value,
      limit: pageSize,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value
    });
    users.value = response.data?.users || [];
    totalUsers.value = response.data?.total || users.value.length;
  } catch (err) {
    error.value = '加载用户列表失败';
  } finally {
    loading.value = false;
  }
};

const loadCleanupStats = async () => {
  try {
    const response = await userCleanupApi.getStats();
    cleanupStats.value = {
      pendingCleanup: response.data?.pendingCleanup ?? 0,
      expiryDate: response.data?.expiryDate ?? '',
      delayDays: response.data?.delayDays ?? 30
    };
  } catch (err) {
    console.error('加载清理统计失败:', err);
  }
};

const openCleanupModal = async () => {
  await loadCleanupStats();
  showCleanupModal.value = true;
};

const handleCleanupTrigger = async () => {
  cleanupLoading.value = true;
  try {
    const response = await userCleanupApi.trigger();
    if (response.data?.success) {
      successMessage.value = `清理完成: 处理 ${response.data.processedUsers} 个用户，删除 ${response.data.deletedMembers} 个成员关系、${response.data.deletedProjects} 个项目`;
      showSuccess.value = true;
    } else {
      const errMsg = response.data?.errors?.[0] || '未知错误';
      error.value = `清理失败: ${errMsg}`;
    }
    showCleanupModal.value = false;
    await loadCleanupStats();
  } catch (err) {
    error.value = '清理操作失败';
  } finally {
    cleanupLoading.value = false;
  }
};

const openCreateModal = () => {
  editingUser.value = null;
  const defaultRole = roles.value.find((r: any) => r.name === 'USER');
  formData.value = {
    username: '',
    email: '',
    phone: '',
    password: '',
    roleId: defaultRole?.id || '',
    nickname: '',
    status: 'ACTIVE'
  };
  showModal.value = true;
};

const openEditModal = (user: any) => {
  editingUser.value = user;
  formData.value = {
    username: user.username,
    email: user.email || '',
    phone: user.phone || '',
    password: '',
    roleId: user.role?.id || '',
    nickname: user.nickname || '',
    status: user.status || 'ACTIVE'
  };
  showModal.value = true;
};

const handleSubmit = async () => {
  if (!validForm.value) return;

  loading.value = true;
  try {
    if (editingUser.value) {
      const updateData: any = {
        username: formData.value.username,
        email: formData.value.email,
        roleId: formData.value.roleId,
        nickname: formData.value.nickname,
        status: formData.value.status
      };
      if (formData.value.password) {
        updateData.password = formData.value.password;
      }
      if (smsEnabled.value && formData.value.phone) {
        updateData.phone = formData.value.phone;
      }
      await usersApi.update(editingUser.value.id, updateData);
      successMessage.value = '用户更新成功';
    } else {
      const createData: any = {
        username: formData.value.username,
        email: formData.value.email,
        password: formData.value.password,
        roleId: formData.value.roleId,
        nickname: formData.value.nickname
      };
      if (smsEnabled.value && formData.value.phone) {
        createData.phone = formData.value.phone;
      }
      await usersApi.create(createData);
      successMessage.value = '用户创建成功';
    }
    showSuccess.value = true;
    showModal.value = false;
    await loadData();
  } catch (err) {
    error.value = editingUser.value ? '更新用户失败' : '创建用户失败';
  } finally {
    loading.value = false;
  }
};

const openDeleteConfirm = (id: string) => {
  userToDelete.value = id;
  deleteImmediately.value = false;
  showDeleteConfirm.value = true;
};

const confirmDelete = async () => {
  if (!userToDelete.value) return;

  loading.value = true;
  try {
    if (deleteImmediately.value) {
      await usersApi.deleteImmediately(userToDelete.value);
      successMessage.value = '用户立即注销成功';
    } else {
      await usersApi.delete(userToDelete.value);
      successMessage.value = '用户删除成功';
    }
    showSuccess.value = true;
    await loadData();
  } catch (err) {
    error.value = '删除用户失败';
  } finally {
    loading.value = false;
    showDeleteConfirm.value = false;
    userToDelete.value = null;
    deleteImmediately.value = false;
  }
};

const cancelDelete = () => {
  showDeleteConfirm.value = false;
  userToDelete.value = null;
  deleteImmediately.value = false;
};

const restoreUser = async (id: string) => {
  loading.value = true;
  try {
    await usersApi.restore(id);
    successMessage.value = '用户已恢复';
    showSuccess.value = true;
    await loadData();
  } catch (err) {
    error.value = '恢复用户失败';
  } finally {
    loading.value = false;
  }
};

const openQuotaModal = async (user: any) => {
  quotaUser.value = user;
  showQuotaModal.value = true;
  quotaLoading.value = true;

  try {
    const configResponse = await runtimeConfigApi.getPublicConfigs();
    const configs = configResponse.data as Record<string, number>;
    defaultQuota.value = configs?.userStorageQuota || 10;

    const personalSpaceResponse = await projectsApi.getUserPersonalSpace(user.id);
    const personalSpace = personalSpaceResponse.data;

    if (personalSpace && personalSpace.id) {
      const quotaResponse = await projectsApi.getQuota(personalSpace.id);
      if (quotaResponse.data && quotaResponse.data.total) {
        const totalGB = Math.round(quotaResponse.data.total / (1024 * 1024 * 1024));
        userQuota.value = totalGB;
      } else {
        userQuota.value = defaultQuota.value;
      }
    } else {
      userQuota.value = defaultQuota.value;
    }
  } catch (err) {
    console.error('获取用户配额失败:', err);
    error.value = '获取用户配额失败';
  } finally {
    quotaLoading.value = false;
  }
};

const saveUserQuota = async () => {
  if (!quotaUser.value) return;

  quotaLoading.value = true;
  try {
    const personalSpaceResponse = await projectsApi.getUserPersonalSpace(quotaUser.value.id);
    const personalSpace = personalSpaceResponse.data;

    if (!personalSpace || !personalSpace.id) {
      error.value = '无法获取用户个人空间';
      return;
    }

    await projectsApi.updateStorageQuota(personalSpace.id, userQuota.value);
    successMessage.value = `用户 ${quotaUser.value.nickname || quotaUser.value.username} 的配额已更新为 ${userQuota.value} GB`;
    showSuccess.value = true;
    showQuotaModal.value = false;
  } catch (err: any) {
    console.error('保存用户配额失败:', err);
    error.value = err.response?.data?.message || '保存配额失败';
  } finally {
    quotaLoading.value = false;
  }
};

const getRoleName = (role: string) => {
  return getRoleDisplayName(role, false);
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'ACTIVE': return 'success';
    case 'INACTIVE': return 'warning';
    case 'SUSPENDED': return 'error';
    default: return 'info';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'ACTIVE': return '正常';
    case 'INACTIVE': return '未激活';
    case 'SUSPENDED': return '已禁用';
    default: return status;
  }
};

const formatQuota = (gb: number) => `${gb} GB`;

// 监听
watch([searchQuery, roleFilter, sortBy, sortOrder, currentPage, userTab], () => {
  if (canAccess.value && hasReadPermission.value) {
    loadData();
  }
});

// 生命周期
onMounted(() => {
  initialize();
});
</script>

<style scoped>
.users-table :deep(.v-data-table__wrapper) {
  overflow-x: auto;
}
</style>
