<script setup lang="ts">
/**
 * 子页：项目角色管理 —— 角色列表 + 新建/编辑（基本信息 + 权限分组勾选）+ 删除。
 *
 * 对齐 PC 端 ProjectRolesModal + PermissionAssignment（ADR-0051 项目自治）：
 *   - 项目内角色（含默认角色）完全自治：可改名、改描述、改权限、删除
 *   - 删除时成员自动降级；无可用角色时后端自动创建默认 PROJECT_MEMBER 角色
 *   - 项目所有者使用的角色（isOwnerRole，后端按 ownerId 数据驱动）不可删，后端兜底
 *
 * 权限门控（对齐后端 project-roles.controller.ts）：
 *   - 新建 / 删除 = PROJECT_ROLE_MANAGE
 *   - 编辑（PATCH 支持权限全量替换）= PROJECT_ROLE_MANAGE + PROJECT_ROLE_PERMISSION_MANAGE
 *
 * projectId 从路由参数获取。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  showDialog,
  showLoadingToast,
  closeToast,
  showSuccessToast,
  showFailToast,
} from 'vant'
import { t } from '@/languages'
import {
  rolesControllerGetProjectRolesByProject,
  projectRolesControllerCreateProjectRole,
  projectRolesControllerUpdateProjectRole,
  projectRolesControllerDeleteProjectRole,
  memberControllerGetUserProjectPermissions,
} from '@cloudcad/api-sdk/sdk.gen'
import {
  ProjectPermission,
  ProjectPermissionValue,
  decidePermissionChange,
  getProjectPermissionGroups,
  getProjectPermissionItems,
  getProjectRoleDisplayName,
  type PermissionGroup,
} from '@/utils/projectPermissions'
import type {
  CreateProjectRoleDto,
  ProjectRoleDto,
} from '@cloudcad/api-sdk/types.gen'

const route = useRoute()
const router = useRouter()
const projectId = computed(() => (route.params.id as string) ?? '')

// ── 角色列表 ──
const roles = ref<ProjectRoleDto[]>([])
const roleLoading = ref(false)
const roleError = ref('')

async function loadRoles() {
  if (!projectId.value) return
  // 已有数据时刷新不显示 loading，避免列表闪动
  roleLoading.value = roles.value.length === 0
  try {
    const res = await rolesControllerGetProjectRolesByProject({
      path: { projectId: projectId.value },
    } as any)
    if (res.error) throw res.error
    roles.value = res.data ?? []
    roleError.value = ''
  } catch (e) {
    roleError.value = errMessage(e, t('加载项目角色失败'))
  } finally {
    roleLoading.value = false
  }
}

// ── 权限门控（对齐 PC ProjectRolesModal）──
const projectPermissions = ref<string[]>([])

async function loadProjectPermissions() {
  if (!projectId.value) return
  try {
    const res = await memberControllerGetUserProjectPermissions({
      path: { projectId: projectId.value },
    } as any)
    if (res.error) return
    projectPermissions.value = res.data?.permissions ?? []
  } catch {
    projectPermissions.value = []
  }
}

const canManageRoles = computed(() =>
  projectPermissions.value.includes(ProjectPermission.PROJECT_ROLE_MANAGE),
)
// PATCH 支持 permissions 全量替换 → 需同时具备角色权限配置权限（对齐后端 #262）
const canEditRoles = computed(() =>
  canManageRoles.value &&
    projectPermissions.value.includes(ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE),
)

// ── 权限勾选（对齐 PC PermissionAssignment）──
const permissionGroups = computed<PermissionGroup[]>(() => getProjectPermissionGroups())
const allPermissionItems = computed(() => getProjectPermissionItems())

const configOpen = ref(false)
const editingRole = ref<ProjectRoleDto | null>(null)
const roleName = ref('')
const roleDesc = ref('')
const selectedPerms = ref<string[]>([])
const saving = ref(false)

function checkedCountInGroup(group: PermissionGroup): number {
  return group.items.filter((item) => selectedPerms.value.includes(item.key)).length
}

/**
 * 勾选 / 取消统一出口（决策逻辑见 decidePermissionChange，此处只做副作用）：
 * - 勾选：自动补全前置权限
 * - 取消：仍有下游权限依赖它时先弹确认，确认后级联取消，
 *   从机制上杜绝「能创建但看不到角色」这类无效权限组合
 *
 * 必须用 `:model-value` + `@update:model-value` 受控用法：vant 的 `@change`
 * 在 v-model 写回之后才触发，届时拿不到「变更前」的值，无法判断本次是勾选还是取消。
 */
