<template>
  <v-dialog :model-value="isOpen" @update:model-value="$emit('update:isOpen', $event)" max-width="600" persistent>
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>{{ t('project.members') }}</span>
        <v-btn icon="mdi-close" variant="text" size="small" @click="onClose" />
      </v-card-title>

      <v-card-text class="pa-4">
        <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
          {{ errorMessage }}
        </v-alert>

        <v-btn
          v-if="canManageMembers && !showAddForm"
          block
          variant="outlined"
          color="primary"
          class="mb-4"
          @click="showAddForm = true"
        >
          <v-icon start>mdi-account-plus</v-icon>
          {{ t('project.addMember') }}
        </v-btn>

        <v-form v-if="showAddForm" class="mb-4 pa-4 rounded bg-surface-variant" @submit.prevent="handleAddMember">
          <div class="d-flex align-center mb-3">
            <v-icon start size="18">mdi-account-plus</v-icon>
            <span class="text-body-2 font-weight-medium">{{ t('project.addNewMember') }}</span>
            <v-spacer />
            <v-btn icon="mdi-close" variant="text" size="x-small" @click="resetAddForm" />
          </div>

          <v-autocomplete
            v-model="selectedUser"
            v-model:search="newEmail"
            :items="searchResults"
            :loading="searching"
            item-title="email"
            item-value="id"
            :label="t('project.searchUser')"
            :return-object="true"
            class="mb-3"
            auto-select-first
            no-filter
            @update:search="debouncedSearch"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :title="item.raw.nickname || item.raw.username" :subtitle="item.raw.email">
                <template #prepend>
                  <v-avatar size="24" color="primary" class="mr-2">
                    <span class="text-caption">{{ (item.raw.nickname || item.raw.username || '?')[0]?.toUpperCase() }}</span>
                  </v-avatar>
                </template>
              </v-list-item>
            </template>
          </v-autocomplete>

          <v-select
            v-model="newRoleId"
            :items="availableRoles"
            item-title="name"
            item-value="id"
            :label="t('project.selectRole')"
            class="mb-3"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :title="getRoleDisplayName(item.raw.name)" />
            </template>
            <template #selection="{ item }">
              {{ getRoleDisplayName(item.raw.name) }}
            </template>
          </v-select>

          <v-btn type="submit" color="primary" block :loading="adding" :disabled="!selectedUser || !newRoleId">
            {{ t('common.add') }}
          </v-btn>
        </v-form>

        <div v-if="filteredMembers.length > 0" class="d-flex justify-space-between align-center mb-3">
          <span class="text-body-2 text-medium-emphasis">{{ t('project.memberCount', { count: filteredMembers.length }) }}</span>
          <v-select
            v-model="filterRoleId"
            :items="projectRoles"
            item-title="name"
            item-value="id"
            :label="t('project.filterRole')"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 150px"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :title="getRoleDisplayName(item.raw.name)" />
            </template>
            <template #selection="{ item }">
              {{ getRoleDisplayName(item.raw.name) }}
            </template>
          </v-select>
        </div>

        <v-list v-if="loading">
          <v-list-item>
            <template #prepend>
              <v-progress-circular indeterminate size="24" />
            </template>
            <v-list-item-title>{{ t('common.loading') }}</v-list-item-title>
          </v-list-item>
        </v-list>

        <v-list v-else-if="filteredMembers.length === 0">
          <v-list-item>
            <v-list-item-title class="text-center text-medium-emphasis">
              {{ filterRoleId ? t('project.noMatchingMembers') : t('project.noMembers') }}
            </v-list-item-title>
          </v-list-item>
        </v-list>

        <v-list v-else density="compact">
          <v-list-item v-for="member in filteredMembers" :key="member.id" class="mb-2 rounded bg-surface-variant">
            <template #prepend>
              <v-avatar size="32" color="primary" class="mr-3">
                <span>{{ (member.nickname || member.username || member.email || '?')[0]?.toUpperCase() }}</span>
              </v-avatar>
            </template>

            <v-list-item-title>{{ member.nickname || member.username }}</v-list-item-title>
            <v-list-item-subtitle>{{ member.email }}</v-list-item-subtitle>

            <v-list-item-action v-if="member.projectRoleName === 'PROJECT_OWNER'">
              <v-chip size="small" color="primary" variant="tonal">{{ t('project.roleOwner') }}</v-chip>
            </v-list-item-action>

            <v-list-item-action v-else-if="canAssignRoles">
              <div class="d-flex align-center ga-2">
                <v-select
                  :model-value="member.projectRoleId"
                  :items="availableRoles"
                  item-title="name"
                  item-value="id"
                  density="compact"
                  variant="outlined"
                  hide-details
                  style="max-width: 120px"
                  @update:model-value="handleUpdateRole(member.id, $event)"
                >
                  <template #item="{ props: itemProps, item }">
                    <v-list-item v-bind="itemProps" :title="getRoleDisplayName(item.raw.name)" />
                  </template>
                  <template #selection="{ item }">
                    {{ getRoleDisplayName(item.raw.name) }}
                  </template>
                </v-select>
                <v-btn
                  icon="mdi-close"
                  variant="text"
                  size="small"
                  color="error"
                  @click="handleRemoveMember(member.id)"
                />
              </div>
            </v-list-item-action>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onClose">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showTransferModal" max-width="400" persistent>
    <v-card>
      <v-card-title>{{ t('project.transferOwnership') }}</v-card-title>
      <v-card-text>
        <v-alert type="warning" variant="tonal" class="mb-4">
          <strong>{{ t('project.importantNotice') }}</strong>
          <p class="mt-2">{{ t('project.transferWarning') }}</p>
        </v-alert>

        <div class="d-flex align-center pa-3 rounded bg-surface-variant">
          <v-avatar size="40" color="primary" class="mr-3">
            <span>{{ (transferTarget?.nickname || transferTarget?.username || transferTarget?.email || '?')[0]?.toUpperCase() }}</span>
          </v-avatar>
          <div>
            <div class="font-weight-medium">{{ transferTarget?.nickname || transferTarget?.username }}</div>
            <div class="text-caption text-medium-emphasis">{{ transferTarget?.email }}</div>
          </div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="showTransferModal = false; transferTarget = null">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" :loading="transferring" @click="handleTransferOwnership">{{ t('project.confirmTransfer') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { projectsApi } from '@/services/projectsApi';
