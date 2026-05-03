<template>
  <!-- 来源：apps/frontend/src/pages/FontLibrary.tsx -->
  <v-container fluid class="pa-6">
    <!-- 无访问权限 — 来源：FontLibrary.tsx:176-188 -->
    <template v-if="!canReadFonts">
      <div class="d-flex flex-column align-center justify-center" style="min-height: 80vh">
        <v-avatar size="80" color="grey-lighten-3" class="mb-4">
          <v-icon size="40" icon="mdi-file-code-outline" color="grey" />
        </v-avatar>
        <div class="text-h6 font-weight-medium mb-2">{{ t('fontLibrary.noAccess') }}</div>
        <div class="text-body-2 text-medium-emphasis">{{ t('fontLibrary.noAccessDesc') }}</div>
      </div>
    </template>

    <!-- 有权限：主内容 — 来源：FontLibrary.tsx:339-848 -->
    <template v-else>
      <div class="mx-auto" style="max-width: 1280px">
        <!-- 页面头部 — 来源：FontLibrary.tsx:343-358 -->
        <div class="d-flex align-center justify-space-between mb-6">
          <div>
            <div class="text-h5 font-weight-bold mb-1">{{ t('fontLibrary.title') }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ t('fontLibrary.subtitle') }}</div>
          </div>
          <v-btn
            v-if="canUploadFonts"
            color="primary"
            @click="showUploadModal = true"
          >
            <v-icon start>mdi-upload</v-icon>
            {{ t('fontLibrary.uploadFont') }}
          </v-btn>
        </div>

        <!-- 统计卡片 — 来源：FontLibrary.tsx:361-389 -->
        <v-row class="mb-6">
          <v-col cols="12" sm="4">
            <v-card variant="outlined" rounded="lg" class="d-flex align-center pa-4">
              <v-avatar size="48" color="indigo-lighten-5" class="mr-4">
                <v-icon icon="mdi-palette-outline" color="indigo" />
              </v-avatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.count }}</div>
                <div class="text-caption text-medium-emphasis">{{ t('fontLibrary.totalFonts') }}</div>
              </div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="4">
            <v-card variant="outlined" rounded="lg" class="d-flex align-center pa-4">
              <v-avatar size="48" color="amber-lighten-5" class="mr-4">
                <v-icon icon="mdi-harddisk" color="amber-darken-3" />
              </v-avatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ formatFileSize(stats.totalSize) }}</div>
                <div class="text-caption text-medium-emphasis">{{ t('fontLibrary.totalStorage') }}</div>
              </div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="4">
            <v-card variant="outlined" rounded="lg" class="d-flex align-center pa-4">
              <v-avatar size="48" color="green-lighten-5" class="mr-4">
                <v-icon icon="mdi-file-code-outline" color="success" />
              </v-avatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.typeCount }}</div>
                <div class="text-caption text-medium-emphasis">{{ t('fontLibrary.formatTypes') }}</div>
              </div>
            </v-card>
          </v-col>
        </v-row>

        <!-- 标签页切换 — 来源：FontLibrary.tsx:393-418 -->
        <v-tabs v-model="activeTab" class="mb-6" @update:model-value="onTabChange">
          <v-tab value="backend">
            <v-icon start size="16">mdi-harddisk</v-icon>
            {{ t('fontLibrary.backendFonts') }}
          </v-tab>
          <v-tab value="frontend">
            <v-icon start size="16">mdi-format-font</v-icon>
            {{ t('fontLibrary.frontendFonts') }}
          </v-tab>
        </v-tabs>

        <!-- 筛选和搜索栏 — 来源：FontLibrary.tsx:421-530 -->
        <v-card variant="outlined" rounded="lg" class="mb-6 pa-4">
          <div class="d-flex flex-wrap align-center ga-4">
            <!-- 搜索框 — 来源：FontLibrary.tsx:424-433 -->
            <v-text-field
              v-model="filters.name"
              density="compact"
              variant="outlined"
              :placeholder="t('fontLibrary.searchPlaceholder')"
              prepend-inner-icon="mdi-magnify"
              hide-details
              style="min-width: 240px; max-width: 400px; flex: 1"
            />

            <!-- 格式筛选 — 来源：FontLibrary.tsx:436-448 -->
            <v-select
              v-model="filters.extension"
              :items="FONT_TYPES"
              item-title="label"
              item-value="value"
              density="compact"
              variant="outlined"
              hide-details
              style="width: 160px"
            />

            <!-- 展开筛选按钮 — 来源：FontLibrary.tsx:451-458 -->
            <v-btn
              variant="outlined"
              size="small"
              @click="showFilters = !showFilters"
            >
              <v-icon start size="16">mdi-filter-outline</v-icon>
              {{ t('fontLibrary.filter') }}
              <v-icon end size="14" :class="{ 'rotate-180': showFilters }">mdi-chevron-down</v-icon>
            </v-btn>

            <!-- 重置按钮 — 来源：FontLibrary.tsx:461-469 -->
            <v-btn
              v-if="filters.name || filters.extension || filters.startTime || filters.endTime"
              variant="text"
              size="small"
              @click="handleReset"
            >
              <v-icon start size="14">mdi-close</v-icon>
              {{ t('fontLibrary.clear') }}
            </v-btn>

            <!-- 视图切换 — 来源：FontLibrary.tsx:472-496 -->
            <v-btn-toggle
              v-model="viewMode"
              mandatory
              density="compact"
              variant="outlined"
              class="ml-auto"
            >
              <v-btn value="grid" size="small" :title="t('fontLibrary.gridView')">
                <v-icon>mdi-view-grid-outline</v-icon>
              </v-btn>
              <v-btn value="list" size="small" :title="t('fontLibrary.listView')">
                <v-icon>mdi-view-list-outline</v-icon>
              </v-btn>
            </v-btn-toggle>
          </div>

          <!-- 展开的筛选条件 — 来源：FontLibrary.tsx:500-529 -->
          <v-expand-transition>
            <div v-if="showFilters" class="mt-4 pt-4" style="border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))">
              <div class="d-flex flex-wrap ga-4">
                <v-text-field
                  v-model="filters.startTime"
                  type="date"
                  :label="t('fontLibrary.startDate')"
                  density="compact"
                  variant="outlined"
                  prepend-inner-icon="mdi-calendar"
                  hide-details
                  style="width: 180px"
                />
                <v-text-field
                  v-model="filters.endTime"
                  type="date"
                  :label="t('fontLibrary.endDate')"
                  density="compact"
                  variant="outlined"
                  prepend-inner-icon="mdi-calendar"
                  hide-details
                  style="width: 180px"
                />
              </div>
            </div>
          </v-expand-transition>
        </v-card>

        <!-- 批量操作栏 — 来源：FontLibrary.tsx:533-564 -->
        <v-slide-y-transition>
          <v-card v-if="selectedFonts.size > 0" variant="outlined" rounded="lg" class="mb-4 pa-3 d-flex align-center justify-space-between">
            <div class="d-flex align-center ga-3">
              <v-checkbox
                :model-value="selectedFonts.size === fonts.length && fonts.length > 0"
                @update:model-value="handleSelectAll"
                density="compact"
                hide-details"
              />
              <span class="text-body-2">
                {{ t('fontLibrary.selectedFonts', { count: selectedFonts.size }) }}
              </span>
            </div>
            <div class="d-flex align-center ga-2">
              <v-btn variant="text" size="small" @click="selectedFonts = new Set()">
                {{ t('fontLibrary.cancelSelection') }}
              </v-btn>
              <v-btn
                v-if="canDeleteFonts"
                color="error"
                variant="outlined"
                size="small"
                @click="handleBatchDelete"
              >
                <v-icon start size="14">mdi-delete-outline</v-icon>
                {{ t('fontLibrary.batchDelete') }}
              </v-btn>
            </div>
          </v-card>
        </v-slide-y-transition>

        <!-- 排序选项 — 来源：FontLibrary.tsx:567-592 -->
        <div class="d-flex align-center ga-4 mb-4 text-body-2">
          <span class="text-medium-emphasis">{{ t('fontLibrary.sortBy') }}：</span>
          <v-btn
            v-for="sortOption in sortOptions"
            :key="sortOption.key"
            variant="text"
            size="small"
            :class="{ 'font-weight-bold text-primary': sortBy === sortOption.key }"
            @click="handleSort(sortOption.key as 'name' | 'size' | 'createdAt')"
          >
            {{ sortOption.label }}
            <v-icon v-if="sortBy === sortOption.key" end size="14" :class="{ 'rotate-180': sortOrder === 'asc' }">
              mdi-chevron-down
            </v-icon>
          </v-btn>
        </div>

        <!-- 字体列表 - 网格视图 — 来源：FontLibrary.tsx:595-702 -->
        <template v-if="viewMode === 'grid'">
          <!-- 骨架屏 — 来源：FontLibrary.tsx:598-604 -->
          <v-row v-if="loading">
            <v-col v-for="i in 8" :key="i" cols="12" sm="6" md="4" lg="3">
              <v-skeleton-loader type="card" height="160" />
            </v-col>
          </v-row>

          <!-- 空状态 — 来源：FontLibrary.tsx:604-626 -->
          <div v-else-if="fonts.length === 0" class="py-16 text-center">
            <v-avatar size="96" color="grey-lighten-3" class="mb-4">
              <v-icon size="40" icon="mdi-folder-open-outline" color="grey" />
            </v-avatar>
            <div class="text-h6 font-weight-medium mb-1">{{ t('fontLibrary.noFonts') }}</div>
            <div class="text-body-2 text-medium-emphasis mb-4">
              {{ filters.name || filters.extension ? t('fontLibrary.noMatchingFonts') : t('fontLibrary.noFontFiles') }}
            </div>
            <v-btn
              v-if="canUploadFonts && !filters.name && !filters.extension"
              color="primary"
              @click="showUploadModal = true"
            >
              {{ t('fontLibrary.uploadFirstFont') }}
            </v-btn>
          </div>

          <!-- 字体卡片网格 — 来源：FontLibrary.tsx:628-701 -->
          <v-row v-else>
            <v-col
              v-for="font in fonts"
              :key="font.name"
              cols="12"
              sm="6"
              md="4"
              lg="3"
            >
              <v-card
                variant="outlined"
                rounded="lg"
                class="pa-4 pt-6 position-relative"
                :class="{ 'border-primary': selectedFonts.has(font.name) }"
              >
                <!-- 选择框 — 来源：FontLibrary.tsx:639-645 -->
                <div class="position-absolute" style="top: 8px; left: 8px; z-index: 2">
                  <v-checkbox
                    :model-value="selectedFonts.has(font.name)"
                    @update:model-value="handleSelect(font.name)"
                    density="compact"
                    hide-details
                  />
                </div>

                <!-- 操作按钮 — 来源：FontLibrary.tsx:649-668 -->
                <div class="position-absolute d-flex ga-1" style="top: 8px; right: 8px; z-index: 2">
                  <v-btn
                    v-if="canDownloadFonts"
                    icon
                    size="x-small"
                    variant="tonal"
                    :title="t('fontLibrary.download')"
                    @click="handleDownload(font.name)"
                  >
                    <v-icon size="16">mdi-download</v-icon>
                  </v-btn>
                  <v-btn
                    v-if="canDeleteFonts"
                    icon
                    size="x-small"
                    variant="tonal"
                    color="error"
                    :title="t('fontLibrary.delete')"
                    @click="handleDelete(font.name)"
                  >
                    <v-icon size="16">mdi-delete-outline</v-icon>
                  </v-btn>
                </div>

                <!-- 内容 — 来源：FontLibrary.tsx:671-698 -->
                <div class="text-center pt-4 pb-2">
                  <v-avatar
                    size="64"
                    rounded="xl"
                    :color="getFontIcon(font.extension).bgColor"
                    class="mb-3"
                  >
                    <v-icon :icon="getFontIcon(font.extension).icon" :color="getFontIcon(font.extension).color" size="32" />
                  </v-avatar>
                  <div class="font-weight-medium text-truncate px-2 mb-1" :title="font.name">
                    {{ font.name }}
                  </div>
                  <div class="d-flex align-center justify-center ga-2">
                    <v-chip
                      :color="getFontIcon(font.extension).color"
                      size="x-small"
                      variant="tonal"
                      label
                    >
                      {{ getFontIcon(font.extension).label }}
                    </v-chip>
                    <span class="text-caption text-medium-emphasis">{{ formatFileSize(font.size) }}</span>
                  </div>
                  <div class="text-caption text-disabled mt-2">{{ formatDate(font.createdAt) }}</div>
                </div>
              </v-card>
            </v-col>
          </v-row>
        </template>

        <!-- 字体列表 - 列表视图 — 来源：FontLibrary.tsx:706-826 -->
        <template v-if="viewMode === 'list'">
          <v-table>
            <thead>
              <tr>
                <th style="width: 48px">
                  <v-checkbox
                    :model-value="selectedFonts.size === fonts.length && fonts.length > 0"
                    @update:model-value="handleSelectAll"
                    density="compact"
                    hide-details"
                  />
                </th>
                <th>{{ t('fontLibrary.fontFile') }}</th>
                <th style="width: 96px">{{ t('fontLibrary.format') }}</th>
                <th style="width: 112px">{{ t('fontLibrary.size') }}</th>
                <th style="width: 144px">{{ t('fontLibrary.modifiedTime') }}</th>
                <th style="width: 96px" class="text-right">{{ t('fontLibrary.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <!-- 加载中 — 来源：FontLibrary.tsx:728-735 -->
              <tr v-if="loading">
                <td colspan="6" class="py-12 text-center">
                  <v-progress-circular indeterminate color="primary" size="24" class="mr-2" />
                  <span class="text-medium-emphasis">{{ t('fontLibrary.loading') }}</span>
                </td>
              </tr>
              <!-- 空状态 — 来源：FontLibrary.tsx:737-750 -->
              <tr v-else-if="fonts.length === 0">
                <td colspan="6" class="py-16 text-center">
                  <v-avatar size="80" color="grey-lighten-3" class="mb-4">
                    <v-icon icon="mdi-folder-open-outline" color="grey" />
                  </v-avatar>
                  <div class="text-medium-emphasis">{{ t('fontLibrary.noData') }}</div>
                </td>
              </tr>
              <!-- 数据行 — 来源：FontLibrary.tsx:751-821 -->
              <tr
                v-for="font in fonts"
                :key="font.name"
                :class="{ 'bg-primary-lighten-5': selectedFonts.has(font.name) }"
              >
                <td>
                  <v-checkbox
                    :model-value="selectedFonts.has(font.name)"
                    @update:model-value="handleSelect(font.name)"
                    density="compact"
                    hide-details
                  />
                </td>
                <td>
                  <div class="d-flex align-center ga-3">
                    <v-avatar
                      size="40"
                      rounded="lg"
                      :color="getFontIcon(font.extension).bgColor"
                    >
                      <v-icon :icon="getFontIcon(font.extension).icon" :color="getFontIcon(font.extension).color" size="20" />
                    </v-avatar>
                    <div>
                      <div class="font-weight-medium text-truncate" style="max-width: 260px" :title="font.name">
                        {{ font.name }}
                      </div>
                      <div class="text-caption text-disabled">{{ font.creator || t('fontLibrary.systemAdmin') }}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <v-chip
                    :color="getFontIcon(font.extension).color"
                    size="x-small"
                    variant="tonal"
                    label
                  >
                    {{ getFontIcon(font.extension).label }}
                  </v-chip>
                </td>
                <td class="text-body-2">{{ formatFileSize(font.size) }}</td>
                <td class="text-body-2 text-medium-emphasis">{{ formatDate(font.createdAt) }}</td>
                <td class="text-right">
                  <v-btn
                    v-if="canDownloadFonts"
                    icon
                    size="x-small"
                    variant="text"
                    :title="t('fontLibrary.download')"
                    @click="handleDownload(font.name)"
                  >
                    <v-icon size="16">mdi-download</v-icon>
                  </v-btn>
                  <v-btn
                    v-if="canDeleteFonts"
                    icon
                    size="x-small"
                    variant="text"
                    color="error"
                    :title="t('fontLibrary.delete')"
                    @click="handleDelete(font.name)"
                  >
                    <v-icon size="16">mdi-delete-outline</v-icon>
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </template>

        <!-- 底部统计 — 来源：FontLibrary.tsx:829-833 -->
        <div class="mt-6 text-center text-body-2 text-medium-emphasis">
          {{ t('fontLibrary.totalFontFiles', { count: fonts.length }) }}
          <template v-if="filters.name"> · {{ t('fontLibrary.searchFor', { query: filters.name }) }}</template>
          <template v-if="filters.extension"> · {{ t('fontLibrary.formatLabel', { format: filters.extension }) }}</template>
        </div>

        <!-- 上传模态框 — 来源：FontLibrary.tsx:836-845 -->
        <v-dialog v-model="showUploadModal" max-width="560">
          <v-card rounded="lg">
            <!-- 头部 — 来源：FontLibrary.tsx:941-957 -->
            <v-card-title class="d-flex align-center justify-space-between pa-4" style="border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))">
              <div class="d-flex align-center ga-3">
                <v-avatar size="40" color="primary-lighten-5" rounded="lg">
                  <v-icon icon="mdi-upload" color="primary" />
                </v-avatar>
                <div>
                  <div class="text-h6 font-weight-semibold">{{ t('fontLibrary.uploadFont') }}</div>
                  <div class="text-caption text-medium-emphasis">{{ t('fontLibrary.supportedFormats') }}</div>
                </div>
              </div>
              <v-btn icon variant="text" size="small" @click="showUploadModal = false">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-card-title>

            <!-- 内容 — 来源：FontLibrary.tsx:960-1055 -->
            <v-card-text class="pa-6">
              <!-- 文件上传区域 — 来源：FontLibrary.tsx:962-1021 -->
              <div
                class="position-relative rounded-xl pa-8 text-center"
                :style="{
                  border: '2px dashed',
                  borderColor: dragOver ? 'rgb(var(--v-theme-primary))' : uploadFile ? 'rgb(var(--v-theme-success))' : 'rgba(var(--v-border-color), var(--v-border-opacity))',
                  backgroundColor: dragOver ? 'rgba(var(--v-theme-primary), 0.05)' : uploadFile ? 'rgba(var(--v-theme-success), 0.05)' : 'transparent',
                }"
                @dragover.prevent="dragOver = true"
                @dragleave.prevent="dragOver = false"
                @drop.prevent="onFileDrop"
              >
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2,.eot,.ttc,.shx"
                  style="position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer"
                  @change="onFileChange"
                />

                <!-- 已选择文件 — 来源：FontLibrary.tsx:981-1001 -->
                <template v-if="uploadFile">
                  <v-avatar size="64" color="success-lighten-5" rounded="xl" class="mb-3">
                    <v-icon icon="mdi-palette-outline" color="success" size="32" />
                  </v-avatar>
                  <div class="font-weight-medium mb-1">{{ uploadFile.name }}</div>
                  <div class="text-body-2 text-medium-emphasis">
                    {{ (uploadFile.size / 1024 / 1024).toFixed(2) }} MB
                  </div>
                  <v-btn variant="text" size="small" color="error" class="mt-2" @click.stop="uploadFile = null">
                    {{ t('fontLibrary.removeFile') }}
                  </v-btn>
                </template>

                <!-- 未选择文件 — 来源：FontLibrary.tsx:1002-1019 -->
                <template v-else>
                  <v-avatar size="64" color="grey-lighten-3" rounded="xl" class="mb-3">
                    <v-icon icon="mdi-upload" color="grey" size="32" />
                  </v-avatar>
                  <div class="font-weight-medium mb-1">{{ t('fontLibrary.clickOrDrag') }}</div>
                  <div class="text-body-2 text-medium-emphasis">{{ t('fontLibrary.allSupportedFormats') }}</div>
                  <div class="text-caption text-disabled mt-2">{{ t('fontLibrary.maxSize') }}</div>
                </template>
              </div>

              <!-- 上传目标选择 — 来源：FontLibrary.tsx:1024-1055 -->
              <div class="mt-6">
                <div class="text-body-2 font-weight-medium mb-3">{{ t('fontLibrary.uploadLocation') }}</div>
                <v-row dense>
                  <v-col v-for="opt in targetOptions" :key="opt.value" cols="4">
                    <v-card
                      variant="outlined"
                      rounded="lg"
                      class="pa-3 cursor-pointer"
                      :class="{ 'border-primary bg-primary-lighten-5': uploadTarget === opt.value }"
                      @click="uploadTarget = opt.value as 'backend' | 'frontend' | 'both'"
                    >
                      <v-avatar
                        size="32"
                        rounded="lg"
                        :color="uploadTarget === opt.value ? 'primary-lighten-4' : 'grey-lighten-3'"
                        class="mb-2"
                      >
                        <v-icon
                          :icon="opt.icon"
                          :color="uploadTarget === opt.value ? 'primary' : 'grey'"
                          size="16"
                        />
                      </v-avatar>
                      <div class="font-weight-medium text-body-2" :class="uploadTarget === opt.value ? 'text-primary' : ''">
                        {{ opt.label }}
                      </div>
                      <div class="text-caption text-disabled">{{ opt.desc }}</div>
                    </v-card>
                  </v-col>
                </v-row>
              </div>
            </v-card-text>

            <!-- 底部按钮 — 来源：FontLibrary.tsx:1059-1084 -->
            <v-card-actions class="pa-4 justify-end" style="border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))">
              <v-btn variant="outlined" :disabled="uploading" @click="showUploadModal = false">{{ t('common.cancel') }}</v-btn>
              <v-btn
                color="primary"
                :disabled="!uploadFile || uploading"
                :loading="uploading"
                @click="handleUpload"
              >
                <v-icon start>mdi-upload</v-icon>
                {{ t('common.upload') }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- 确认删除对话框 — 替代 React 的 showConfirm -->
        <v-dialog v-model="confirmDialog.show" max-width="420">
          <v-card rounded="lg">
            <v-card-title class="text-h6">{{ confirmDialog.title }}</v-card-title>
            <v-card-text class="text-body-2">{{ confirmDialog.message }}</v-card-text>
            <v-card-actions class="justify-end">
              <v-btn variant="text" @click="resolveConfirm(false)">{{ t('common.cancel') }}</v-btn>
              <v-btn color="error" variant="flat" @click="resolveConfirm(true)">{{ t('common.confirmDelete') }}</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </div>
    </template>
  </v-container>
</template>

<script setup lang="ts">
/**
 * FontLibraryPage — 来源：apps/frontend/src/pages/FontLibrary.tsx
 *
 * 业务逻辑完全照搬 React 版，UI 层使用 Vuetify 3 组件
 */

import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useI18n } from '@/composables/useI18n';
import { fontsApi } from '@/services/fontsApi';
import type { FontInfo } from '@/services/fontsApi';
import { useUIStore } from '@/stores/ui.store';
import { SystemPermission } from '@/constants/permissions';

const { t } = useI18n();

useDocumentTitle(() => t('fontLibrary.title'));

// ==================== 常量 ====================

// 字体文件类型配置 — 来源：FontLibrary.tsx:32-41
const FONT_TYPES = [
  { value: '', label: t('fontLibrary.allFormats'), color: '#6366f1', icon: 'mdi-folder-open' },
  { value: '.ttf', label: 'TTF', color: '#22c55e', icon: 'mdi-format-font' },
  { value: '.otf', label: 'OTF', color: '#3b82f6', icon: 'mdi-file-document-outline' },
  { value: '.woff', label: 'WOFF', color: '#f59e0b', icon: 'mdi-file-box-outline' },
  { value: '.woff2', label: 'WOFF2', color: '#f97316', icon: 'mdi-file-box-outline' },
  { value: '.eot', label: 'EOT', color: '#8b5cf6', icon: 'mdi-numeric' },
  { value: '.ttc', label: 'TTC', color: '#ec4899', icon: 'mdi-layers-outline' },
  { value: '.shx', label: 'SHX', color: '#06b6d4', icon: 'mdi-shape-outline' },
];

// 排序选项 — 来源：FontLibrary.tsx:569-573
const sortOptions = [
  { key: 'createdAt', label: t('fontLibrary.modifiedTime') },
  { key: 'name', label: t('fontLibrary.name') },
  { key: 'size', label: t('fontLibrary.size') },
];

// 上传目标选项 — 来源：FontLibrary.tsx:1029-1033
const targetOptions = [
  { value: 'both', label: t('fontLibrary.uploadBoth'), desc: t('fontLibrary.backendAndFrontend'), icon: 'mdi-harddisk' },
  { value: 'backend', label: t('fontLibrary.backendOnly'), desc: t('fontLibrary.conversionProgram'), icon: 'mdi-harddisk' },
  { value: 'frontend', label: t('fontLibrary.frontendOnly'), desc: t('fontLibrary.webDisplay'), icon: 'mdi-format-font' },
];
const uiStore = useUIStore();

// ==================== 权限检查 — 来源：FontLibrary.tsx:90-93 ====================

function hasPermission(permission: string): boolean {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user?.role?.permissions) return false;
  return user.role.permissions.some((p: { permission: string }) => p.permission === permission);
}

const canReadFonts = hasPermission(SystemPermission.SYSTEM_FONT_READ);
const canUploadFonts = hasPermission(SystemPermission.SYSTEM_FONT_UPLOAD);
const canDeleteFonts = hasPermission(SystemPermission.SYSTEM_FONT_DELETE);
const canDownloadFonts = hasPermission(SystemPermission.SYSTEM_FONT_DOWNLOAD);

// ==================== 状态 — 来源：FontLibrary.tsx:58-87 ====================

const allFonts = ref<FontInfo[]>([]);
const loading = ref(false);
const activeTab = ref<'backend' | 'frontend'>('backend');

// 筛选条件 — 来源：FontLibrary.tsx:66-71
const filters = reactive({
  name: '',
  extension: '',
  startTime: '',
  endTime: '',
});

// 排序 — 来源：FontLibrary.tsx:74-75
const sortBy = ref<'name' | 'size' | 'createdAt'>('createdAt');
const sortOrder = ref<'asc' | 'desc'>('desc');

// 视图模式 — 来源：FontLibrary.tsx:78
const viewMode = ref<'grid' | 'list'>('grid');

// 上传模态框 — 来源：FontLibrary.tsx:81
const showUploadModal = ref(false);

// 选中的字体 — 来源：FontLibrary.tsx:84
const selectedFonts = ref<Set<string>>(new Set());

// 展开/收起筛选 — 来源：FontLibrary.tsx:87
const showFilters = ref(false);

// 上传模态框内部状态 — 来源：FontLibrary.tsx:864-869
const uploadFile = ref<File | null>(null);
const uploadTarget = ref<'backend' | 'frontend' | 'both'>('both');
const uploading = ref(false);
const dragOver = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

// 确认对话框（替代 React 的 showConfirm）
const confirmDialog = reactive({
  show: false,
  title: '',
  message: '',
});
let confirmResolve: ((value: boolean) => void) | null = null;

// ==================== 计算属性 ====================

// 筛选+排序后的字体列表 — 来源：FontLibrary.tsx:119-169
const fonts = computed(() => {
  let filtered = [...allFonts.value];

  // 筛选 — 来源：FontLibrary.tsx:123-144
  if (filters.name) {
    filtered = filtered.filter((font) =>
      font.name.toLowerCase().includes(filters.name.toLowerCase())
    );
  }

  if (filters.extension) {
    filtered = filtered.filter(
      (font) => font.extension.toLowerCase() === filters.extension.toLowerCase()
    );
  }

  if (filters.startTime) {
    const start = new Date(filters.startTime);
    filtered = filtered.filter((font) => new Date(font.createdAt) >= start);
  }

  if (filters.endTime) {
    const end = new Date(filters.endTime);
    end.setHours(23, 59, 59, 999);
    filtered = filtered.filter((font) => new Date(font.createdAt) <= end);
  }

  // 排序 — 来源：FontLibrary.tsx:147-166
  filtered.sort((a, b) => {
    let comparison = 0;

    switch (sortBy.value) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'createdAt':
        comparison =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      default:
        comparison = a.name.localeCompare(b.name);
    }

    return sortOrder.value === 'desc' ? -comparison : comparison;
  });

  return filtered;
});

