<script setup lang="ts">
/**
 * 子页：个人中心（M5 实施）—— 头部 + 账号信息 + 账号安全 + 退出登录。
 *
 * 数据源：usersControllerGetProfile（后端 UserProfileResponseDto）
 *
 * 账号信息全部支持移动端直接编辑（与 PC /profile 对齐，不做"请去 PC 操作"占位）：
 *   用户名/昵称 → PATCH /users/profile/me（用户名后端限每月 3 次）
 *   邮箱       → 未绑定：bind-email 两步 / 已绑定：rebind-email 三步（发码→验原值→绑新值）
 *   手机号     → 未绑定：bind-phone 两步 / 已绑定：rebind-phone 三步（短信验证码）
 * 账号安全：修改密码 → POST /users/change-password
 *
 * 会员购买 / 续费 / 升级 / 退款走原生会员中心（/shell/member，ADR-0068），
 * 不再跳 PC 页。
 *
 * 已移除的 PC-only 占位项（后端无自助接口，不伪装成可用功能）：
 *   实名认证（无任何后端 API）、登录设备管理（/auth/device 是设备授权而非会话管理）、
 *   升级会员（PATCH /users/:id/membership 需 SYSTEM_USER_MEMBERSHIP_MANAGE 管理端权限）
 *
 * 微信绑定/解绑与登录同机制（整页跳转 + #wechat_result 回传），入口在「账号安全」，
 * 由 runtimeConfig.wechatEnabled 门控（与登录页微信入口同开关）。
 *
 * 编排全部在 composable，本文件只留接线与页面级动作（退出登录 / 忘记密码 / 注销 / 进会员中心）：
 *   useProfileData        资料读取 + 存储配额 + 展示派生 + 用户名/昵称编辑
 *   useProfileAvatar      头像上传
 *   useAccountCredentials 邮箱/手机 绑定·换绑·解绑（含验证码倒计时）
 *   useProfilePassword    修改/设置密码（含改密后重登）
 *   useProfileDeactivate  账号注销（动态验证方式 + 冷静期，对齐 PC ProfileDeactivateTab）
 *   useWechatAccount      微信授权整页跳转（注销验证 / 绑定，回调经 #wechat_result 回传）
 */
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showDialog, showFailToast, showToast } from 'vant';
import { t } from '@/languages';
import { useAuthState } from '@/composables/useAuthState';
import { useLoginPrompt } from '@/composables/useLoginPrompt';
import { useProfileAvatar } from '@/composables/useProfileAvatar';
import { useProfileData } from '@/composables/useProfileData';
import { useProfilePassword } from '@/composables/useProfilePassword';
import { useAccountCredentials } from '@/composables/useAccountCredentials';
import { useProfileDeactivate } from '@/composables/useProfileDeactivate';
import {
  useWechatAccount,
  parseWechatResult,
} from '@/composables/useWechatAccount';
import { useRuntimeConfig } from '@/composables/useRuntimeConfig';
import { formatSize } from '@/composables/useNodeFormatter';
import { logout as logoutSession } from '@/utils/authSession';
import { errMsg, toError, errorCode } from '@/utils/apiError';
import { avatarInitial, displayName } from '@/utils/profileDisplay';

const route = useRoute();
const router = useRouter();

const {
  profile,
  loading,
  error,
  loadProfile,
  storageInfo,
  loadStats,
  storagePercent,
  storageColor,
  isVip,
  vipBadge,
  vipExpireDate,
  vipDaysRemaining,
  vipExpiringSoon,
  roleLabel,
  statusLabel,
  statusTone,
  createdAtText,
  accountGroup,
  securityGroup,
  showTextDialog,
  editField,
  editValue,
  savingText,
  textMaxLength,
  textPlaceholder,
  canSubmitText,
  openTextEdit,
  onTextConfirm,
} = useProfileData();

const {
  avatarInputRef,
  uploadingAvatar,
  avatarImgFailed,
  pickAvatar,
  onAvatarChange,
} = useProfileAvatar(() => loadProfile());

