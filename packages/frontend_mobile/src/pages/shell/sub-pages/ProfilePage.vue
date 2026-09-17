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
 * 已移除的 PC-only 占位项（后端无自助接口，不伪装成可用功能）：
 *   实名认证（无任何后端 API）、登录设备管理（/auth/device 是设备授权而非会话管理）、
 *   升级会员（PATCH /users/:id/membership 需 SYSTEM_USER_MEMBERSHIP_MANAGE 管理端权限）、
 *   微信绑定（OAuth 全页跳转，PC 亦由 runtimeConfig.wechatEnabled 关闭）
 */
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  usersControllerGetProfile,
  usersControllerUpdateProfile,
  usersControllerChangePassword,
  usersControllerUploadAvatar,
  usersControllerGetDashboardStats,
  authControllerLogin,
  authControllerLogout,
  authControllerSendBindEmailCode,
  authControllerVerifyBindEmail,
  authControllerSendUnbindEmailCode,
  authControllerVerifyUnbindEmailCode,
  authControllerUnbindEmail,
  authControllerRebindEmail,
  authControllerSendSmsCode,
  authControllerBindPhone,
  authControllerSendUnbindPhoneCode,
  authControllerVerifyUnbindPhoneCode,
  authControllerUnbindPhone,
  authControllerRebindPhone,
} from '@cloudcad/api-sdk/sdk.gen'
import { showToast, showDialog, showFailToast, showSuccessToast } from 'vant'
import { t } from '@/languages'
import { useAuthState } from '@/composables/useAuthState'
import { useLoginPrompt } from '@/composables/useLoginPrompt'
import { navigateToLogin } from '@/utils/authNavigate'
import { getPCForgotPasswordUrl, getPCMemberCenterUrl } from '@/utils/apiConfig'
import {
  membershipBadge,
  membershipExpiry,
  maskPhone,
  avatarInitial,
  displayName,
} from '@/utils/profileDisplay'
import { formatSize } from '@/composables/useNodeFormatter'

interface UserProfile {
  id?: string
  username?: string
  nickname?: string
  phone?: string | null
  phoneVerified?: boolean
  email?: string
  avatar?: string
  /** 0=VIP0 免费；1/2/3...=有效会员档位 */
  membershipTierLevel?: number
  membershipTier?: string
  membershipExpiresAt?: string | null
  isVip?: boolean
  /** 手机/微信注册用户可能未设置密码 */
  hasPassword?: boolean
  provider?: string
  /** ACTIVE / INACTIVE / SUSPENDED（UserStatus） */
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  role?: { id: string; name: string; description?: string; isSystem: boolean }
  createdAt?: string
  updatedAt?: string
}

/** 个人空间存储配额（UserDashboardStatsDto.storage） */
interface StorageInfo {
  used: number
  total: number
  remaining: number
  usagePercent: number
}

/** SDK 响应解包：error 统一转成带后端 message 的 Error */
function toError(err: unknown): Error {
  if (err instanceof Error) return err
  const raw = err as Record<string, unknown> | null
  if (raw && typeof raw.message === 'string' && raw.message) return new Error(raw.message)
  return new Error(String(err))
}

function unwrap<T>(res: { error?: unknown; data?: unknown }): T {
  if (res.error) throw toError(res.error)
  return (res.data ?? {}) as T
}

/** 后端随 Accept-Language 返回 i18n 文案，直接透传 */
function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message
  const raw = e as Record<string, unknown> | null
  if (raw && typeof raw.message === 'string' && raw.message) return raw.message
  return fallback
}

const router = useRouter()
const profile = ref<UserProfile>({})
const loading = ref(true)
const error = ref('')
const submitting = ref(false)
const { setGuest, setAuthenticated } = useAuthState()

async function loadProfile() {
  loading.value = true
  error.value = ''
  try {
    profile.value = unwrap(await usersControllerGetProfile())
  } catch (e) {
    console.error('[Profile] loadProfile:', e)
    error.value = t('加载失败')
  } finally {
    loading.value = false
  }
}

// ═══ 存储配额用量（D-12）═══
// GET /users/stats/me → UserDashboardStatsDto.storage；失败静默（配额条不显示），
// 不把整页打成错误态——资料本身已加载成功
const storageInfo = ref<StorageInfo | null>(null)

async function loadStats() {
  try {
    const data = unwrap<{ storage?: StorageInfo }>(await usersControllerGetDashboardStats())
    const s = data.storage
    if (s && typeof s.total === 'number' && s.total > 0) storageInfo.value = s
  } catch (e) {
    console.error('[Profile] loadStats:', e)
    storageInfo.value = null
  }
}