// 统计信息 — 来源：FontLibrary.tsx:333-337
const stats = computed(() => {
  const totalSize = fonts.value.reduce((sum, f) => sum + f.size, 0);
  const typeCount = new Set(fonts.value.map((f) => f.extension.toLowerCase())).size;
  return { count: fonts.value.length, totalSize, typeCount };
});

// ==================== 方法 ====================

// 获取字体列表 — 来源：FontLibrary.tsx:96-116
async function fetchFonts() {
  if (!canReadFonts) return;
  loading.value = true;
  try {
    const response = await fontsApi.getFonts(activeTab.value);
    console.log('字体API响应:', response);

    let fontsData: unknown = response.data || [];
    if (fontsData && typeof fontsData === 'object' && 'data' in fontsData) {
      fontsData = (fontsData as { data: unknown }).data || [];
    }

    console.log('解析后的字体数据:', fontsData, '数量:', Array.isArray(fontsData) ? fontsData.length : 0);
    allFonts.value = Array.isArray(fontsData) ? fontsData : [];
  } catch (error) {
    console.error('获取字体列表失败:', error);
    allFonts.value = [];
  } finally {
    loading.value = false;
  }
}

// 字体类型图标映射 — 来源：FontLibrary.tsx:44-50
function getFontIcon(extension: string): { color: string; bgColor: string; label: string; icon: string } {
  const type = FONT_TYPES.find((t) => t.value === extension.toLowerCase());
  if (type) {
    return {
      color: type.color,
      bgColor: `${type.color}15`,
      label: type.label,
      icon: type.icon,
    };
  }
  return {
    color: '#6366f1',
    bgColor: '#6366f115',
    label: extension.toUpperCase(),
    icon: 'mdi-file-outline',
  };
}