const {
  showCodeDialog,
  codeFeature,
  codeStep,
  newAccountValue,
  oldCode,
  newCode,
  codeMsg,
  codeErr,
  sendingCode,
  submittingCode,
  countdown,
  oldTargetLabel,
  codeDialogTitle,
  codePrimaryLabel,
  canSubmitCode,
  closeCodeDialog,
  sendOldCode,
  sendNewCode,
  onCodePrimary,
  showAccountSheet,
  accountSheetTitle,
  accountSheetActions,
  openAccountSheet,
  onAccountSheetSelect,
  showUnbindDialog,
  unbindTitle,
  unbindTargetLabel,
  canSubmitUnbind,
  unbindCode,
  unbindMsg,
  unbindErr,
  sendUnbindCode,
  confirmUnbind,
  closeUnbindDialog,
} = useAccountCredentials(profile, () => loadProfile());

const {
  showPwdDialog,
  oldPassword,
  newPassword,
  confirmPassword,
  pwdErr,
  submittingPwd,
  showOldPwd,
  showNewPwd,
  showConfirmPwd,
  oldPwdType,
  newPwdType,
  confirmPwdType,
  toggleVisible,
  isSettingPassword,
  pwdTitle,
  pwdConfirmLabel,
  newPwdPlaceholder,
  pwdStrength,
  pwdStrengthWidth,
  pwdSuggestions,
  canSubmitPwd,
  openPwdDialog,
  onChangePassword,
} = useProfilePassword(profile, () => loadProfile());

/** 登出（无确认弹窗）：注销成功后自动登出用；统一失败协议见 authSession.logout
 *  （API 失败 toast 后仍清本地态并跳登录） */
async function doLogout() {
  await logoutSession();
}

const { config } = useRuntimeConfig();
const {
  openAuth,
  bindWechat: bindWechatApi,
  unbindWechat: unbindWechatApi,
} = useWechatAccount();
const {
  graceDays: deactivateGraceDays,
  showSheet: showDeactivateSheet,
  successMsg: deactivateSuccessMsg,
  error: deactivateErr,
  submitting: deactivateSubmitting,
  confirmed: deactivateConfirmed,
  method: deactivateMethod,
  password: deactivatePassword,
  phoneCode: deactivatePhoneCode,
  emailCode: deactivateEmailCode,
  wechatCode: deactivateWechatCode,
  phoneCountdown: deactivatePhoneCountdown,
  emailCountdown: deactivateEmailCountdown,
  methodOptions: deactivateMethodOptions,
  canSubmit: canSubmitDeactivate,
  open: openDeactivate,
  close: closeDeactivate,
  setWechatCode: setDeactivateWechatCode,
  sendPhoneCode: sendDeactivatePhoneCode,
  sendEmailCode: sendDeactivateEmailCode,
  submit: submitDeactivate,
} = useProfileDeactivate(profile, () => void doLogout());

/** 注销的微信验证：整页跳转授权，回调经 /profile#wechat_result 回传 */
async function onDeactivateWechatAuth() {
  try {
    await openAuth('deactivate');
  } catch (e) {
    showFailToast(errMsg(toError(e), t('获取授权链接失败')));
  }
}

/** 微信绑定/解绑入口：未绑定 → 整页跳转授权；已绑定 → 确认后解绑（同 PC 交互） */
async function onWechatCellClick() {
  if (!profile.value?.wechatId) {
    try {
      await openAuth('bind');
    } catch (e) {
      showFailToast(errMsg(toError(e), t('获取授权链接失败')));
    }
    return;
  }
  try {
    await showDialog({
      title: t('解绑微信'),
      message: t('确定要解绑微信吗？解绑后需要重新绑定。'),
      showCancelButton: true,
      confirmButtonText: t('确认解绑'),
      cancelButtonText: t('取消'),
    });
  } catch {
    return;
  }
  try {
    await unbindWechatApi();
    showToast(t('微信解绑成功'));
    void loadProfile();
  } catch (e) {
    showFailToast(errMsg(toError(e), t('解绑失败')));
  }
}

/** 绑定回调消费（#wechat_result purpose=bind）：调 bind，409 冲突询问是否接管（同 PC） */
async function handleBindResult(code: string, state: string) {
  try {
    await bindWechatApi(code, state);
    showToast(t('微信绑定成功'));
    void loadProfile();
    return;
  } catch (e) {
    if (errorCode(e) !== 'CONFLICT') {
      showFailToast(errMsg(e, t('绑定失败')));
      return;
    }
  }
  try {
    await showDialog({
      title: t('绑定微信'),
      message: t(
        '该微信已绑定其他账号，是否解绑该账号的微信并绑定到当前账号？'
      ),
      showCancelButton: true,
      confirmButtonText: t('确认接管绑定'),
      cancelButtonText: t('取消'),
    });
  } catch {
    showFailToast(t('该微信已绑定其他账号'));
    return;
  }
  try {
    await bindWechatApi(code, state, true);
    showToast(t('微信绑定成功'));
    void loadProfile();
  } catch (e) {
    showFailToast(errMsg(e, t('绑定失败')));
  }
}