async function onPermissionChange(next: string[]) {
  const decision = decidePermissionChange(selectedPerms.value, next)

  if (decision.action === 'accept' || decision.action === 'noop') {
    selectedPerms.value = decision.selected
    return
  }

  const labelOf = (perm: string) =>
    allPermissionItems.value.find((item) => item.key === perm)?.label ?? perm
  try {
    await showDialog({
      title: t('取消权限'),
      message: t('取消 {perm} 将同时取消：{deps}。确定继续吗？', {
        perm: decision.removed.map(labelOf).join('、'),
        deps: decision.dependents.map(labelOf).join('、'),
      }),
      showCancelButton: true,
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    // 用户取消：不改动 selectedPerms（受控模式下勾选态本就未变）
    return
  }
  selectedPerms.value = decision.confirmedSelected
}

function openCreateRole() {
  if (!canManageRoles.value) return
  editingRole.value = null
  roleName.value = ''
  roleDesc.value = ''
  selectedPerms.value = []
  configOpen.value = true
}

function openEditRole(role: ProjectRoleDto) {
  if (!canEditRoles.value) return
  editingRole.value = role
  roleName.value = role.name
  roleDesc.value = role.description ?? ''
  selectedPerms.value = role.permissions.map((perm) => perm.permission)
  configOpen.value = true
}

async function onSaveRole() {
  // 与 PC 一致：新建走 POST（仅需 PROJECT_ROLE_MANAGE）；编辑走 PATCH，
  // 支持权限全量替换，需同时具备 PROJECT_ROLE_PERMISSION_MANAGE
  if (editingRole.value ? !canEditRoles.value : !canManageRoles.value) return

  const name = roleName.value.trim()
  if (!name) {
    showFailToast(t('请输入角色名称'))
    return
  }

  saving.value = true
  showLoadingToast({ message: t('保存中...'), forbidClick: true })
  const body: CreateProjectRoleDto = {
    name,
    description: roleDesc.value.trim(),
    // 勾选态停留在 UI 的 string 边界，此处收窄为 SDK 入参要求的枚举字面量联合
    permissions: selectedPerms.value as ProjectPermissionValue[],
  }
  try {
    const res = editingRole.value
      ? await projectRolesControllerUpdateProjectRole({
          path: { projectId: projectId.value, id: editingRole.value.id } as any,
          body,
        } as any)
      : await projectRolesControllerCreateProjectRole({
          path: { projectId: projectId.value } as any,
          body,
        } as any)
    if (res.error) throw res.error
    closeToast()
    showSuccessToast(editingRole.value ? t('角色已更新') : t('角色已创建'))
    configOpen.value = false
    // 自己所在角色被改权限时会直接影响当前用户的项目权限，故一并刷新门控
    await Promise.all([loadRoles(), loadProjectPermissions()])
  } catch (e) {
    closeToast()
    showFailToast(errMessage(e, t('保存失败')))
  } finally {
    saving.value = false
  }
}

async function onDeleteRole(role: ProjectRoleDto) {
  if (!canManageRoles.value) return
  if (role.isOwnerRole) {
    showFailToast(t('项目所有者使用的角色不可删除'))
    return
  }
  try {
    await showDialog({
      title: t('删除角色'),
      message: t(
        '删除「{role}」后，其成员会自动降级为项目内可用的其他角色；若已无可用角色则自动创建默认项目成员角色。此操作不可撤销。',
        { role: getProjectRoleDisplayName(role.name) },
      ),
      showCancelButton: true,
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }

  showLoadingToast({ message: t('删除中...'), forbidClick: true })
  try {
    const res = await projectRolesControllerDeleteProjectRole({
      path: { projectId: projectId.value, id: role.id } as any,
    } as any)
    if (res.error) throw res.error
    closeToast()
    showSuccessToast(t('角色已删除'))
    await loadRoles()
  } catch (e) {
    closeToast()
    showFailToast(errMessage(e, t('删除失败')))
  }
}

/** 从 SDK 错误取可读文案：transformer 把后端 i18n message 放进 Error.message */
function errMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message?: unknown }).message ?? '')
    if (msg) return msg
  }
  return fallback
}