// 处理标签页切换 — 来源：FontLibrary.tsx:395-416
function onTabChange() {
  selectedFonts.value = new Set();
  fetchFonts();
}

// 重置筛选条件 — 来源：FontLibrary.tsx:196-203
function handleReset() {
  filters.name = '';
  filters.extension = '';
  filters.startTime = '';
  filters.endTime = '';
}

// 处理排序 — 来源：FontLibrary.tsx:206-213
function handleSort(field: 'name' | 'size' | 'createdAt') {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = field;
    sortOrder.value = 'desc';
  }
}

// 处理选中 — 来源：FontLibrary.tsx:216-226
function handleSelect(fontName: string) {
  const newSet = new Set(selectedFonts.value);
  if (newSet.has(fontName)) {
    newSet.delete(fontName);
  } else {
    newSet.add(fontName);
  }
  selectedFonts.value = newSet;
}

// 全选/取消全选 — 来源：FontLibrary.tsx:229-235
function handleSelectAll() {
  if (selectedFonts.value.size === fonts.value.length) {
    selectedFonts.value = new Set();
  } else {
    selectedFonts.value = new Set(fonts.value.map((f) => f.name));
  }
}

// 确认对话框 — 替代 React 的 showConfirm
function showConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    confirmDialog.title = title;
    confirmDialog.message = message;
    confirmDialog.show = true;
    confirmResolve = resolve;
  });
}