onMounted(() => {
  // 微信授权回调：解析 #wechat_result 后清 hash，避免刷新重复消费
  const result = parseWechatResult(route.hash);
  if (!result) return;
  void router.replace({ path: '/shell/profile' });
  if (result.purpose === 'deactivate') {
    setDeactivateWechatCode(result.code);
    openDeactivate('wechat');
    showToast(t('微信授权完成，确认注销时自动验证'));
  } else if (result.purpose === 'bind') {
    void handleBindResult(result.code, result.state);
  }
});

/** 账号信息行点击：文本字段直接进编辑，邮箱/手机先进「绑定/更换/解绑」选择 */
function onAccountClick(action: string) {
  if (action === 'edit-username') return openTextEdit('username');
  if (action === 'edit-nickname') return openTextEdit('nickname');
  if (action === 'edit-phone') return openAccountSheet('phone');
  if (action === 'edit-email') return openAccountSheet('email');
}

function onSecurityClick(action: string) {
  if (action === 'change-password') openPwdDialog();
}

/** 忘记密码：页内导航到原生页（路由守卫已放行已登录用户进入 /forgot-password、/reset-password） */
function openForgotPassword() {
  void router.push('/forgot-password');
}

/** 进入原生会员中心（ADR-0068）：购买 / 续费 / 升级 / 退款全在移动端完成 */
function openMemberCenter(): void {
  router.push('/shell/member');
}

async function onLogout() {
  try {
    await showDialog({
      title: t('退出登录'),
      message: t('确定要退出当前账号吗？'),
      showCancelButton: true,
      confirmButtonText: t('退出登录'),
      cancelButtonText: t('取消'),
    });
  } catch {
    return;
  }

  // 统一失败协议（authSession.logout）：API 失败 toast 后**仍然**清本地会话并跳登录
  // （废止旧「失败不清、只 toast 重试」协议——后端登出失败不应把用户困在不可用会话里）
  await logoutSession();
}

// 未登录引导：guest/token_expired 态自动跳原生登录页（同 tab 带 redirect 回跳）；
// 登录完成后加载资料与存储配额
useLoginPrompt(() => {
  void loadProfile();
  void loadStats();
});
</script>