/** 角色成员数（_count 由后端按 includes 返回，可能缺失） */
function roleMemberCount(role: ProjectRoleDto): number {
  return typeof role._count?.members === 'number' ? role._count.members : 0
}

onMounted(() => {
  loadRoles()
  loadProjectPermissions()
})
</script>

<template>
  <div class="subpage">
    <van-nav-bar :title="t('项目角色管理')" left-arrow @click-left="() => router.back()" />

    <div class="roles-body">
      <div class="roles-hint">
        {{ t('角色属于本项目，可自由改名、改权限、删除；删除时成员自动降级') }}
      </div>

      <!-- 已有数据后刷新失败：保留旧列表但提示，避免静默显示陈旧数据 -->
      <div v-if="roleError && roles.length > 0" class="roles-refresh-error">
        {{ roleError }}
      </div>

      <div v-if="roleError && roles.length === 0" class="state-box">
        <span class="state-text">{{ roleError }}</span>
        <van-button size="small" round @click="loadRoles">{{ t('重试') }}</van-button>
      </div>
      <div v-else-if="roleLoading" class="state-box">
        <van-loading size="24" />
      </div>
      <div v-else-if="roles.length === 0" class="state-box">
        <span class="state-text">{{ t('暂无项目角色') }}</span>
        <span v-if="canManageRoles" class="state-text">
          {{ t('点击「新建角色」创建项目专属角色') }}
        </span>
      </div>

      <div v-else class="role-list">
        <div
          v-for="role in roles"
          :key="role.id"
          class="role-card"
          :class="{ 'role-card--default': role.isSystem }"
        >
          <div class="role-card-main">
            <div class="role-card-title">
              <span class="role-name">{{ getProjectRoleDisplayName(role.name) }}</span>
              <span v-if="role.isSystem" class="role-tag role-tag--default">
                {{ t('默认') }}
              </span>
              <span v-if="role.isOwnerRole" class="role-tag">
                {{ t('项目所有者') }}
              </span>
            </div>
            <div v-if="role.description" class="role-desc">{{ role.description }}</div>
            <div class="role-meta">
              <span class="role-perm-count">
                {{ t('{count} 项权限', { count: String(role.permissions.length) }) }}
              </span>
              <span v-if="roleMemberCount(role) > 0" class="role-member-count">
                {{ t('{count} 名成员', { count: String(roleMemberCount(role)) }) }}
              </span>
            </div>
          </div>
          <div class="role-card-actions">
            <button v-if="canEditRoles" class="role-action-btn" @click="openEditRole(role)">
              {{ t('编辑') }}
            </button>
            <button
              v-if="canManageRoles && !role.isOwnerRole"
              class="role-action-btn role-action-btn--danger"
              @click="onDeleteRole(role)"
            >
              {{ t('删除') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="canManageRoles" class="roles-footer">
      <van-button block round type="primary" @click="openCreateRole">
        <van-icon name="plus" /> {{ t('新建角色') }}
      </van-button>
    </div>

    <!-- 角色配置弹窗：基本信息 + 权限分配 -->
    <van-popup
      v-model:show="configOpen"
      position="bottom"
      round
      :style="{ height: '92%' }"
    >
      <div class="role-config">
        <div class="panel-header">
          <button class="panel-cancel" @click="configOpen = false">
            {{ t('取消') }}
          </button>
          <span class="panel-title">
            {{ editingRole ? t('配置项目角色权限') : t('新建项目角色') }}
          </span>
          <button class="panel-confirm" :disabled="saving" @click="onSaveRole">
            {{ saving ? t('保存中...') : t('保存配置') }}
          </button>
        </div>

        <div class="role-config-body">
          <section class="config-section">
            <span class="section-label">{{ t('基本信息') }}</span>
            <van-field
              v-model="roleName"
              :label="t('角色名称')"
              maxlength="50"
              :placeholder="t('请输入角色名称')"
            />
            <van-field
              v-model="roleDesc"
              :label="t('角色描述')"
              maxlength="100"
              :placeholder="t('请输入角色描述（可选）')"
            />
          </section>

          <section class="config-section">
            <div class="perm-section-header">
              <span class="section-label">{{ t('权限分配') }}</span>
              <span class="perm-count">
                {{ t('已选择 {count} 项权限', { count: String(selectedPerms.length) }) }}
              </span>
            </div>
            <!-- 受控用法：:model-value 而非 v-model，见 onPermissionChange 的说明 -->
            <van-checkbox-group
              :model-value="selectedPerms"
              @update:model-value="onPermissionChange"
            >
              <div
                v-for="group in permissionGroups"
                :key="group.items[0].key"
                class="perm-group"
              >
                <div class="perm-group-header">
                  <span class="perm-group-label">{{ group.label }}</span>
                  <span class="perm-group-count">
                    {{ checkedCountInGroup(group) }} / {{ group.items.length }}
                  </span>
                </div>
                <div class="perm-group-items">
                  <van-checkbox
                    v-for="item in group.items"
                    :key="item.key"
                    :name="item.key"
                    class="perm-item"
                  >
                    {{ item.label }}
                  </van-checkbox>
                </div>
              </div>
            </van-checkbox-group>
          </section>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped lang="scss">
.subpage {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

.roles-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.roles-hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.roles-refresh-error {
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--danger);
  background: var(--danger-bg);
  border-radius: var(--radius-md);
}

.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
}

.state-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.role-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.role-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 0.5px solid var(--border-default);
  border-radius: var(--radius-lg);

  &--default {
    background: var(--bg-tertiary);
  }
}