import { projectRolesApi } from '@/services/rolesApi';
import { usersApi } from '@/services/usersApi';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

interface Props {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
}

const props = defineProps<Props>();

const ROLE_NAME_MAP: Record<string, string> = {
  PROJECT_OWNER: '项目所有者',
  PROJECT_ADMIN: '项目管理员',
  PROJECT_MEMBER: '项目成员',
  PROJECT_EDITOR: '项目编辑者',
  PROJECT_VIEWER: '项目查看者',
};

const getRoleDisplayName = (roleName: string): string => {
  const key = `project.role${roleName.replace('PROJECT_', '_').slice(1)}`;
  const translated = t(key);
  return translated !== key ? translated : ROLE_NAME_MAP[roleName] || roleName;
};

const members = ref<any[]>([]);
const projectRoles = ref<any[]>([]);
const loading = ref(false);
const showAddForm = ref(false);
const newEmail = ref('');
const newRoleId = ref('');
const adding = ref(false);
const errorMessage = ref('');
const filterRoleId = ref('');
const canManageMembers = ref(false);
const canAssignRoles = ref(false);

const selectedUser = ref<any | null>(null);
const searchResults = ref<any[]>([]);
const searching = ref(false);

const showTransferModal = ref(false);
const transferTarget = ref<any | null>(null);
const transferring = ref(false);

const filteredMembers = computed(() => {
  if (!filterRoleId.value) return members.value;
  return members.value.filter(m => m.projectRoleId === filterRoleId.value);
});