<template>
  <div class="subpage">
    <van-nav-bar
      :title="t('个人中心')"
      left-arrow
      @click-left="() => router.back()"
    />

    <div v-if="loading && !profile.username" class="loading-state">
      <van-loading size="32" />
    </div>

    <div v-else-if="error" class="error-state">
      <span class="error-text">{{ error }}</span>
      <van-button size="small" round @click="loadProfile">{{
        t('重试')
      }}</van-button>
    </div>

    <div v-else class="profile-scroll">
      <!-- ═══ 用户头部 ═══ -->
      <div class="profile-header">
        <div class="avatar" @click="pickAvatar">
          <van-image
            v-if="profile.avatar && !avatarImgFailed"
            class="avatar-img"
            :src="profile.avatar"
            fit="cover"
            @error="avatarImgFailed = true"
          />
          <span v-else class="avatar-text">{{
            avatarInitial(displayName(profile))
          }}</span>
          <div v-if="uploadingAvatar" class="avatar-overlay">
            <van-loading size="16" />
          </div>
          <div v-else class="avatar-edit">
            <van-icon name="photo" size="12" />
          </div>
        </div>
        <div class="user-info">
          <div class="user-name-row">
            <span class="user-name">{{ displayName(profile) || '—' }}</span>
            <span v-if="isVip && vipBadge" class="vip-badge">{{
              vipBadge
            }}</span>
          </div>
          <span v-if="isVip" class="vip-expire">
            {{ t('会员有效期至') }} {{ vipExpireDate || t('永久') }}
          </span>
          <span v-else class="vip-expire">{{ t('免费用户') }}</span>
        </div>
      </div>
      <input
        ref="avatarInputRef"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        class="file-input-hidden"
        @change="onAvatarChange"
      />

      <!-- ═══ 会员到期预警（D-11）═══ -->
      <div v-if="vipExpiringSoon" class="vip-warning">
        <van-icon name="warning-o" size="14" />
        <span>{{
          t('会员即将到期，剩余 {days} 天，请及时续费', {
            days: String(vipDaysRemaining),
          })
        }}</span>
      </div>

      <!-- ═══ 会员（D-10）：购买 / 续费 / 升级 / 退款走原生会员中心（ADR-0068）═══ -->
      <van-cell-group class="section">
        <div class="section-title">{{ t('会员') }}</div>
        <van-cell
          :title="t('管理会员')"
          :value="isVip && vipBadge ? vipBadge : t('免费用户')"
          is-link
          @click="openMemberCenter"
        />
      </van-cell-group>

      <!-- ═══ 存储空间（D-12）═══ -->
      <van-cell-group v-if="storageInfo" class="section">
        <div class="section-title">{{ t('存储空间') }}</div>
        <div class="storage-box">
          <div class="storage-line">
            <span>{{
              t('已用 {size}', { size: formatSize(storageInfo.used) })
            }}</span>
            <span>{{
              t('总计 {size}', { size: formatSize(storageInfo.total) })
            }}</span>
          </div>
          <div class="storage-track">
            <div
              class="storage-fill"
              :style="{
                width: (storagePercent ?? 0) + '%',
                background: storageColor,
              }"
            />
          </div>
          <div class="storage-line below">
            <span>{{
              t('剩余 {size}', { size: formatSize(storageInfo.remaining) })
            }}</span>
            <span>{{
              t('使用率 {pct}%', { pct: (storagePercent ?? 0).toFixed(1) })
            }}</span>
          </div>
        </div>
      </van-cell-group>

      <!-- ═══ 账号信息 ═══ -->
      <van-cell-group class="section account-section">
        <div class="section-title">{{ t('账号信息') }}</div>
        <van-cell
          v-for="item in accountGroup"
          :key="item.action"
          :title="item.label"
          is-link
          @click="onAccountClick(item.action)"
        >
          <template #value>
            <span class="cell-value">{{ item.value }}</span>
            <van-icon
              v-if="item.verified"
              name="passed"
              class="verified-mark"
            />
          </template>
        </van-cell>
      </van-cell-group>

      <!-- ═══ 账号详情（D-02）═══ -->
      <van-cell-group class="section">
        <div class="section-title">{{ t('账号详情') }}</div>
        <van-cell :title="t('账户角色')">
          <template #value
            ><span class="meta-tag">{{ roleLabel }}</span></template
          >
        </van-cell>
        <van-cell :title="t('账户状态')">
          <template #value>
            <span class="meta-tag" :class="'meta-' + statusTone">{{
              statusLabel
            }}</span>
          </template>
        </van-cell>
        <van-cell
          v-if="createdAtText"
          :title="t('创建时间')"
          :value="createdAtText"
        />
      </van-cell-group>

      <!-- ═══ 账号安全 ═══ -->
      <van-cell-group class="section">
        <div class="section-title">{{ t('账号安全') }}</div>
        <van-cell
          v-for="item in securityGroup"
          :key="item.action"
          :title="item.label"
          is-link
          @click="onSecurityClick(item.action)"
        />
        <van-cell
          v-if="config.wechatEnabled"
          :title="t('绑定微信')"
          :value="profile.wechatId ? t('已绑定') : t('未绑定')"
          is-link
          @click="onWechatCellClick"
        />
        <van-cell
          :title="t('忘记密码？')"
          is-link
          @click="openForgotPassword"
        />
        <van-cell
          v-if="deactivateMethodOptions.length"
          :title="t('注销账号')"
          is-link
          @click="openDeactivate()"
        />
      </van-cell-group>

      <!-- ═══ 退出登录 ═══ -->
      <button class="logout-btn" @click="onLogout">{{ t('退出登录') }}</button>
    </div>

    <!-- ═══ 用户名 / 昵称编辑 ═══ -->
    <van-popup
      v-model:show="showTextDialog"
      position="bottom"
      round
      :style="{ height: '42%' }"
    >
      <div class="form-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showTextDialog = false">
            {{ t('取消') }}
          </button>
          <span class="panel-title">{{
            editField === 'username' ? t('修改用户名') : t('修改昵称')
          }}</span>
          <span class="panel-spacer"></span>
        </div>
        <div class="panel-body">
          <van-field
            v-model="editValue"
            :maxlength="textMaxLength"
            :placeholder="textPlaceholder"
            clearable
            @keyup.enter="onTextConfirm"
          />
          <p v-if="editField === 'username'" class="field-tip">
            {{ t('用户名每月最多修改 3 次') }}
          </p>
        </div>
        <button
          class="primary-btn"
          :disabled="!canSubmitText || savingText"
          @click="onTextConfirm"
        >
          {{ savingText ? t('保存中…') : t('保存') }}
        </button>
      </div>
    </van-popup>

    <!-- ═══ 邮箱 / 手机号 验证码 ═══ -->
    <van-popup
      v-model:show="showCodeDialog"
      position="bottom"
      round
      :style="{ height: '56%' }"
    >
      <div class="form-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="closeCodeDialog">
            {{ t('取消') }}
          </button>
          <span class="panel-title">{{ codeDialogTitle }}</span>
          <span class="panel-spacer"></span>
        </div>
        <div class="panel-body">
          <template v-if="codeStep === 'verifyOld'">
            <p class="field-hint">
              {{ t('验证码已发送至') }}{{ oldTargetLabel }}
            </p>
            <van-field
              v-model="oldCode"
              type="digit"
              maxlength="6"
              :placeholder="t('请输入验证码')"
              clearable
            />
            <button
              class="resend-btn"
              :disabled="countdown > 0 || sendingCode"
              @click="sendOldCode"
            >
              {{
                countdown > 0
                  ? `${t('重新发送')}（${countdown}s）`
                  : t('发送验证码')
              }}
            </button>
          </template>

          <template v-else>
            <van-field
              v-model="newAccountValue"
              :type="codeFeature === 'phone' ? 'tel' : 'text'"
              :maxlength="codeFeature === 'phone' ? 11 : 100"
              :placeholder="
                codeFeature === 'phone'
                  ? t('请输入新的手机号')
                  : t('请输入新的邮箱地址')
              "
              :disabled="codeStep === 'verifyNew'"
              clearable
            />
            <template v-if="codeStep === 'verifyNew'">
              <van-field
                v-model="newCode"
                type="digit"
                maxlength="6"
                :placeholder="t('请输入验证码')"
                clearable
              />
              <button
                class="resend-btn"
                :disabled="countdown > 0 || sendingCode"
                @click="sendNewCode(false)"
              >
                {{
                  countdown > 0
                    ? `${t('重新发送')}（${countdown}s）`
                    : t('重新发送验证码')
                }}
              </button>
            </template>
          </template>

          <div v-if="codeErr" class="field-error">{{ codeErr }}</div>
          <div v-else-if="codeMsg" class="field-tip">{{ codeMsg }}</div>
        </div>
        <button
          class="primary-btn"
          :disabled="!canSubmitCode || sendingCode || submittingCode"
          @click="onCodePrimary"
        >
          {{ codePrimaryLabel }}
        </button>
      </div>
    </van-popup>

    <!-- ═══ 修改 / 设置密码（D-06/D-07/D-15）═══ -->
    <van-popup
      v-model:show="showPwdDialog"
      position="bottom"
      round
      :style="{ height: '76%' }"
    >
      <div class="form-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showPwdDialog = false">
            {{ t('取消') }}
          </button>
          <span class="panel-title">{{ pwdTitle }}</span>
          <span class="panel-spacer"></span>
        </div>
        <div class="panel-body">
          <p v-if="isSettingPassword" class="pwd-hint">
            {{
              t(
                '您的账户是通过手机号或微信自动创建的，尚未设置密码。设置密码后可使用账号密码登录。'
              )
            }}
          </p>

          <van-field
            v-if="!isSettingPassword"
            v-model="oldPassword"
            :type="oldPwdType"
            :placeholder="t('请输入当前密码')"
            clearable
          >
            <template #right-icon>
              <van-icon
                :name="showOldPwd ? 'eye' : 'eye-o'"
                @click="toggleVisible('old')"
              />
            </template>
          </van-field>

          <van-field
            v-model="newPassword"
            :type="newPwdType"
            :placeholder="newPwdPlaceholder"
            clearable
          >
            <template #right-icon>
              <van-icon
                :name="showNewPwd ? 'eye' : 'eye-o'"
                @click="toggleVisible('new')"
              />
            </template>
          </van-field>

          <div v-if="newPassword" class="pwd-strength">
            <div class="strength-bar">
              <div
                class="strength-fill"
                :style="{
                  width: pwdStrengthWidth,
                  background: pwdStrength.color,
                }"
              />
            </div>
            <span
              class="strength-label"
              :style="{ color: pwdStrength.color }"
              >{{ pwdStrength.label }}</span
            >
          </div>

          <van-field
            v-model="confirmPassword"
            :type="confirmPwdType"
            :placeholder="t('请再次输入新密码')"
            clearable
          >
            <template #right-icon>
              <van-icon
                :name="showConfirmPwd ? 'eye' : 'eye-o'"
                @click="toggleVisible('confirm')"
              />
            </template>
          </van-field>

          <div v-if="pwdErr" class="field-error">{{ pwdErr }}</div>

          <div v-if="newPassword" class="pwd-tips">
            <div class="tips-title">{{ t('安全建议') }}</div>
            <div v-for="(tip, i) in pwdSuggestions" :key="i" class="tips-item">
              <van-icon
                :name="tip.ok ? 'passed' : 'info-o'"
                class="tips-icon"
                :class="{ ok: tip.ok }"
              />
              <span>{{ tip.text }}</span>
            </div>
          </div>
        </div>
        <button
          class="primary-btn"
          :disabled="!canSubmitPwd || submittingPwd"
          @click="onChangePassword"
        >
          {{ pwdConfirmLabel }}
        </button>
      </div>
    </van-popup>

    <!-- ═══ 解绑邮箱 / 手机号（D-05）═══ -->
    <van-popup
      v-model:show="showUnbindDialog"
      position="bottom"
      round
      :style="{ height: '46%' }"
    >
      <div class="form-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="closeUnbindDialog">
            {{ t('取消') }}
          </button>
          <span class="panel-title">{{ unbindTitle }}</span>
          <span class="panel-spacer"></span>
        </div>
        <div class="panel-body">
          <p class="field-hint">
            {{ t('验证码将发送至') }}{{ unbindTargetLabel }}
          </p>
          <van-field
            v-model="unbindCode"
            type="digit"
            maxlength="6"
            :placeholder="t('请输入验证码')"
            clearable
          />
          <button
            class="resend-btn"
            :disabled="countdown > 0 || sendingCode"
            @click="sendUnbindCode"
          >
            {{
              countdown > 0
                ? `${t('重新发送')}（${countdown}s）`
                : t('发送验证码')
            }}
          </button>
          <p class="field-tip">
            {{
              t('解绑后将无法通过该账号登录，账号至少需要保留一种登录方式。')
            }}
          </p>
          <div v-if="unbindErr" class="field-error">{{ unbindErr }}</div>
          <div v-else-if="unbindMsg" class="field-tip">{{ unbindMsg }}</div>
        </div>
        <button
          class="primary-btn danger"
          :disabled="!canSubmitUnbind || sendingCode || submittingCode"
          @click="confirmUnbind"
        >
          {{ submittingCode ? t('提交中…') : t('确认解绑') }}
        </button>
      </div>
    </van-popup>

    <!-- ═══ 账号注销（D-09，对齐 PC ProfileDeactivateTab）═══ -->
    <van-popup
      v-model:show="showDeactivateSheet"
      position="bottom"
      round
      :style="{ height: '72%' }"
    >
      <div class="form-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="closeDeactivate()">
            {{ t('取消') }}
          </button>
          <span class="panel-title">{{ t('注销账号') }}</span>
          <span class="panel-spacer"></span>
        </div>
        <div class="panel-body">
          <template v-if="deactivateSuccessMsg">
            <p class="deactivate-success">{{ deactivateSuccessMsg }}</p>
          </template>
          <template v-else>
            <p class="field-hint">
              {{
                t(
                  '注销账户后，{days} 天内重新登录可自动取消注销；逾期需联系客服恢复。30 天后账户数据将被彻底删除。',
                  {
                    days: String(deactivateGraceDays),
                  }
                )
              }}
            </p>
            <ul class="deactivate-warnings">
              <li>
                {{
                  t('冷静期内（{days} 天）重新登录可自动取消注销', {
                    days: String(deactivateGraceDays),
                  })
                }}
              </li>
              <li>{{ t('冷静期过后需联系客服恢复账户') }}</li>
              <li>{{ t('30 天后账户数据将被彻底删除，无法恢复') }}</li>
            </ul>

            <div class="method-label">{{ t('验证方式') }}</div>
            <van-radio-group v-model="deactivateMethod" class="method-group">
              <van-radio
                v-for="opt in deactivateMethodOptions"
                :key="opt.value"
                :name="opt.value"
                class="method-radio"
              >
                {{ opt.label }}
              </van-radio>
            </van-radio-group>

            <template v-if="deactivateMethod === 'password'">
              <van-field
                v-model="deactivatePassword"
                type="password"
                :placeholder="t('请输入密码')"
                clearable
              />
            </template>
            <template v-else-if="deactivateMethod === 'phone'">
              <van-field
                v-model="deactivatePhoneCode"
                type="digit"
                maxlength="6"
                :placeholder="t('请输入手机验证码')"
                clearable
              />
              <button
                class="resend-btn"
                :disabled="deactivatePhoneCountdown > 0"
                @click="sendDeactivatePhoneCode()"
              >
                {{
                  deactivatePhoneCountdown > 0
                    ? `${t('重新发送')}（${deactivatePhoneCountdown}s）`
                    : t('获取验证码')
                }}
              </button>
            </template>
            <template v-else-if="deactivateMethod === 'email'">
              <van-field
                v-model="deactivateEmailCode"
                type="digit"
                maxlength="6"
                :placeholder="t('请输入邮箱验证码')"
                clearable
              />
              <button
                class="resend-btn"
                :disabled="deactivateEmailCountdown > 0"
                @click="sendDeactivateEmailCode()"
              >
                {{
                  deactivateEmailCountdown > 0
                    ? `${t('重新发送')}（${deactivateEmailCountdown}s）`
                    : t('获取验证码')
                }}
              </button>
            </template>
            <template v-else-if="deactivateMethod === 'wechat'">
              <p v-if="deactivateWechatCode" class="field-tip">
                {{ t('微信授权完成，确认注销时自动验证') }}
              </p>
              <button v-else class="resend-btn" @click="onDeactivateWechatAuth">
                {{ t('微信授权') }}
              </button>
            </template>

            <van-checkbox
              v-model="deactivateConfirmed"
              class="deactivate-confirm"
            >
              {{ t('我已了解注销的后果，并确认注销') }}
            </van-checkbox>

            <div v-if="deactivateErr" class="field-error">
              {{ deactivateErr }}
            </div>
          </template>
        </div>
        <button
          class="primary-btn danger"
          :disabled="
            !deactivateSuccessMsg &&
            (!canSubmitDeactivate ||
              !deactivateConfirmed ||
              deactivateSubmitting)
          "
          @click="submitDeactivate()"
        >
          {{ deactivateSubmitting ? t('注销中…') : t('确认注销') }}
        </button>
      </div>
    </van-popup>

    <!-- ═══ 邮箱 / 手机 更换 · 解绑 选择 ═══ -->
    <van-action-sheet
      v-model:show="showAccountSheet"
      :title="accountSheetTitle"
      :actions="accountSheetActions"
      @select="onAccountSheetSelect"
    />
  </div>
