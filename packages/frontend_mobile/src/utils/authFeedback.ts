/**
 * 认证表单反馈：toast 与账号状态弹窗。
 *
 * 解包/归一能力（toError / unwrap / errMsg / errorCode / errorDetail）的
 * **唯一实现是 ./apiError** —— 它们历史上就住在本文件里，正因文件名叫
 * 「认证反馈」，ProfilePage 与 useMemberCenter 都找不到而各自抄了一份，
 * 并抄出语义分叉（见 apiError.ts 头注）。现已迁出，本文件只做两件事：
 * 承载依赖 vant 的 UI 反馈，并为既有的 8 个 auth 侧消费者保留兼容再导出。
 */
import { showDialog, showToast } from 'vant'
import 'vant/es/dialog/style'
import 'vant/es/toast/style'
import { t } from '@/languages'
import { useRuntimeConfig } from '@/composables/useRuntimeConfig'
import { errMsg } from './apiError'

// 兼容再导出：历史消费者（LoginPage / RegisterPage / useWechatLogin 等）仍从
// 本文件取这三个符号。新增消费者请直接 import { ... } from '@/utils/apiError'，
// 本行随这些消费者的迁移一起删除。
export { toError, unwrap, errMsg, errorCode, errorDetail } from './apiError'
export type { ApiErrorBody, ApiError } from './apiError'

/** toast 提示错误文案（字符串错误直接展示，不做无意义包装） */
export function showError(e: unknown, fallback: string): void {
  if (typeof e === 'string') {
    showToast(e)
    return
  }
  showToast(errMsg(e, fallback))
}

/**
 * ACCOUNT_DEACTIVATED 弹窗（与 PC SupportModal variant=deactivated 同口径）：
 * 注销冷静期已过 → 弹客服信息告知「联系客服恢复 + 数据 N 天后彻底删除」。
 * cleanupDays 取自错误体，缺省 30。客服联系方式读运行时配置，缺省回退硬编码兜底值。
 */
export function showAccountDeactivatedDialog(cleanupDays?: number): void {
  const days = typeof cleanupDays === 'number' && Number.isFinite(cleanupDays) ? cleanupDays : 30
  const { config } = useRuntimeConfig()
  const supportEmail = config.value.supportEmail || 'support@cloudcad.com'
  const supportPhone = config.value.supportPhone || '400-123-4567'

  const contactItem = (label: string, value: string, href: string) => `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
      <span style="color:var(--text-tertiary);min-width:6em">${label}</span>
      <a href="${href}" style="color:var(--primary);word-break:break-all">${value}</a>
    </div>`

  showDialog({
    title: t('账号已注销'),
    messageAlign: 'left',
    message: `
      <p style="color:var(--text-secondary);line-height:1.7">
        ${t('您的账号已注销且已过冷静期，请联系客服恢复账户。')}<br />
        ${t('数据将在')}
        <strong style="color:var(--danger)">${days}</strong>
        ${t('天后彻底删除，逾期无法恢复。')}
      </p>
      <div style="margin-top:14px">
        ${contactItem(t('客服邮箱：'), supportEmail, `mailto:${supportEmail}`)}
        ${contactItem(t('客服电话：'), supportPhone, `tel:${supportPhone}`)}
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
          <span style="color:var(--text-tertiary);min-width:6em">${t('工作时间：')}</span>
          <span style="color:var(--text-secondary)">${t('周一至周五 9:00-18:00')}</span>
        </div>
      </div>`,
    confirmButtonText: t('我知道了'),
  })
}