const storagePercent = computed(() => {
  const s = storageInfo.value
  if (!s) return null
  const pct = typeof s.usagePercent === 'number' ? s.usagePercent : (s.total > 0 ? (s.used / s.total) * 100 : 0)
  return Math.min(Math.max(pct, 0), 100)
})

const storageColor = computed(() => {
  const pct = storagePercent.value ?? 0
  if (pct > 90) return 'var(--error, #ef4444)'
  if (pct > 70) return 'var(--warning, #f59e0b)'
  return 'var(--accent, #00a99e)'
})

// ── 显示值（字段映射集中在 @/utils/profileDisplay，契约由 spec 锁定）──
const isVip = computed(() => !!profile.value.isVip)
const vipBadge = computed(() => membershipBadge(profile.value))
const vipExpireDate = computed(() => membershipExpiry(profile.value))

// 会员到期预警（D-11）：有效会员且剩余 ≤7 天；expiresAt 为 null 表示永久，不算到期
const vipDaysRemaining = computed(() => {
  const raw = profile.value.membershipExpiresAt
  if (!profile.value.isVip || !raw) return null
  const expire = new Date(raw).getTime()
  if (Number.isNaN(expire)) return null
  return Math.ceil((expire - Date.now()) / 86400000)
})
const vipExpiringSoon = computed(() => {
  const days = vipDaysRemaining.value
  return days !== null && days > 0 && days <= 7
})

// 账号元信息（D-02）：角色按 name === 'ADMIN' 判定（与 PC usePermission.isAdmin 同口径）
const roleLabel = computed(() => (profile.value.role?.name === 'ADMIN' ? t('系统管理员') : t('普通用户')))
const statusLabel = computed(() =>
  profile.value.status === 'INACTIVE' ? t('未激活') : profile.value.status === 'SUSPENDED' ? t('已禁用') : t('正常')
)
const statusTone = computed(() =>
  profile.value.status === 'ACTIVE' ? 'ok' : profile.value.status === 'INACTIVE' ? 'warn' : 'err'
)
const createdAtText = computed(() => {
  const raw = profile.value.createdAt
  if (!raw) return ''
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
})

interface AccountEntry {
  label: string
  value: string
  action: string
  /** 已验证标记（D-03）：邮箱=已绑定；手机号=phoneVerified */
  verified?: boolean
}

const accountGroup = computed<AccountEntry[]>(() => [
  { label: t('用户名'), value: profile.value.username ?? '—', action: 'edit-username' },
  { label: t('昵称'), value: profile.value.nickname ?? '—', action: 'edit-nickname' },
  {
    label: t('邮箱'),
    value: profile.value.email ?? '—',
    action: 'edit-email',
    // 后端无 emailVerified 字段：邮箱绑定即视为已验证
    verified: !!profile.value.email,
  },
  {
    label: t('手机号'),
    value: maskPhone(profile.value.phone) || '—',
    action: 'edit-phone',
    // 手机号有独立 phoneVerified 标记（后台导入/管理员代绑可能未验证）
    verified: !!profile.value.phone && profile.value.phoneVerified === true,
  },
])

const securityGroup = computed(() => [
  { label: profile.value.hasPassword === false ? t('设置密码') : t('修改密码'), value: '', action: 'change-password' },
])

// ═══ 用户名 / 昵称编辑 ═══
type TextField = 'username' | 'nickname'
const showTextDialog = ref(false)
const editField = ref<TextField>('nickname')
const editValue = ref('')

const textMaxLength = computed(() => (editField.value === 'username' ? 20 : 50))
const textPlaceholder = computed(() =>
  editField.value === 'username' ? t('请输入用户名（3-20 个字符）') : t('请输入昵称（最多 50 个字符）')
)
const canSubmitText = computed(() => {
  const v = editValue.value.trim()
  if (!v) return false
  if (editField.value === 'username') return v.length >= 3
  return true
})

function openTextEdit(field: TextField) {
  editField.value = field
  editValue.value = field === 'username'
    ? (profile.value.username ?? '')
    : (profile.value.nickname ?? '')
  showTextDialog.value = true
}

async function onTextConfirm() {
  if (!canSubmitText.value || submitting.value) return
  submitting.value = true
  try {
    const body = editField.value === 'username'
      ? { username: editValue.value.trim() }
      : { nickname: editValue.value.trim() }
    unwrap(await usersControllerUpdateProfile({ body }))
    showSuccessToast(editField.value === 'username' ? t('用户名已更新') : t('昵称已更新'))
    showTextDialog.value = false
    await loadProfile()
  } catch (e) {
    showFailToast(errMsg(e, t('更新失败')))
  } finally {
    submitting.value = false
  }
}

// ═══ 邮箱 / 手机号 绑定·换绑（验证码）═══
type CodeFeature = 'email' | 'phone'
type CodeStep = 'verifyOld' | 'inputNew' | 'verifyNew'