const availableRoles = computed(() => {
  return projectRoles.value.filter(r => r.name !== 'PROJECT_OWNER');
});

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSearch(query: string) {
  if (searchTimeout) clearTimeout(searchTimeout);
  if (!query.trim()) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  searchTimeout = setTimeout(async () => {
    try {
      const response = await usersApi.search({ keyword: query, limit: 10 });
      const users = response.data?.users || [];
      const memberUserIds = members.value.map((m: any) => m.id);
      searchResults.value = (users as any[]).filter((u: any) => !memberUserIds.includes(u.id));
    } catch {
      searchResults.value = [];
    } finally {
      searching.value = false;
    }
  }, 300);
}

async function loadMembers() {
  errorMessage.value = '';
  try {
    const response = await projectsApi.getMembers(props.projectId);
    members.value = ((response.data || []) as any[]).map((m: any) => ({ ...m, userId: m.id }));
  } catch {
    errorMessage.value = t('project.loadMembersError');
  }
}

async function loadProjectRoles() {
  try {
    const response = await projectRolesApi.getByProject(props.projectId);
    projectRoles.value = (response.data as any[]) || [];
    const defaultRole = availableRoles.value.find((r: any) => r.name === 'PROJECT_MEMBER');
    if (defaultRole) {
      newRoleId.value = defaultRole.id;
    }
  } catch (error) {
    console.error(t('project.loadRolesError'), error);
  }
}

async function handleAddMember() {
  if (!selectedUser.value || !newRoleId.value) return;

  adding.value = true;
  errorMessage.value = '';
  try {
    const response = await projectsApi.addMember(props.projectId, {
      userId: selectedUser.value.id,
      projectRoleId: newRoleId.value,
    });

    const memberData = response.data as any;
    members.value.push({
      id: memberData.user.id,
      userId: memberData.user.id,
      email: memberData.user.email,
      username: memberData.user.username,
      nickname: memberData.user.nickname,
      avatar: memberData.user.avatar,
      projectRoleId: memberData.projectRoleId,
      projectRoleName: memberData.projectRole.name,
      joinedAt: memberData.createdAt,
    });

    resetAddForm();
  } catch (error: any) {
    if (error?.response?.status === 403) {
      errorMessage.value = t('project.addMemberNoPermission');
    } else {
      errorMessage.value = t('project.addMemberError');
    }
  } finally {
    adding.value = false;
  }
}

function resetAddForm() {
  showAddForm.value = false;
  newEmail.value = '';
  newRoleId.value = '';
  selectedUser.value = null;
  searchResults.value = [];
}

async function handleRemoveMember(userId: string) {
  errorMessage.value = '';
  try {
    await projectsApi.removeMember(props.projectId, userId);
    members.value = members.value.filter((m: any) => m.userId !== userId);
  } catch (error: any) {
    if (error?.response?.status === 403) {
      errorMessage.value = t('project.removeMemberNoPermission');
    } else {
      errorMessage.value = t('project.removeMemberError');
    }
  }
}

async function handleUpdateRole(userId: string, projectRoleId: string) {
  errorMessage.value = '';
  try {
    await projectsApi.updateMember(props.projectId, userId, { projectRoleId });
    const member = members.value.find((m: any) => m.userId === userId);
    if (member) {
      member.projectRoleId = projectRoleId;
    }
  } catch (error: any) {
    if (error?.response?.status === 403) {
      errorMessage.value = t('project.updateRoleNoPermission');
    } else if (error?.response?.status === 400) {
      errorMessage.value = t('project.cannotModifyOwnerRole');
    } else {
      errorMessage.value = t('project.updateRoleError');
    }
  }
}

async function handleTransferOwnership() {
  if (!transferTarget.value) return;

  transferring.value = true;
  errorMessage.value = '';
  try {
    await projectsApi.transferOwnership(props.projectId, transferTarget.value.userId);
    await loadMembers();
    showTransferModal.value = false;
    transferTarget.value = null;
  } catch (error: any) {
    if (error?.response?.status === 403) {
      errorMessage.value = t('project.transferNoPermission');
    } else {
      errorMessage.value = t('project.transferError');
    }
  } finally {
    transferring.value = false;
  }
}

watch(() => props.isOpen, async (isOpen) => {
  if (isOpen) {
    loading.value = true;
    await Promise.all([loadMembers(), loadProjectRoles()]);
    loading.value = false;
  }
});
</script>