function resolveConfirm(value: boolean) {
  confirmDialog.show = false;
  if (confirmResolve) {
    confirmResolve(value);
    confirmResolve = null;
  }
}

// 删除字体 — 来源：FontLibrary.tsx:238-259
async function handleDelete(fontName: string) {
  const confirmed = await showConfirm(t('common.confirmDelete'), t('fontLibrary.confirmDeleteFont', { name: fontName }));
  if (!confirmed) return;

  try {
    await fontsApi.deleteFont(fontName, activeTab.value);
    await fetchFonts();
    const newSet = new Set(selectedFonts.value);
    newSet.delete(fontName);
    selectedFonts.value = newSet;
    uiStore.addToast(t('common.deleteSuccess'), 'success');
  } catch (error) {
    console.error('删除字体失败:', error);
    uiStore.addToast(t('fontLibrary.deleteFontFailed'), 'error');
  }
}

// 批量删除 — 来源：FontLibrary.tsx:262-288
async function handleBatchDelete() {
  if (selectedFonts.value.size === 0) {
    uiStore.addToast(t('fontLibrary.selectFontsFirst'), 'warning');
    return;
  }

  const confirmed = await showConfirm(t('fontLibrary.confirmBatchDelete'), t('fontLibrary.confirmDeleteFonts', { count: selectedFonts.value.size }));
  if (!confirmed) return;

  try {
    await Promise.all(
      Array.from(selectedFonts.value).map((fontName) =>
        fontsApi.deleteFont(fontName as string, activeTab.value)
      )
    );
    selectedFonts.value = new Set();
    await fetchFonts();
    uiStore.addToast(t('fontLibrary.batchDeleteSuccess'), 'success');
  } catch (error) {
    console.error('批量删除失败:', error);
    uiStore.addToast(t('fontLibrary.batchDeleteFailed'), 'error');
  }
}