</template>

<style scoped lang="scss">
.subpage {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  padding-bottom: 32px;
  overflow: hidden;
}

/* .subpage 自身 overflow:hidden 不滚动，须由内部容器提供滚动区（同 .share-list/.member-list），
   否则首屏以下的内容会被裁掉且无法下滑 */
.profile-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
}

.error-text {
  font-size: 13px;
  color: #ff4444;
}

/* ── 用户头部 ── */
.profile-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px 16px 20px;
  background: var(--bg-secondary);
  border-bottom: 0.5px solid var(--divider);
}

.avatar {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00a99e 0%, #007a6f 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 169, 158, 0.3);

  &:active {
    opacity: 0.85;
  }
}

.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: block;
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 右下角相机角标：提示可点击换头像，不遮罩头像主体 */
.avatar-edit {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  border: 2px solid var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  pointer-events: none;
}

.file-input-hidden {
  display: none;
}

.avatar-text {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
}

.user-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vip-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 8px;
  background: linear-gradient(135deg, #ffd700 0%, #ff976a 100%);
  color: #1a1a1a;
  letter-spacing: 0.4px;
  flex-shrink: 0;
}

.vip-expire {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ── 分组 ── */
.section {
  margin: 14px 12px 0;
  background: var(--bg-secondary);
  border-radius: 12px;
}

.section-title {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 10px 16px 6px;
}

/* ── 退出登录 ── */
.logout-btn {
  margin: 28px 16px 0;
  width: calc(100% - 32px);
  padding: 12px;
  border: 1px solid rgba(255, 68, 68, 0.4);
  border-radius: 12px;
  background: rgba(255, 68, 68, 0.06);
  color: #ff4444;
  font-size: 15px;
  font-weight: 500;

  &:active {
    opacity: 0.8;
  }
}

/* ── 底部表单弹窗 ── */
.form-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-bottom: 24px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}