const showCodeDialog = ref(false)
const codeFeature = ref<CodeFeature>('email')
const codeStep = ref<CodeStep>('inputNew')
const newAccountValue = ref('')
const oldCode = ref('')
const newCode = ref('')
const unbindToken = ref('')
const codeMsg = ref('')
const codeErr = ref('')
const sendingCode = ref(false)
const countdown = ref(0)

let countdownTimer: ReturnType<typeof setInterval> | null = null

function startCountdown(seconds = 60) {
  stopCountdown()
  countdown.value = seconds
  countdownTimer = setInterval(() => {
    countdown.value = Math.max(0, countdown.value - 1)
    if (countdown.value === 0) stopCountdown()
  }, 1000)
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

const isReassign = computed(() => (codeFeature.value === 'email'
  ? !!profile.value.email
  : !!profile.value.phone
))

const accountLabel = computed(() => (codeFeature.value === 'email' ? t('邮箱') : t('手机号')))
const oldTargetLabel = computed(() =>
  codeFeature.value === 'email'
    ? (profile.value.email ?? t('原邮箱'))
    : (maskPhone(profile.value.phone) || t('原手机号'))
)
const codeDialogTitle = computed(() =>
  isReassign.value ? t('更换') + accountLabel.value : t('绑定') + accountLabel.value
)
const codePrimaryLabel = computed(() => {
  if (codeStep.value === 'verifyOld') return submitting.value ? t('验证中…') : t('验证')
  if (codeStep.value === 'inputNew') return sendingCode.value ? t('发送中…') : t('发送验证码')
  return submitting.value ? t('提交中…') : (isReassign.value ? t('确认更换') : t('确认绑定'))
})
const canSubmitCode = computed(() => {
  if (codeStep.value === 'verifyOld') return CODE_RE.test(oldCode.value)
  if (codeStep.value === 'inputNew') return validNewValue()
  return CODE_RE.test(newCode.value)
})

const PHONE_RE = /^1[3-9]\d{9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// 验证码 6 位数字：与 PC 端及后端验证码位数一致（此前为 4-8 位，可接受后端不发的码宽）
const CODE_RE = /^\d{6}$/

function validNewValue(): boolean {
  const v = newAccountValue.value.trim()
  if (!v) return false
  return codeFeature.value === 'phone' ? PHONE_RE.test(v) : EMAIL_RE.test(v)
}

function openCodeEditor(feature: CodeFeature) {
  codeFeature.value = feature
  newAccountValue.value = ''
  oldCode.value = ''
  newCode.value = ''
  unbindToken.value = ''
  codeMsg.value = ''
  codeErr.value = ''
  countdown.value = 0
  stopCountdown()
  codeStep.value = isReassign.value ? 'verifyOld' : 'inputNew'
  showCodeDialog.value = true
}

function closeCodeDialog() {
  stopCountdown()
  countdown.value = 0
  showCodeDialog.value = false
}

/** 换绑第一步：发码到原值并验证，换取换绑令牌 */
async function sendOldCode() {
  if (sendingCode.value) return
  codeErr.value = ''
  sendingCode.value = true
  try {
    const res = codeFeature.value === 'email'
      ? await authControllerSendUnbindEmailCode()
      : await authControllerSendUnbindPhoneCode()
    unwrap(res)
    codeMsg.value = t('验证码已发送')
    startCountdown()
  } catch (e) {
    codeMsg.value = ''
    codeErr.value = errMsg(e, t('验证码发送失败'))
  } finally {
    sendingCode.value = false
  }
}

async function submitOldCode() {
  if (!CODE_RE.test(oldCode.value) || submitting.value) return
  submitting.value = true
  codeErr.value = ''
  try {
    const res = codeFeature.value === 'email'
      ? await authControllerVerifyUnbindEmailCode({ body: { code: oldCode.value } })
      : await authControllerVerifyUnbindPhoneCode({ body: { code: oldCode.value } })
    const data = unwrap<{ success?: boolean; message?: string; token?: string }>(res)
    if (!data.token) throw new Error(data.message || t('验证失败'))
    unbindToken.value = data.token
    oldCode.value = ''
    codeErr.value = ''
    codeMsg.value = t('验证通过')
    codeStep.value = 'inputNew'
  } catch (e) {
    codeErr.value = errMsg(e, t('验证失败'))
  } finally {
    submitting.value = false
  }
}

/** 发码到新值；advance=true 时发送成功后进入验证码步骤 */
async function sendNewCode(advance: boolean) {
  if (!validNewValue()) {
    codeErr.value = codeFeature.value === 'phone' ? t('请输入正确的手机号') : t('请输入正确的邮箱')
    return
  }
  if (sendingCode.value) return
  codeErr.value = ''
  sendingCode.value = true
  try {
    const res = codeFeature.value === 'email'
      ? await authControllerSendBindEmailCode({
          body: { email: newAccountValue.value.trim(), isRebind: isReassign.value },
        })
      : await authControllerSendSmsCode({
          body: { phone: newAccountValue.value.trim(), scene: 'bind' },
        })
    unwrap(res)
    codeMsg.value = t('验证码已发送')
    startCountdown()
    if (advance) codeStep.value = 'verifyNew'
  } catch (e) {
    codeMsg.value = ''
    codeErr.value = errMsg(e, t('验证码发送失败'))
  } finally {
    sendingCode.value = false
  }
}

async function submitNewCode() {
  if (!validNewValue() || !CODE_RE.test(newCode.value) || submitting.value) return
  if (isReassign.value && !unbindToken.value) {
    codeErr.value = t('请先验证原账号信息')
    return
  }
  submitting.value = true
  codeErr.value = ''
  try {
    const value = newAccountValue.value.trim()
    const res = codeFeature.value === 'email'
      ? (isReassign.value
          ? await authControllerRebindEmail({ body: { email: value, code: newCode.value, token: unbindToken.value } })
          : await authControllerVerifyBindEmail({ body: { email: value, code: newCode.value } }))
      : (isReassign.value
          ? await authControllerRebindPhone({ body: { phone: value, code: newCode.value, token: unbindToken.value } })
          : await authControllerBindPhone({ body: { phone: value, code: newCode.value } }))
    const data = unwrap<{ success?: boolean; message?: string }>(res)
    if (data.success === false) throw new Error(data.message || t('操作失败'))
    showSuccessToast(accountLabel.value + (isReassign.value ? t('已更换') : t('已绑定')))
    closeCodeDialog()
    await loadProfile()
  } catch (e) {
    codeErr.value = errMsg(e, t('操作失败'))
  } finally {
    submitting.value = false
  }
}

function onCodePrimary() {
  if (codeStep.value === 'verifyOld') return submitOldCode()
  if (codeStep.value === 'inputNew') return sendNewCode(true)
  return submitNewCode()
}

// ═══ 修改密码（D-06/D-07/D-08/D-15）═══
const showPwdDialog = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const pwdErr = ref('')

// 密码可见性切换（D-15）：Vant van-field 无内置眼睛切换，用 right-icon 手动实现
const showOldPwd = ref(false)
const showNewPwd = ref(false)
const showConfirmPwd = ref(false)
const oldPwdType = computed(() => (showOldPwd.value ? 'text' : 'password'))
const newPwdType = computed(() => (showNewPwd.value ? 'text' : 'password'))
const confirmPwdType = computed(() => (showConfirmPwd.value ? 'text' : 'password'))
function toggleVisible(target: 'old' | 'new' | 'confirm') {
  if (target === 'old') showOldPwd.value = !showOldPwd.value
  if (target === 'new') showNewPwd.value = !showNewPwd.value
  if (target === 'confirm') showConfirmPwd.value = !showConfirmPwd.value
}

// hasPassword === false：手机/微信注册用户尚未设置密码，此页是「设置」而非「修改」
const isSettingPassword = computed(() => profile.value.hasPassword === false)

const pwdTitle = computed(() => (isSettingPassword.value ? t('设置密码') : t('修改密码')))
const pwdConfirmLabel = computed(() => (submitting.value ? t('提交中…') : (isSettingPassword.value ? t('设置密码') : t('确认修改'))))
const newPwdPlaceholder = computed(() => (isSettingPassword.value ? t('至少8位，包含大小写字母和数字') : t('请输入新密码（至少 6 位）')))

// 强度打分（D-06）：与 PC usePasswordProfile.getPasswordStrength 同口径
const pwdStrength = computed(() => {
  const pwd = newPassword.value
  if (!pwd) return { score: 0, label: '', color: '' }
  let score = 0
  if (pwd.length >= 8) score++
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++
  if (/\d/.test(pwd)) score++
  if (/[^a-zA-Z0-9]/.test(pwd)) score++
  const levels = [
    { label: t('太弱'), color: '#ef4444' },
    { label: t('较弱'), color: '#f97316' },
    { label: t('一般'), color: '#eab308' },
    { label: t('较强'), color: '#22c55e' },
    { label: t('很强'), color: '#10b981' },
  ]
  const level = levels[score] ?? levels[0]!
  return { score, label: level.label, color: level.color }
})

const pwdStrengthWidth = computed(() => `${(pwdStrength.value.score / 4) * 100}%`)

// 建议清单里已完成项打勾（D-06）：让用户看到差什么，而不是只看到颜色
const pwdSuggestions = computed(() => [
  { text: t('密码长度至少 8 个字符'), ok: newPassword.value.length >= 8 },
  { text: t('包含大小写字母和数字'), ok: /[a-z]/.test(newPassword.value) && /[A-Z]/.test(newPassword.value) && /\d/.test(newPassword.value) },
  { text: t('包含特殊字符'), ok: /[^a-zA-Z0-9]/.test(newPassword.value) },
  { text: t('不要在多个网站使用相同的密码'), ok: false },
])

const canSubmitPwd = computed(() =>
  newPassword.value.length >= 6 &&
  newPassword.value === confirmPassword.value &&
  (!isSettingPassword.value ? oldPassword.value.length > 0 : true)
)

function openPwdDialog() {
  oldPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  pwdErr.value = ''
  showOldPwd.value = false
  showNewPwd.value = false
  showConfirmPwd.value = false
  showPwdDialog.value = true
}

/** 改密后用新密码重新登录，保持会话不中断（D-08） */
async function reloginWithNewPassword(): Promise<boolean> {
  const account = profile.value.username ?? profile.value.email ?? ''
  if (!account) return false
  try {
    const res = await authControllerLogin({ body: { account, password: newPassword.value } })
    const data = unwrap<Record<string, unknown>>(res)
    const accessToken = data.accessToken ?? data.access_token
    if (!accessToken) return false
    localStorage.setItem('accessToken', String(accessToken))
    const refreshToken = data.refreshToken ?? data.refresh_token
    if (refreshToken) localStorage.setItem('refreshToken', String(refreshToken))
    if (data.user) localStorage.setItem('user', JSON.stringify(data.user))
    setAuthenticated()
    return true
  } catch (e) {
    console.error('[Profile] relogin after password change:', e)
    return false
  }
}

async function onChangePassword() {
  if (!canSubmitPwd.value || submitting.value) return
  submitting.value = true
  pwdErr.value = ''
  try {
    unwrap(await usersControllerChangePassword({
      body: {
        oldPassword: isSettingPassword.value ? undefined : oldPassword.value,
        newPassword: newPassword.value,
      },
    }))
    showPwdDialog.value = false

    // 改密后旧凭证可能已失效：用新密码重新登录换取新 token
    const relogged = await reloginWithNewPassword()
    if (relogged) {
      showSuccessToast(isSettingPassword.value ? t('密码已设置成功') : t('密码已修改成功'))
      await loadProfile()
      return
    }

    // 重登失败：先告知，再清凭证回 guest 态——登录引导弹窗会接着提示用新密码登录
    await showDialog({
      title: t('需要重新登录'),
      message: t('密码已修改成功，请使用新密码登录。'),
    })
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    setGuest()
  } catch (e) {
    pwdErr.value = errMsg(e, t('修改失败'))
  } finally {
    submitting.value = false
  }
}

// ═══ 入口分发 ═══
// 邮箱/手机已绑定时给「更换/解绑」两选项（ActionSheet 是移动端多选入口的标准形态）；
// 未绑定时只有一个动作，直接进弹窗，不多加一层选择
const showAccountSheet = ref(false)
const accountSheetFeature = ref<CodeFeature>('email')

function isAccountBound(feature: CodeFeature): boolean {
  return feature === 'email' ? !!profile.value.email : !!profile.value.phone
}

const accountSheetTitle = computed(() => (accountSheetFeature.value === 'email' ? t('邮箱') : t('手机号')))

const accountSheetActions = computed(() =>
  isAccountBound(accountSheetFeature.value)
    ? [
        { key: 'reassign', name: t('更换') },
        { key: 'unbind', name: t('解绑'), color: '#ff4444' },
      ]
    : [{ key: 'bind', name: t('绑定') }]
)

function openAccountSheet(feature: CodeFeature) {
  accountSheetFeature.value = feature
  showAccountSheet.value = true
}

function onAccountSheetSelect(action: { key?: string }) {
  showAccountSheet.value = false
  if (action.key === 'unbind') return openUnbind(accountSheetFeature.value)
  openCodeEditor(accountSheetFeature.value)
}

function onAccountClick(action: string) {
  if (action === 'edit-username' || action === 'edit-nickname') {
    openTextEdit(action === 'edit-username' ? 'username' : 'nickname')
  } else if (action === 'edit-phone') {
    openAccountSheet('phone')
  } else if (action === 'edit-email') {
    openAccountSheet('email')
  }
}

function onSecurityClick(action: string) {
  if (action === 'change-password') openPwdDialog()
}

// 忘记密码 / 会员购买：涉及支付与认证，走 PC 页（ADR-0062）；弹窗被拦截时回退整页跳转
function openPCPage(url: string) {
  const win = window.open(url)
  if (!win) window.location.href = url
}

// ═══ 头像上传（D-01）═══
const AVATAR_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const avatarInputRef = ref<HTMLInputElement | null>(null)
const uploadingAvatar = ref(false)
// 头像 URL 加载失败（过期签名/服务不可达）→ 回落到首字母占位
const avatarImgFailed = ref(false)

function pickAvatar() {
  avatarInputRef.value?.click()
}

async function onAvatarChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    showFailToast(t('仅支持 PNG、JPEG、GIF、WebP 格式的图片'))
    return
  }
  if (file.size > AVATAR_MAX_BYTES) {
    showFailToast(t('头像文件大小不能超过 5MB'))
    return
  }
  uploadingAvatar.value = true
  try {
    unwrap(await usersControllerUploadAvatar({ body: { file } as never }))
    showSuccessToast(t('头像更新成功'))
    await loadProfile()
  } catch (e) {
    showFailToast(errMsg(e, t('头像上传失败')))
  } finally {
    uploadingAvatar.value = false
  }
}