.role-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.role-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.role-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  font-size: 11px;
  line-height: 1.5;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: var(--bg-primary);
  border: 0.5px solid var(--border-default);

  &--default {
    color: var(--accent);
    border-color: var(--accent);
    background: transparent;
  }
}

.role-desc {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.role-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.role-action-btn {
  border: none;
  background: none;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  color: var(--accent);
  cursor: pointer;

  &:active {
    background: var(--list-hover);
  }

  &--danger {
    color: var(--danger);
  }
}

.roles-footer {
  flex: none;
  padding: 10px 14px calc(12px + env(safe-area-inset-bottom));
  background: var(--bg-primary);
  border-top: 0.5px solid var(--border-light);
}

.role-config {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
}

.panel-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 16px;
  border-bottom: 0.5px solid var(--border-light);
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-cancel,
.panel-confirm {
  border: none;
  background: none;
  font-size: 14px;
  padding: 4px 8px;
}

.panel-cancel {
  color: var(--text-tertiary);
}

.panel-confirm {
  color: var(--accent);
  font-weight: 600;
  opacity: 0.5;

  &:not(:disabled) {
    opacity: 1;
  }

  &:disabled {
    pointer-events: none;
  }
}

.role-config-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 0.5px solid var(--border-default);
  border-radius: var(--radius-lg);
}

.section-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.perm-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.perm-count {
  font-size: 12px;
  color: var(--accent);
}

.perm-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;

  & + .perm-group {
    border-top: 0.5px solid var(--border-default);
    margin-top: 4px;
  }
}

.perm-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.perm-group-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.perm-group-count {
  font-size: 11px;
  color: var(--text-tertiary);
}

.perm-group-items {
  display: flex;
  flex-direction: column;
}

.perm-item {
  padding: 6px 0;

  :deep(.van-checkbox__label) {
    font-size: 13px;
    color: var(--text-primary);
  }
}
</style>