.panel-cancel {
  border: none;
  background: none;
  font-size: 14px;
  color: var(--text-tertiary);
  padding: 4px 8px;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-spacer {
  width: 56px;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px;
}

.field-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.field-hint {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.field-error {
  margin-top: 8px;
  font-size: 12px;
  color: #ff4444;
}

.resend-btn {
  margin-top: 12px;
  align-self: flex-start;
  padding: 6px 14px;
  border: 1px solid var(--divider);
  border-radius: 16px;
  background: transparent;
  font-size: 12px;
  color: var(--accent);

  &:not(:disabled) {
    cursor: pointer;
  }

  &:disabled {
    color: var(--text-tertiary);
    cursor: default;
  }
}

.primary-btn {
  margin: 16px;
  padding: 12px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #00a99e 0%, #007a6f 100%);
  color: #fff;
  font-size: 15px;
  font-weight: 600;

  &:not(:disabled) {
    cursor: pointer;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  &.danger {
    background: linear-gradient(135deg, #ff6b6b 0%, #e03131 100%);
  }
}

/* ── 会员到期预警 ── */
.vip-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 12px 0;
  padding: 9px 12px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  font-size: 12px;
  color: #b45309;

  .van-icon {
    flex-shrink: 0;
    color: #d97706;
  }
}

/* ── 存储空间 ── */
.storage-box {
  padding: 2px 16px 14px;
}

.storage-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-tertiary);

  & + .storage-track {
    margin-top: 6px;
  }

  &.below {
    margin-top: 6px;
  }
}

.storage-track {
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-tertiary, rgba(0, 0, 0, 0.06));
}