// ═══ 解绑邮箱 / 手机号（D-05）═══
// 流程与换绑第一步相同（发码到原值 → 输码），但校验通过后直接解绑、不换新值。
// 后端要求账号至少保留一种登录方式（密码/手机/微信），违规由后端 400 兜底。
const showUnbindDialog = ref(false)
const unbindFeature = ref<CodeFeature>('email')
const unbindCode = ref('')
const unbindMsg = ref('')
const unbindErr = ref('')

const unbindTitle = computed(() => (unbindFeature.value === 'email' ? t('解绑邮箱') : t('解绑手机号')))
const unbindTargetLabel = computed(() =>
  unbindFeature.value === 'email' ? (profile.value.email ?? t('原邮箱')) : (maskPhone(profile.value.phone) || t('原手机号'))
)
const canSubmitUnbind = computed(() => CODE_RE.test(unbindCode.value))

function openUnbind(feature: CodeFeature) {
  unbindFeature.value = feature
  unbindCode.value = ''
  unbindMsg.value = ''
  unbindErr.value = ''
  countdown.value = 0
  stopCountdown()
  showUnbindDialog.value = true
}

async function sendUnbindCode() {
  if (sendingCode.value) return
  unbindErr.value = ''
  sendingCode.value = true
  try {
    const res = unbindFeature.value === 'email'
      ? await authControllerSendUnbindEmailCode()
      : await authControllerSendUnbindPhoneCode()
    unwrap(res)
    unbindMsg.value = t('验证码已发送')
    startCountdown()
  } catch (e) {
    unbindMsg.value = ''
    unbindErr.value = errMsg(e, t('验证码发送失败'))
  } finally {
    sendingCode.value = false
  }
}