// 下载字体 — 来源：FontLibrary.tsx:291-309
async function handleDownload(fontName: string) {
  try {
    const response = await fontsApi.downloadFont(fontName, activeTab.value);
    const url = window.URL.createObjectURL(
      new Blob([response.data as BlobPart])
    );
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fontName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    uiStore.addToast(t('common.downloadSuccess'), 'success');
  } catch (error) {
    console.error('下载字体失败:', error);
    uiStore.addToast(t('fontLibrary.downloadFailed'), 'error');
  }
}

// 格式化文件大小 — 来源：FontLibrary.tsx:312-318
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// 格式化日期 — 来源：FontLibrary.tsx:321-330
function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 上传模态框：文件验证 — 来源：FontLibrary.tsx:871-892
function validateAndSetFile(selectedFile: File | null) {
  if (!selectedFile) return;

  // 验证文件类型 — 来源：FontLibrary.tsx:875-883
  const validExtensions = ['.ttf', '.otf', '.woff', '.woff2', '.eot', '.ttc', '.shx'];
  const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();

  if (!validExtensions.includes(ext)) {
    uiStore.addToast(t('fontLibrary.unsupportedFileType'), 'warning');
    return;
  }

  // 验证文件大小（10MB） — 来源：FontLibrary.tsx:886-889
  if (selectedFile.size > 10 * 1024 * 1024) {
    uiStore.addToast(t('fontLibrary.fileTooLarge'), 'warning');
    return;
  }

  uploadFile.value = selectedFile;
}

