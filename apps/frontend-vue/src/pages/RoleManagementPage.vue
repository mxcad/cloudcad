<template>
  <!-- 来源：apps/frontend/src/pages/RoleManagement.tsx -->
  <v-container class="role-management-page pa-6" :class="{ 'theme-dark': isDark }">
    <!-- 成功/错误提示 -->
    <v-snackbar v-model="showSuccess" color="success" :timeout="3000" location="top right">
      <div class="d-flex align-center ga-2">
        <v-icon icon="mdi-check-circle" />
        <span>{{ successMessage }}</span>
      </div>
    </v-snackbar>

    <v-snackbar v-model="showError" color="error" :timeout="5000" location="top right">
      <div class="d-flex align-center ga-2">
        <v-icon icon="mdi-alert-circle" />
        <span>{{ errorMessage }}</span>
      </div>
    </v-snackbar>

    <!-- 无权限状态 -->
    <div v-if="!canAccess" class="access-denied-container">
      <v-card class="access-denied-card" rounded="xl" variant="outlined">
        <div class="access-denied-icon">
          <v-icon icon="mdi-shield-lock" size="64" color="error" />
        </div>
        <h2 class="text-h5 font-weight-bold text-center mb-2">{{ t('roleManagement.accessDenied') }}</h2>
        <p class="text-body-1 text-medium-emphasis text-center">
          {{ t('roleManagement.noPermission') }}
        </p>
      </v-card>
    </div>

    <!-- 主内容 -->
    <div v-else class="main-content">
      <!-- 页面头部 -->
      <div class="page-header mb-6">
        <div class="d-flex align-center ga-4">
          <v-avatar size="56" color="primary" rounded="xl">
            <v-icon icon="mdi-shield-account" size="28" color="white" />
          </v-avatar>
          <div>
            <h1 class="text-h5 font-weight-bold">{{ t('roleManagement.title') }}</h1>
            <p class="text-body-2 text-medium-emphasis">{{ t('roleManagement.subtitle') }}</p>
          </div>
        </div>
        <div class="d-flex ga-3">
          <v-btn
            v-if="hasPermission(SystemPermission.ROLE_CREATE)"
            color="primary"
            :disabled="loading"
            @click="handleOpenCreate"
          >
            <v-icon start icon="mdi-plus" />
            {{ t('roleManagement.addRole') }}
          </v-btn>
        </div>
      </div>

      <!-- 角色列表 -->
      <v-card rounded="xl" variant="outlined">
        <!-- 加载状态 -->
        <div v-if="loading && roles.length === 0" class="loading-container">
          <v-progress-circular indeterminate color="primary" size="48" />
          <p class="text-body-1 text-medium-emphasis mt-4">{{ t('roleManagement.loading') }}</p>
        </div>

        <!-- 空状态 -->
        <div v-else-if="roles.length === 0" class="empty-container">
          <v-icon icon="mdi-shield-account-outline" size="80" color="grey-lighten-1" />
          <h3 class="text-h6 font-weight-bold mt-4">{{ t('roleManagement.noRoles') }}</h3>
          <p class="text-body-2 text-medium-emphasis mt-2">
            {{ t('roleManagement.noRolesHint') }}
          </p>
          <v-btn
            v-if="hasPermission(SystemPermission.ROLE_CREATE)"
            color="primary"
            class="mt-4"
            @click="handleOpenCreate"
          >
            <v-icon start icon="mdi-plus" />
            {{ t('roleManagement.addRole') }}
          </v-btn>
        </div>

        <!-- 角色表格 -->
        <v-table v-else>
          <thead>
            <tr>
              <th class="text-left">{{ t('roleManagement.roleName') }}</th>
              <th class="text-left">{{ t('roleManagement.description') }}</th>
              <th class="text-center">{{ t('roleManagement.permissionCount') }}</th>
              <th class="text-left">{{ t('roleManagement.type') }}</th>
              <th class="text-right">{{ t('roleManagement.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="role in roles" :key="role.id" class="role-row">
              <td>
                <div class="d-flex align-center ga-3">
                  <v-avatar size="40" color="primary" rounded="lg">
                    <v-icon icon="mdi-shield" color="white" />
                  </v-avatar>
                  <div>
                    <div class="font-weight-medium">{{ getRoleDisplayName(role.name, role.isSystem) }}</div>
                    <div class="text-caption text-medium-emphasis">{{ role.name }}</div>
                  </div>
                </div>
              </td>
              <td>
                <span class="text-body-2">{{ role.description || '-' }}</span>
              </td>
              <td class="text-center">
                <v-chip size="small" variant="tonal" color="primary">
                  {{ role.permissions?.length || 0 }}
                </v-chip>
              </td>
              <td>
                <v-chip
                  v-if="role.isSystem"
                  size="small"
                  color="error"
                  variant="tonal"
                >
                  {{ t('roleManagement.systemRole') }}
                </v-chip>
                <v-chip
                  v-else
                  size="small"
                  color="success"
                  variant="tonal"
                >
                  {{ t('roleManagement.custom') }}
                </v-chip>
              </td>
              <td class="text-right">
                <div class="d-flex justify-end ga-1">
                  <v-btn
                    v-if="hasPermission(SystemPermission.ROLE_UPDATE)"
                    icon
                    variant="text"
                    size="small"
                    color="primary"
                    :disabled="role.isSystem"
                    @click="handleOpenEdit(role)"
                  >
                    <v-icon icon="mdi-pencil" size="18" />
                  </v-btn>
                  <v-btn
                    v-if="hasPermission(SystemPermission.ROLE_UPDATE)"
                    icon
                    variant="text"
                    size="small"
                    color="warning"
                    @click="handleOpenPermissions(role)"
                  >
                    <v-icon icon="mdi-key" size="18" />
                  </v-btn>
                  <v-btn
                    v-if="hasPermission(SystemPermission.ROLE_DELETE)"
                    icon
                    variant="text"
                    size="small"
                    color="error"
                    :disabled="role.isSystem"
                    @click="handleDelete(role.id)"
                  >
                    <v-icon icon="mdi-delete" size="18" />
                  </v-btn>
                </div>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </div>

    <!-- 创建/编辑角色模态框 -->
    <v-dialog v-model="isModalOpen" max-width="600" persistent>
      <v-card rounded="xl">
        <v-card-title class="d-flex align-center justify-space-between pa-4">
          <span class="text-h6 font-weight-bold">{{ editingRole ? t('roleManagement.editRole') : t('roleManagement.addNewRole') }}</span>
          <v-btn icon variant="text" @click="isModalOpen = false">
            <v-icon icon="mdi-close" />
          </v-btn>
        </v-card-title>
        <v-card-text class="pa-4">
          <v-form @submit.prevent="handleSubmit">
            <v-text-field
              v-model="formData.name"
              :label="t('roleManagement.roleName')"
              :placeholder="t('roleManagement.enterRoleName')"
              :error-messages="formErrors.name"
              required
              variant="outlined"
              density="compact"
              class="mb-4"
            />
            <v-textarea
              v-model="formData.description"
              :label="t('roleManagement.roleDescription')"
              :placeholder="t('roleManagement.enterRoleDescription')"
              variant="outlined"
              density="compact"
              rows="3"
              auto-grow
            />
          </v-form>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="isModalOpen = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="submitting" @click="handleSubmit">
            {{ submitting ? t('roleManagement.processing') : (editingRole ? t('roleManagement.saveChanges') : t('roleManagement.createRole')) }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 权限配置模态框 -->
    <v-dialog v-model="permissionsModalOpen" max-width="800" persistent>
      <v-card rounded="xl">
        <v-card-title class="d-flex align-center justify-space-between pa-4">
          <span class="text-h6 font-weight-bold">
            {{ t('roleManagement.configurePermissions') }} {{ getRoleDisplayName(selectedRole?.name, selectedRole?.isSystem) }}
          </span>
          <v-btn icon variant="text" @click="permissionsModalOpen = false">
            <v-icon icon="mdi-close" />
          </v-btn>
        </v-card-title>
        <v-card-text class="pa-4">
          <v-tabs v-model="permissionTab" class="mb-4">
            <v-tab value="system">{{ t('roleManagement.systemPermissions') }}</v-tab>
            <v-tab value="project">{{ t('roleManagement.projectPermissions') }}</v-tab>
          </v-tabs>

          <v-window v-model="permissionTab">
            <v-window-item value="system">
              <div class="permission-groups">
                <div
                  v-for="group in systemPermissionGroups"
                  :key="group.category"
                  class="permission-group mb-4"
                >
                  <div class="d-flex align-center ga-2 mb-2">
                    <v-icon :icon="group.icon" size="20" color="primary" />
                    <span class="font-weight-bold">{{ group.category }}</span>
                  </div>
                  <v-row>
                    <v-col
                      v-for="perm in group.permissions"
                      :key="perm"
                      cols="12"
                      sm="6"
                      md="4"
                    >
                      <v-checkbox
                        v-model="selectedPermissions"
                        :label="perm"
                        :value="perm"
                        density="compact"
                        hide-details
                        :disabled="selectedRole?.isSystem"
                      />
                    </v-col>
                  </v-row>
                </div>
              </div>
            </v-window-item>

            <v-window-item value="project">
              <div class="permission-groups">
                <div
                  v-for="group in projectPermissionGroups"
                  :key="group.category"
                  class="permission-group mb-4"
                >
                  <div class="d-flex align-center ga-2 mb-2">
                    <v-icon :icon="group.icon" size="20" color="primary" />
                    <span class="font-weight-bold">{{ group.category }}</span>
                  </div>
                  <v-row>
                    <v-col
                      v-for="perm in group.permissions"
                      :key="perm"
                      cols="12"
                      sm="6"
                      md="4"
                    >
                      <v-checkbox
                        v-model="selectedPermissions"
                        :label="perm"
                        :value="perm"
                        density="compact"
                        hide-details
                        :disabled="selectedRole?.isSystem"
                      />
                    </v-col>
                  </v-row>
                </div>
              </div>
            </v-window-item>
          </v-window>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="permissionsModalOpen = false">{{ t('common.cancel') }}</v-btn>
          <v-btn
            color="primary"
            :loading="permissionsSaving"
            :disabled="selectedRole?.isSystem"
            @click="handleSavePermissions"
          >
            {{ permissionsSaving ? t('roleManagement.saving') : t('roleManagement.savePermissions') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 删除确认模态框 -->
    <v-dialog v-model="deleteConfirmOpen" max-width="400" persistent>
      <v-card rounded="xl">
        <v-card-title class="pa-4">
          <span class="text-h6 font-weight-bold">{{ t('roleManagement.confirmDeleteRole') }}</span>
        </v-card-title>
        <v-card-text class="pa-4">
          <v-alert type="warning" variant="tonal" class="mb-4">
            <div class="d-flex align-start ga-2">
              <v-icon icon="mdi-alert-circle" class="mt-1" />
              <div>
                <p class="font-weight-bold mb-1">{{ t('roleManagement.deleteRole') }}</p>
                <p class="text-body-2 mb-0">
                  {{ t('roleManagement.deleteWarning') }}
                </p>
              </div>
            </div>
          </v-alert>
          <p class="text-body-2">{{ t('roleManagement.confirmDelete') }}</p>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="deleteConfirmOpen = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="error" :loading="deleting" @click="confirmDelete">{{ t('common.delete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
// 来源：apps/frontend/src/pages/RoleManagement.tsx

import { ref, computed, onMounted } from 'vue';
import { useTheme } from 'vuetify';
import { SystemPermission, getRoleDisplayName } from '@/constants/permissions';
import { rolesApi, type RoleDto } from '@/services/rolesApi';
import { useAuthStore } from '@/stores/auth.store';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const { isDark } = useTheme();
const authStore = useAuthStore();

const user = computed(() => authStore.user);

const hasPermission = (permission: string): boolean => {
  const perms = user.value?.role?.permissions?.map((p: { permission: string }) => p.permission) ?? [];
  return perms.includes(permission);
};

const canAccess = computed(() =>
  hasPermission(SystemPermission.ROLE_READ) ||
  hasPermission(SystemPermission.ROLE_CREATE) ||
  hasPermission(SystemPermission.ROLE_UPDATE) ||
  hasPermission(SystemPermission.ROLE_DELETE)
);

// 状态
const loading = ref(false);
const submitting = ref(false);
const deleting = ref(false);
const permissionsSaving = ref(false);
const roles = ref<RoleDto[]>([]);

// 模态框状态
const isModalOpen = ref(false);
const editingRole = ref<RoleDto | null>(null);
const permissionsModalOpen = ref(false);
const selectedRole = ref<RoleDto | null>(null);
const permissionTab = ref('system');
const selectedPermissions = ref<string[]>([]);

const formData = ref({
  name: '',
  description: '',
});
const formErrors = ref({
  name: '',
});

const deleteConfirmOpen = ref(false);
const roleToDelete = ref<string | null>(null);

// 权限分组
const systemPermissionGroups = [
  {
    category: t('roleManagement.userManagement'),
    icon: 'mdi-account-multiple',
    permissions: [
      'SYSTEM_USER_READ',
      'SYSTEM_USER_CREATE',
      'SYSTEM_USER_UPDATE',
      'SYSTEM_USER_DELETE',
    ],
  },
  {
    category: t('roleManagement.roleManagement'),
    icon: 'mdi-shield-account',
    permissions: [
      'ROLE_READ',
      'ROLE_CREATE',
      'ROLE_UPDATE',
      'ROLE_DELETE',
    ],
  },
  {
    category: t('roleManagement.systemConfig'),
    icon: 'mdi-cog',
    permissions: [
      'SYSTEM_CONFIG_READ',
      'SYSTEM_CONFIG_UPDATE',
      'SYSTEM_ADMIN',
    ],
  },
];

const projectPermissionGroups = [
  {
    category: t('roleManagement.projectManagement'),
    icon: 'mdi-folder',
    permissions: [
      'PROJECT_READ',
      'PROJECT_CREATE',
      'PROJECT_UPDATE',
      'PROJECT_DELETE',
    ],
  },
  {
    category: t('roleManagement.fileManagement'),
    icon: 'mdi-file',
    permissions: [
      'FILE_READ',
      'FILE_UPLOAD',
      'FILE_DOWNLOAD',
      'FILE_DELETE',
    ],
  },
  {
    category: t('roleManagement.libraryManagement'),
    icon: 'mdi-library',
    permissions: [
      'LIBRARY_READ',
      'LIBRARY_CREATE',
      'LIBRARY_DELETE',
    ],
  },
];

// 提示
const showSuccess = ref(false);
const showError = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

const showSnackbar = (message: string, type: 'success' | 'error') => {
  if (type === 'success') {
    successMessage.value = message;
    showSuccess.value = true;
  } else {
    errorMessage.value = message;
    showError.value = true;
  }
};

// 来源：RoleManagement.tsx loadRoles
const loadRoles = async () => {
  loading.value = true;
  try {
    const response = await rolesApi.list();
    roles.value = response.data || [];
  } catch (error) {
    showSnackbar(t('roleManagement.loadFailed'), 'error');
  } finally {
    loading.value = false;
  }
};

// 来源：RoleManagement.tsx handleOpenCreate
const handleOpenCreate = () => {
  editingRole.value = null;
  formData.value = {
    name: '',
    description: '',
  };
  formErrors.value = { name: '' };
  isModalOpen.value = true;
};

// 来源：RoleManagement.tsx handleOpenEdit
const handleOpenEdit = (role: RoleDto) => {
  editingRole.value = role;
  formData.value = {
    name: role.name,
    description: role.description || '',
  };
  formErrors.value = { name: '' };
  isModalOpen.value = true;
};

// 来源：RoleManagement.tsx handleOpenPermissions
const handleOpenPermissions = async (role: RoleDto) => {
  selectedRole.value = role;
  permissionsModalOpen.value = true;
  permissionsSaving.value = false;
  permissionTab.value = 'system';

  try {
    const response = await rolesApi.getPermissions(role.id);
    selectedPermissions.value = response.data || [];
  } catch (error) {
    selectedPermissions.value = role.permissions || [];
  }
};

// 来源：RoleManagement.tsx validateForm
const validateForm = (): boolean => {
  const errors = { name: '' };

  if (!formData.value.name) {
    errors.name = t('roleManagement.roleNameRequired');
  } else if (formData.value.name.length < 2) {
    errors.name = t('roleManagement.roleNameMin2');
  } else if (formData.value.name.length > 50) {
    errors.name = t('roleManagement.roleNameMax50');
  }

  formErrors.value = errors;
  return !errors.name;
};

// 来源：RoleManagement.tsx handleSubmit
const handleSubmit = async () => {
  if (!validateForm()) return;

  submitting.value = true;
  try {
    if (editingRole.value) {
      await rolesApi.update(editingRole.value.id, {
        name: formData.value.name,
        description: formData.value.description,
      });
      showSnackbar(t('roleManagement.updateSuccess'), 'success');
    } else {
      await rolesApi.create({
        name: formData.value.name,
        description: formData.value.description,
        permissions: [],
      });
      showSnackbar(t('roleManagement.createSuccess'), 'success');
    }

    isModalOpen.value = false;
    await loadRoles();
  } catch (error) {
    showSnackbar(editingRole.value ? t('roleManagement.updateFailed') : t('roleManagement.createFailed'), 'error');
  } finally {
    submitting.value = false;
  }
};

// 来源：RoleManagement.tsx handleSavePermissions
const handleSavePermissions = async () => {
  if (!selectedRole.value) return;

  permissionsSaving.value = true;
  try {
    const currentPerms = new Set(selectedPermissions.value);
    const originalPerms = new Set(selectedRole.value.permissions || []);

    const toAdd = [...currentPerms].filter(p => !originalPerms.has(p));
    const toRemove = [...originalPerms].filter(p => !currentPerms.has(p));

    if (toAdd.length > 0) {
      await rolesApi.addPermissions(selectedRole.value.id, toAdd);
    }
    if (toRemove.length > 0) {
      await rolesApi.removePermissions(selectedRole.value.id, toRemove);
    }

    showSnackbar(t('roleManagement.permissionsUpdateSuccess'), 'success');
    permissionsModalOpen.value = false;
    await loadRoles();
  } catch (error) {
    showSnackbar(t('roleManagement.permissionsUpdateFailed'), 'error');
  } finally {
    permissionsSaving.value = false;
  }
};

// 来源：RoleManagement.tsx handleDelete
const handleDelete = (id: string) => {
  roleToDelete.value = id;
  deleteConfirmOpen.value = true;
};

// 来源：RoleManagement.tsx confirmDelete
const confirmDelete = async () => {
  if (!roleToDelete.value) return;

  deleting.value = true;
  try {
    await rolesApi.delete(roleToDelete.value);
    showSnackbar(t('roleManagement.deleteSuccess'), 'success');
    await loadRoles();
  } catch (error) {
    showSnackbar(t('roleManagement.deleteFailed'), 'error');
  } finally {
    deleting.value = false;
    deleteConfirmOpen.value = false;
    roleToDelete.value = null;
  }
};

onMounted(() => {
  if (canAccess.value) {
    loadRoles();
  }
});
</script>

<style scoped>
.role-management-page {
  max-width: 1200px;
  margin: 0 auto;
}

.access-denied-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
}

.access-denied-card {
  max-width: 500px;
  padding: 48px;
  text-align: center;
}

.access-denied-icon {
  margin-bottom: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.loading-container,
.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 48px;
}

.role-row {
  transition: background-color 0.2s;
}

.role-row:hover {
  background-color: rgba(var(--v-theme-primary), 0.05);
}

.permission-group {
  padding: 16px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
}
</style>