async function confirmUnbind() {
  if (!canSubmitUnbind.value || submitting.value) return
  submitting.value = true
  unbindErr.value = ''
  try {
    const res = unbindFeature.value === 'email'
      ? await authControllerUnbindEmail({ body: { code: unbindCode.value } })
      : await authControllerUnbindPhone({ body: { code: unbindCode.value } })
    const data = unwrap<{ success?: boolean; message?: string }>(res)
    if (data.success === false) throw new Error(data.message || t('解绑失败'))
    showSuccessToast(t('已解绑'))
    closeUnbindDialog()
    await loadProfile()
  } catch (e) {
    unbindErr.value = errMsg(e, t('解绑失败'))
  } finally {
    submitting.value = false
  }
}

function closeUnbindDialog() {
  stopCountdown()
  countdown.value = 0
  showUnbindDialog.value = false
}

async function onLogout() {
  try {
    await showDialog({
      title: t('退出登录'),
      message: t('确定要退出当前账号吗？'),
      showCancelButton: true,
      confirmButtonText: t('退出登录'),
      cancelButtonText: t('取消'),
    })
  } catch {
    return
  }

  try {
    unwrap(await authControllerLogout())
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    setGuest()
    navigateToLogin()
  } catch (e) {
    console.error('[Profile] logout error:', e)
    showFailToast(t('退出失败，请重试'))
  }
}