// 文件选择 — 来源：FontLibrary.tsx:974-977
function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  validateAndSetFile(input.files?.[0] || null);
}

// 文件拖放 — 来源：FontLibrary.tsx:923-928
function onFileDrop(event: DragEvent) {
  dragOver.value = false;
  const droppedFile = event.dataTransfer?.files[0];
  if (droppedFile) {
    validateAndSetFile(droppedFile);
  }
}

// 上传字体 — 来源：FontLibrary.tsx:894-911
async function handleUpload() {
  if (!uploadFile.value) {
    uiStore.addToast(t('fontLibrary.selectFileFirst'), 'warning');
    return;
  }

  uploading.value = true;
  try {
    await fontsApi.uploadFont(uploadFile.value, uploadTarget.value);
    uiStore.addToast(t('common.uploadSuccess'), 'success');
    showUploadModal.value = false;
    uploadFile.value = null;
    uploadTarget.value = 'both';
    await fetchFonts();
  } catch (error) {
    console.error('上传失败:', error);
    uiStore.addToast(t('fontLibrary.uploadFailed'), 'error');
  } finally {
    uploading.value = false;
  }
}

// ==================== 生命周期 ====================

// 来源：FontLibrary.tsx:171-173 — useEffect fetchFonts
onMounted(() => {
  fetchFonts();
});

// 上传模态框关闭时重置状态
watch(showUploadModal, (val) => {
  if (!val) {
    uploadFile.value = null;
    uploadTarget.value = activeTab.value === 'backend' || activeTab.value === 'frontend' ? activeTab.value : 'both';
    uploading.value = false;
    dragOver.value = false;
  }
});
</script>

<style scoped>
.rotate-180 {
  transform: rotate(180deg);
}
.border-primary {
  border-color: rgb(var(--v-theme-primary)) !important;
}
</style>
