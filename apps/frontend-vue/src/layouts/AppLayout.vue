<template>
  <v-navigation-drawer
    v-model="drawer"
    :rail="rail"
    :width="280"
    :rail-width="68"
    :temporary="isMobile"
    :permanent="!isMobile"
    color="surface"
    border="none"
    class="app-sidebar"
  >
    <!-- Logo 区域 -->
    <template #prepend>
      <div class="d-flex align-center pa-4" :class="rail ? 'justify-center' : 'ga-3'">
        <v-avatar size="36" color="primary" variant="flat">
          <v-icon size="20" icon="mdi-vector-polygon" />
        </v-avatar>
        <template v-if="!rail">
          <div>
            <div class="text-subtitle-2 font-weight-bold text-high-emphasis">
              CloudCAD
            </div>
            <div class="text-caption text-medium-emphasis">{{ t('app.subtitle') }}</div>
          </div>
        </template>
      </div>
    </template>

    <!-- 导航菜单 -->
    <v-list density="comfortable" nav class="px-2">
      <!-- 主菜单 -->
      <template v-if="mainNavItems.length">
        <v-list-subheader v-if="!rail" class="text-caption font-weight-bold">
          {{ t('nav.mainMenu') }}
        </v-list-subheader>
        <v-list-item
          v-for="item in mainNavItems"
          :key="item.to"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="item.label"
          rounded="lg"
          slim
          color="primary"
        />
      </template>

      <!-- 管理菜单 -->
      <template v-if="adminNavItems.length">
        <v-divider class="my-2 mx-2" />
        <v-list-subheader v-if="!rail" class="text-caption font-weight-bold">
          {{ t('nav.systemManagement') }}
        </v-list-subheader>
        <v-list-item
          v-for="item in adminNavItems"
          :key="item.to"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="item.label"
          rounded="lg"
          slim
          color="primary"
        />
      </template>
    </v-list>

    <!-- 底部用户区域 -->
    <template #append>
      <v-divider />
      <div class="pa-3">
        <v-menu location="top" offset="8">
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              variant="text"
              block
              rounded="lg"
              class="justify-start px-3"
            >
              <v-avatar size="32" color="primary" class="mr-3">
                <span class="text-caption font-weight-bold text-white">
                  {{ userInitial }}
                </span>
              </v-avatar>
              <template v-if="!rail">
                <div class="text-left flex-grow-1">
                  <div class="text-body-2 font-weight-medium text-truncate">
                    {{ userDisplayName }}
                  </div>
                  <div class="text-caption text-medium-emphasis text-truncate">
                    {{ userRoleName }}
                  </div>
                </div>
                <v-icon size="16" icon="mdi-chevron-up" />
              </template>
            </v-btn>
          </template>

          <v-card rounded="lg" width="200" elevation="8">
            <v-list density="comfortable" slim>
              <v-list-item
                to="/profile"
                prepend-icon="mdi-account-outline"
                :title="t('nav.profile')"
              />
              <v-list-item
                prepend-icon="mdi-logout"
                :title="t('nav.logout')"
                base-color="error"
                @click="showLogoutConfirm = true"
              />
            </v-list>
          </v-card>
        </v-menu>
      </div>
    </template>
  </v-navigation-drawer>

  <!-- 顶部导航栏 -->
  <v-app-bar flat color="surface" border="b" height="56">
    <template #prepend>
      <v-btn
        :icon="rail ? 'mdi-menu' : 'mdi-menu-open'"
        variant="text"
        @click="toggleRail"
      />
    </template>

    <v-app-bar-title class="text-body-1 font-weight-medium">
      {{ currentTitle }}
    </v-app-bar-title>

    <template #append>
      <v-btn
        :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
        variant="text"
        @click="toggleTheme"
      />
    </template>
  </v-app-bar>

  <!-- 主内容 -->
  <v-main>
    <v-container fluid class="pa-4 pa-md-6">
      <router-view />
    </v-container>
  </v-main>

  <!-- 退出确认对话框 -->
  <v-dialog v-model="showLogoutConfirm" max-width="400" persistent>
    <v-card rounded="lg">
      <v-card-item>
        <template #title>{{ t('auth.confirmLogout') }}</template>
        <template #subtitle>{{ t('auth.logoutDescription') }}</template>
      </v-card-item>
      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="showLogoutConfirm = false">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="error"
          variant="flat"
          :loading="isLoggingOut"
          @click="handleLogout"
        >
          {{ t('auth.confirmLogout') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { useTheme as useVuetifyTheme } from 'vuetify';
import { useTheme } from '@/composables/useTheme';
import { SystemPermission } from '@/constants/permissions';
import { getRoleDisplayName } from '@/constants/permissions';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const route = useRoute();
const auth = useAuthStore();
const vuetifyTheme = useVuetifyTheme();
const { toggleTheme: doToggleTheme } = useTheme();

// ===== 侧边栏状态 =====
const drawer = ref(true);
const rail = ref(false);
const isMobile = ref(false);
const showLogoutConfirm = ref(false);
const isLoggingOut = ref(false);

function toggleRail(): void {
  if (isMobile.value) {
    drawer.value = !drawer.value;
  } else {
    rail.value = !rail.value;
  }
}

// ===== 主题 =====
const isDark = computed(() => vuetifyTheme.global.current.value.dark);

function toggleTheme(): void {
  doToggleTheme();
}

// ===== 导航菜单配置 =====
interface NavItem {
  to: string;
  icon: string;
  label: string;
  permission?: string;
}

const getNavItems = (): NavItem[] => [
  // 主菜单
  {
    to: '/dashboard',
    icon: 'mdi-view-dashboard-outline',
    label: t('nav.dashboard'),
  },
  {
    to: '/projects',
    icon: 'mdi-folder-open-outline',
    label: t('nav.projects'),
  },
  {
    to: '/personal-space',
    icon: 'mdi-file-document-outline',
    label: t('nav.myDrawings'),
  },
  // 管理菜单
  {
    to: '/library',
    icon: 'mdi-bookshelf',
    label: t('nav.publicLibrary'),
    permission: SystemPermission.LIBRARY_DRAWING_MANAGE,
  },
  {
    to: '/font-library',
    icon: 'mdi-format-font',
    label: t('nav.fontLibrary'),
    permission: SystemPermission.SYSTEM_FONT_READ,
  },
  {
    to: '/users',
    icon: 'mdi-account-group-outline',
    label: t('nav.userManagement'),
    permission: SystemPermission.SYSTEM_USER_READ,
  },
  {
    to: '/roles',
    icon: 'mdi-shield-check-outline',
    label: t('nav.rolePermission'),
    permission: SystemPermission.SYSTEM_ROLE_READ,
  },
  {
    to: '/audit-logs',
    icon: 'mdi-clipboard-text-clock-outline',
    label: t('nav.auditLog'),
    permission: SystemPermission.SYSTEM_ADMIN,
  },
  {
    to: '/system-monitor',
    icon: 'mdi-monitor-dashboard',
    label: t('nav.systemMonitor'),
    permission: SystemPermission.SYSTEM_MONITOR,
  },
];

const allNavItems = computed(() => getNavItems());

const userPermissions = computed<string[]>(() => {
  return auth.user?.role?.permissions?.map((p) => p.permission) ?? [];
});

function hasPermission(perm: string | undefined): boolean {
  if (!perm) return true;
  return userPermissions.value.includes(perm);
}

const mainNavItems = computed(() =>
  allNavItems.slice(0, 3).filter((item) => hasPermission(item.permission))
);

const adminNavItems = computed(() =>
  allNavItems
    .slice(3)
    .filter((item) => hasPermission(item.permission))
);

// ===== 用户信息 =====
const userInitial = computed(() => {
  const name =
    auth.user?.nickname || auth.user?.username || auth.user?.email || 'U';
  return name.charAt(0).toUpperCase();
});

const userDisplayName = computed(() => {
  return (
    auth.user?.nickname || auth.user?.username || auth.user?.email || t('common.defaultUser')
  );
});

const userRoleName = computed(() => {
  if (!auth.user?.role?.name) return '';
  return getRoleDisplayName(auth.user.role.name);
});

// ===== 页面标题 =====
const currentTitle = computed(() => {
  return (route.meta.title as string) || 'CloudCAD';
});

// ===== 登出 =====
async function handleLogout(): Promise<void> {
  isLoggingOut.value = true;
  try {
    auth.clearAuth();
    window.location.href = '/login';
  } finally {
    isLoggingOut.value = false;
  }
}

// ===== 响应式处理 =====
function onResize(): void {
  isMobile.value = window.innerWidth < 960;
  if (isMobile.value) {
    drawer.value = false;
    rail.value = false;
  } else {
    drawer.value = true;
  }
}

onMounted(() => {
  onResize();
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
});
</script>