// 未登录引导：guest/token_expired 态自动跳原生登录页（同 tab 带 redirect 回跳）；登录完成后加载资料
useLoginPrompt(() => {
  void loadProfile()
  void loadStats()
})
onUnmounted(stopCountdown)
</script>

<template>
  <div class="subpage">
    <van-nav-bar :title="t('个人中心')" left-arrow @click-left="() => router.back()" />

    <div v-if="loading && !profile.username" class="loading-state">
      <van-loading size="32" />
    </div>

    <div v-else-if="error" class="error-state">
      <span class="error-text">{{ error }}</span>
      <van-button size="small" round @click="loadProfile">{{ t('重试') }}</van-button>
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
          <span v-else class="avatar-text">{{ avatarInitial(displayName(profile)) }}</span>
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
            <span v-if="isVip && vipBadge" class="vip-badge">{{ vipBadge }}</span>
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
        <span>{{ t('会员即将到期，剩余 {days} 天，请及时续费', { days: String(vipDaysRemaining) }) }}</span>
      </div>

      <!-- ═══ 会员（D-10）：购买/续费在 PC 会员中心完成 ═══ -->
      <van-cell-group class="section">
        <div class="section-title">{{ t('会员') }}</div>
        <van-cell
          :title="t('管理会员')"
          :value="isVip && vipBadge ? vipBadge : t('免费用户')"
          is-link
          @click="openPCPage(getPCMemberCenterUrl())"
        />
      </van-cell-group>

      <!-- ═══ 存储空间（D-12）═══ -->
      <van-cell-group v-if="storageInfo" class="section">
        <div class="section-title">{{ t('存储空间') }}</div>
        <div class="storage-box">
          <div class="storage-line">
            <span>{{ t('已用 {size}', { size: formatSize(storageInfo.used) }) }}</span>
            <span>{{ t('总计 {size}', { size: formatSize(storageInfo.total) }) }}</span>
          </div>
          <div class="storage-track">
            <div class="storage-fill" :style="{ width: (storagePercent ?? 0) + '%', background: storageColor }" />
          </div>
          <div class="storage-line below">
            <span>{{ t('剩余 {size}', { size: formatSize(storageInfo.remaining) }) }}</span>
            <span>{{ t('使用率 {pct}%', { pct: (storagePercent ?? 0).toFixed(1) }) }}</span>
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
            <van-icon v-if="item.verified" name="passed" class="verified-mark" />
          </template>
        </van-cell>
      </van-cell-group>

      <!-- ═══ 账号详情（D-02）═══ -->
      <van-cell-group class="section">
        <div class="section-title">{{ t('账号详情') }}</div>
        <van-cell :title="t('账户角色')">
          <template #value><span class="meta-tag">{{ roleLabel }}</span></template>
        </van-cell>
        <van-cell :title="t('账户状态')">
          <template #value>
            <span class="meta-tag" :class="'meta-' + statusTone">{{ statusLabel }}</span>
          </template>
        </van-cell>
        <van-cell v-if="createdAtText" :title="t('创建时间')" :value="createdAtText" />
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
        <van-cell :title="t('忘记密码？')" is-link @click="openPCPage(getPCForgotPasswordUrl())" />
      </van-cell-group>

      <!-- ═══ 退出登录 ═══ -->
      <button class="logout-btn" @click="onLogout">{{ t('退出登录') }}</button>
    </div>

    <!-- ═══ 用户名 / 昵称编辑 ═══ -->
    <van-popup v-model:show="showTextDialog" position="bottom" round :style="{ height: '42%' }">
      <div class="form-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showTextDialog = false">{{ t('取消') }}</button>
          <span class="panel-title">{{ editField === 'username' ? t('修改用户名') : t('修改昵称') }}</span>
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
          <p v-if="editField === 'username'" class="field-tip">{{ t('用户名每月最多修改 3 次') }}</p>
        </div>
        <button class="primary-btn" :disabled="!canSubmitText || submitting" @click="onTextConfirm">
          {{ submitting ? t('保存中…') : t('保存') }}
        </button>
      </div>
    </van-popup>

    <!-- ═══ 邮箱 / 手机号 验证码 ═══ -->
    <van-popup v-model:show="showCodeDialog" position="bottom" round :style="{ height: '56%' }">
      <div class="form-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="closeCodeDialog">{{ t('取消') }}</button>
          <span class="panel-title">{{ codeDialogTitle }}</span>
          <span class="panel-spacer"></span>
        </div>
        <div class="panel-body">
          <template v-if="codeStep === 'verifyOld'">
            <p class="field-hint">
              {{ t('验证码已发送至') }}{{ oldTargetLabel }}
            </p>
            <van-field v-model="oldCode" type="digit" maxlength="6" :placeholder="t('请输入验证码')" clearable />
            <button class="resend-btn" :disabled="countdown > 0 || sendingCode" @click="sendOldCode">
              {{ countdown > 0 ? `${t('重新发送')}（${countdown}s）` : t('发送验证码') }}
            </button>
          </template>

          <template v-else>
            <van-field
              v-model="newAccountValue"
              :type="codeFeature === 'phone' ? 'tel' : 'text'"
              :maxlength="codeFeature === 'phone' ? 11 : 100"
              :placeholder="codeFeature === 'phone' ? t('请输入新的手机号') : t('请输入新的邮箱地址')"
              :disabled="codeStep === 'verifyNew'"
              clearable
            />
            <template v-if="codeStep === 'verifyNew'">
              <van-field v-model="newCode" type="digit" maxlength="6" :placeholder="t('请输入验证码')" clearable />
              <button class="resend-btn" :disabled="countdown > 0 || sendingCode" @click="sendNewCode(false)">
                {{ countdown > 0 ? `${t('重新发送')}（${countdown}s）` : t('重新发送验证码') }}
              </button>
            </template>
          </template>

          <div v-if="codeErr" class="field-error">{{ codeErr }}</div>
          <div v-else-if="codeMsg" class="field-tip">{{ codeMsg }}</div>
        </div>
        <button class="primary-btn" :disabled="!canSubmitCode || sendingCode || submitting" @click="onCodePrimary">
          {{ codePrimaryLabel }}
        </button>
      </div>
    </van-popup>

    <!-- ═══ 修改 / 设置密码（D-06/D-07/D-15）═══ -->
    <van-popup v-model:show="showPwdDialog" position="bottom" round :style="{ height: '76%' }">
      <div class="form-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showPwdDialog = false">{{ t('取消') }}</button>
          <span class="panel-title">{{ pwdTitle }}</span>
          <span class="panel-spacer"></span>
        </div>
        <div class="panel-body">
          <p v-if="isSettingPassword" class="pwd-hint">
            {{ t('您的账户是通过手机号或微信自动创建的，尚未设置密码。设置密码后可使用账号密码登录。') }}
          </p>

          <van-field
            v-if="!isSettingPassword"
            v-model="oldPassword"
            :type="oldPwdType"
            :placeholder="t('请输入当前密码')"
            clearable
          >
            <template #right-icon>
              <van-icon :name="showOldPwd ? 'eye' : 'eye-o'" @click="toggleVisible('old')" />
            </template>
          </van-field>

          <van-field
            v-model="newPassword"
            :type="newPwdType"
            :placeholder="newPwdPlaceholder"
            clearable
          >
            <template #right-icon>
              <van-icon :name="showNewPwd ? 'eye' : 'eye-o'" @click="toggleVisible('new')" />
            </template>
          </van-field>

          <div v-if="newPassword" class="pwd-strength">
            <div class="strength-bar">
              <div class="strength-fill" :style="{ width: pwdStrengthWidth, background: pwdStrength.color }" />
            </div>
            <span class="strength-label" :style="{ color: pwdStrength.color }">{{ pwdStrength.label }}</span>
          </div>

          <van-field
            v-model="confirmPassword"
            :type="confirmPwdType"
            :placeholder="t('请再次输入新密码')"
            clearable
          >
            <template #right-icon>
              <van-icon :name="showConfirmPwd ? 'eye' : 'eye-o'" @click="toggleVisible('confirm')" />
            </template>
          </van-field>

          <div v-if="pwdErr" class="field-error">{{ pwdErr }}</div>

          <div v-if="newPassword" class="pwd-tips">
            <div class="tips-title">{{ t('安全建议') }}</div>
            <div v-for="(tip, i) in pwdSuggestions" :key="i" class="tips-item">
              <van-icon :name="tip.ok ? 'passed' : 'info-o'" class="tips-icon" :class="{ ok: tip.ok }" />
              <span>{{ tip.text }}</span>
            </div>
          </div>
        </div>
        <button class="primary-btn" :disabled="!canSubmitPwd || submitting" @click="onChangePassword">
          {{ pwdConfirmLabel }}
        </button>
      </div>
    </van-popup>

    <!-- ═══ 解绑邮箱 / 手机号（D-05）═══ -->
    <van-popup v-model:show="showUnbindDialog" position="bottom" round :style="{ height: '46%' }">
      <div class="form-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="closeUnbindDialog">{{ t('取消') }}</button>
          <span class="panel-title">{{ unbindTitle }}</span>
          <span class="panel-spacer"></span>
        </div>
        <div class="panel-body">
          <p class="field-hint">
            {{ t('验证码将发送至') }}{{ unbindTargetLabel }}
          </p>
          <van-field v-model="unbindCode" type="digit" maxlength="6" :placeholder="t('请输入验证码')" clearable />
          <button class="resend-btn" :disabled="countdown > 0 || sendingCode" @click="sendUnbindCode">
            {{ countdown > 0 ? `${t('重新发送')}（${countdown}s）` : t('发送验证码') }}
          </button>
          <p class="field-tip">{{ t('解绑后将无法通过该账号登录，账号至少需要保留一种登录方式。') }}</p>
          <div v-if="unbindErr" class="field-error">{{ unbindErr }}</div>
          <div v-else-if="unbindMsg" class="field-tip">{{ unbindMsg }}</div>
        </div>
        <button class="primary-btn danger" :disabled="!canSubmitUnbind || sendingCode || submitting" @click="confirmUnbind">
          {{ submitting ? t('提交中…') : t('确认解绑') }}
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
  transition: width 0.25s ease, background 0.25s ease;
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