.storage-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.4s ease;
}

/* ── 账号信息 / 详情 ── */
/* van-cell 默认 title/value 各占 50%：两字标签撑出大片空白，值区只剩半格，
   邮箱这类长文本被压到约 88px 直接截断。标签按内容宽度，剩余空间让给值。
   二者都是 vant 内部元素，scoped 须 :deep 才能命中。 */
.account-section :deep(.van-cell__title) {
  flex: none;
}

.account-section :deep(.van-cell__value) {
  flex: 1;
  min-width: 0;
}

/* display:inline-block + max-width:100%：短值收缩到自身宽度（不占满），长值封顶在
   可用宽度并真正渲染省略号——display:flex 下的裸文本节点不会出 ellipsis，是硬剪。
   text-align:left 保证超长时从左起裁成「1245…@…」而非反向裁掉邮箱头部。 */
.cell-value {
  display: inline-block;
  max-width: 100%;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.verified-mark {
  color: var(--accent, #00a99e);
}

.meta-tag {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--bg-tertiary, rgba(0, 0, 0, 0.05));
  color: var(--text-secondary);
}

.meta-ok {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.meta-warn {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.meta-err {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}

/* ── 注销弹窗 ── */
.deactivate-warnings {
  margin: 8px 0 0;
  padding: 0 0 0 18px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--text-secondary);
}

.method-label {
  margin-top: 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.method-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}

.method-radio {
  height: 40px;
  font-size: 14px;
}

.deactivate-confirm {
  margin-top: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.deactivate-success {
  margin: 24px 0 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-primary);
}

/* ── 密码弹窗 ── */
.pwd-hint {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-tertiary, rgba(0, 0, 0, 0.04));
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.pwd-strength {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  padding: 0 4px;
}

.strength-bar {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--bg-tertiary, rgba(0, 0, 0, 0.06));
}

.strength-fill {
  height: 100%;
  border-radius: 2px;
  transition:
    width 0.25s ease,
    background 0.25s ease;
}

.strength-label {
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}

.pwd-tips {
  margin-top: 16px;
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-tertiary, rgba(0, 0, 0, 0.04));
}

.tips-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.tips-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.tips-icon {
  flex-shrink: 0;
  color: var(--text-tertiary);

  &.ok {
    color: #22c55e;
  }
}
</style>
