<template>
  <div class="dashboard-page">
    <header class="pa-4">
      <div class="d-flex align-center justify-space-between">
        <div>
          <h1 class="text-h5 font-weight-bold mb-1">{{ greeting }}，{{ userName }}</h1>
          <p class="text-body-2 text-medium-emphasis">{{ t('dashboard.welcomeBack', { appName: appName }) }}</p>
        </div>
        <div class="d-flex align-center ga-2">
          <v-btn
            v-if="!isDark"
            icon
            variant="text"
            size="small"
            @click="toggleTheme()"
          >
            <v-icon>mdi-brightness-7</v-icon>
          </v-btn>
          <v-btn
            v-else
            icon
            variant="text"
            size="small"
            @click="toggleTheme()"
          >
            <v-icon>mdi-brightness-4</v-icon>
          </v-btn>
          <v-btn
            icon
            variant="text"
            size="small"
            @click="loadData()"
          >
            <v-icon>mdi-refresh</v-icon>
          </v-btn>
        </div>
      </div>
    </header>

    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="ma-4"
      closable
      density="compact"
      @click:close="error = null"
    >
      {{ error }}
    </v-alert>

    <v-alert
      v-if="createSuccess"
      type="success"
      variant="tonal"
      class="ma-4"
      closable
      density="compact"
      @click:close="createSuccess = null"
    >
      {{ t('dashboard.projectCreateSuccess', { name: createSuccess }) }}
    </v-alert>

    <div v-if="loading" class="d-flex justify-center align-center pa-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <div v-else class="pa-4">
      <v-row>
        <v-col cols="12" sm="6" md="3">
          <v-card variant="flat" rounded="lg" class="pa-4">
            <div class="d-flex align-center ga-3">
              <v-avatar color="primary" size="48" rounded="lg">
                <v-icon>mdi-folder-outline</v-icon>
              </v-avatar>
              <div>
                <div class="text-h6 font-weight-bold">{{ stats.projects }}</div>
                <div class="text-caption text-medium-emphasis">{{ t('dashboard.myProjects') }}</div>
              </div>
            </div>
          </v-card>
        </v-col>

        <v-col cols="12" sm="6" md="3">
          <v-card variant="flat" rounded="lg" class="pa-4">
            <div class="d-flex align-center ga-3">
              <v-avatar color="info" size="48" rounded="lg">
                <v-icon>mdi-file-outline</v-icon>
              </v-avatar>
              <div>
                <div class="text-h6 font-weight-bold">{{ stats.files }}</div>
                <div class="text-caption text-medium-emphasis">{{ t('dashboard.totalFiles') }}</div>
              </div>
            </div>
          </v-card>
        </v-col>

        <v-col cols="12" sm="6" md="3">
          <v-card variant="flat" rounded="lg" class="pa-4">
            <div class="d-flex align-center ga-3">
              <v-avatar color="success" size="48" rounded="lg">
                <v-icon>mdi-cloud-upload-outline</v-icon>
              </v-avatar>
              <div>
                <div class="text-h6 font-weight-bold">{{ stats.todayUploads }}</div>
                <div class="text-caption text-medium-emphasis">{{ t('dashboard.todayUploads') }}</div>
              </div>
            </div>
          </v-card>
        </v-col>

        <v-col cols="12" sm="6" md="3">
          <v-card variant="flat" rounded="lg" class="pa-4">
            <div class="d-flex align-center ga-3">
              <v-avatar color="warning" size="48" rounded="lg">
                <v-icon>mdi-harddisk</v-icon>
              </v-avatar>
              <div>
                <div class="text-h6 font-weight-bold">{{ stats.storage }}</div>
                <div class="text-caption text-medium-emphasis">{{ t('dashboard.usedTotal', { total: stats.storageTotal }) }}</div>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <v-row class="mt-2">
        <v-col cols="12" sm="6" md="3">
          <v-card variant="flat" rounded="lg" class="pa-4">
            <div class="text-caption text-medium-emphasis mb-1">{{ t('dashboard.storageUsage') }}</div>
            <v-progress-linear
              :model-value="stats.usagePercent"
              color="primary"
              height="8"
              rounded
            />
            <div class="text-caption text-medium-emphasis mt-1">{{ stats.usagePercent }}%</div>
          </v-card>
        </v-col>

        <v-col cols="12" sm="6" md="3">
          <v-card variant="flat" rounded="lg" class="pa-4">
            <div class="text-caption text-medium-emphasis mb-1">{{ t('dashboard.fileTypeDistribution') }}</div>
            <div class="d-flex ga-2 text-caption">
              <span class="text-dwg">DWG: {{ stats.dwgFiles }}</span>
              <span class="text-dxf">DXF: {{ stats.dxfFiles }}</span>
              <span class="text-other">{{ t('dashboard.otherFiles', { count: stats.otherFiles }) }}</span>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <v-row class="mt-2">
        <v-col cols="12" md="6">
          <v-card variant="flat" rounded="lg">
            <v-card-title class="d-flex align-center justify-space-between pa-4">
              <span class="text-subtitle-1 font-weight-bold">{{ t('dashboard.recentProjects') }}</span>
              <v-btn
                variant="text"
                size="small"
                color="primary"
                @click="router.push('/projects')"
              >
                {{ t('common.viewAll') }}
              </v-btn>
            </v-card-title>

            <v-divider />

            <v-list density="comfortable" class="py-0">
              <v-list-item
                v-for="project in recentProjects"
                :key="project.id"
                :title="project.name"
                :subtitle="`${formatRelativeTime(project.updatedAt)} · ${formatFileSize(project.size || 0)}`"
                @click="router.push(`/projects/${project.id}`)"
              >
                <template #prepend>
                  <v-avatar
                    :color="project.status === 'SHARED' ? 'success' : 'primary'"
                    variant="tonal"
                    rounded="lg"
                  >
                    <v-icon size="small">
                      {{ project.status === 'SHARED' ? 'mdi-folder-shared-outline' : 'mdi-folder-outline' }}
                    </v-icon>
                  </v-avatar>
                </template>

                <template #append>
                  <v-btn
                    icon
                    variant="text"
                    size="x-small"
                    @click.stop="router.push(`/cad-editor?project=${project.id}`)"
                  >
                    <v-icon size="small">mdi-open-in-new</v-icon>
                  </v-btn>
                </template>
              </v-list-item>

              <v-list-item
                v-if="recentProjects.length === 0"
                class="text-center py-8"
              >
                <v-list-item-title class="text-medium-emphasis">
                  {{ t('dashboard.noProjects') }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <v-card variant="flat" rounded="lg">
            <v-card-title class="d-flex align-center justify-space-between pa-4">
              <span class="text-subtitle-1 font-weight-bold">{{ t('dashboard.recentFiles') }}</span>
              <v-btn
                variant="text"
                size="small"
                color="primary"
                @click="router.push('/personal-space')"
              >
                {{ t('common.viewAll') }}
              </v-btn>
            </v-card-title>

            <v-divider />

            <v-list density="comfortable" class="py-0">
              <v-list-item
                v-for="file in recentFiles"
                :key="file.id"
                :title="file.name"
                :subtitle="`${formatRelativeTime(file.updatedAt)} · ${formatFileSize(file.size || 0)}`"
                @click="handleFileClick(file)"
              >
                <template #prepend>
                  <v-avatar color="grey" variant="tonal" rounded="lg">
                    <v-icon size="small">mdi-file-outline</v-icon>
                  </v-avatar>
                </template>

                <template #append>
                  <v-chip
                    v-if="file.type"
                    size="x-small"
                    variant="tonal"
                    :color="file.type === 'dwg' ? 'primary' : 'secondary'"
                  >
                    {{ file.type.toUpperCase() }}
                  </v-chip>
                </template>
              </v-list-item>

              <v-list-item
                v-if="recentFiles.length === 0"
                class="text-center py-8"
              >
                <v-list-item-title class="text-medium-emphasis">
                  {{ t('dashboard.noFiles') }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <v-btn
      color="primary"
      icon
      size="large"
      class="position-fixed"
      style="right: 24px; bottom: 24px"
      @click="isProjectModalOpen = true"
    >
      <v-icon>mdi-plus</v-icon>
      <v-tooltip activator="parent" location="top">{{ t('dashboard.newProject') }}</v-tooltip>
    </v-btn>

    <v-dialog v-model="isProjectModalOpen" max-width="500" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center justify-space-between pa-4">
          <span class="text-subtitle-1 font-weight-bold">{{ t('dashboard.newProject') }}</span>
          <v-btn icon size="small" variant="text" @click="closeProjectModal">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-divider />

        <v-card-text class="pa-4">
          <v-form @submit.prevent="handleCreateProject">
            <v-text-field
              v-model="projectFormData.name"
              :label="t('dashboard.projectName')"
              :placeholder="t('dashboard.projectNamePlaceholder')"
              prepend-inner-icon="mdi-folder-outline"
              variant="outlined"
              density="comfortable"
              class="mb-3"
              hide-details
              required
            />

            <v-textarea
              v-model="projectFormData.description"
              :label="t('dashboard.projectDescription')"
              :placeholder="t('dashboard.projectDescriptionPlaceholder')"
              prepend-inner-icon="mdi-text-long"
              variant="outlined"
              density="comfortable"
              rows="3"
              hide-details
            />
          </v-form>
        </v-card-text>

        <v-divider />

        <v-card-actions class="justify-end pa-4">
          <v-btn variant="text" @click="closeProjectModal">{{ t('common.cancel') }}</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="projectCreating"
            :disabled="!projectFormData.name.trim() || projectCreating"
            @click="handleCreateProject"
          >
            {{ t('common.create') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useTheme } from '@/composables/useTheme';
import { useDashboard } from '@/composables/useDashboard';
import { formatFileSize } from '@/utils/formatters';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

useDocumentTitle('仪表盘');

const router = useRouter();
const { toggleTheme } = useTheme();
const {
  isDark,
  appName,
  userName,
  greeting,
  projects,
  personalFiles,
  loading,
  error,
  isProjectModalOpen,
  projectFormData,
  projectCreating,
  createSuccess,
  stats,
  recentProjects,
  recentFiles,
  formatRelativeTime,
  handleCreateProject,
  closeProjectModal,
  handleFileClick,
  loadData,
} = useDashboard();
</script>

<style scoped>
.text-dwg {
  color: rgb(var(--v-theme-primary));
}
.text-dxf {
  color: rgb(var(--v-theme-secondary));
}
.text-other {
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
