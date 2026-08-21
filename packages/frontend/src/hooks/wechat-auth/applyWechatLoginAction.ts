import {
  setAccessToken,
  setRefreshToken,
  setWechatTempToken,
} from '@/utils/tokenUtils';
import { triggerProactiveRefresh } from '@/config/clientSetup';
import { authControllerGetProfile } from '@/api-sdk';
import { t } from '@/languages';
import type { WechatAuthAction } from '@/utils/wechat-auth-result';

export interface WechatLoginActionHandlers {
  /** 错误通知（文案是否带前缀由调用方 errorPrefix 决定） */
  onError: (message: string) => void;
  /** 登录成功通知（token 写入后立即调用 user=null；profile 拉取成功后再次调用） */
  onLoginSuccess: (user: unknown, accessToken: string) => void;
  /** 需要跳转（need_register/bind_email/bind_phone），SPA navigate 或整页跳转 */
  redirect: (path: string, options?: { state?: unknown }) => void;
}

export interface ApplyWechatLoginActionOptions {
  /** error 文案前缀（如 t('微信登录失败')）；不传则无前缀（弹窗/storage 路径，还原旧 AuthContext 行为） */
  errorPrefix?: string;
  /** 是否写入 refreshToken；txn 路径按旧 Login 行为条件写入（writeRefreshToken = !!refreshToken） */
  writeRefreshToken: boolean;
  /** need_register 时是否携带"自动注册失败"提示（Login 页 wechatAutoRegister） */
  wechatAutoRegister: boolean;
}

/**
 * login purpose 结果统一应用（hash / 事务轮询 / 弹窗 storage 共用）。
 * 写 token → 通知（onLoginSuccess(null)）→ 主动刷新 → profile 拉取（失败重试一次）
 * → 再次通知（onLoginSuccess(user)）。
 */
export function applyWechatLoginAction(
  action: WechatAuthAction,
  handlers: WechatLoginActionHandlers,
  options: ApplyWechatLoginActionOptions
): void {
  if (!action) return;
  const { errorPrefix, writeRefreshToken, wechatAutoRegister } = options;

  if (action.type === 'error') {
    handlers.onError(
      errorPrefix ? `${errorPrefix}：${action.message}` : action.message
    );
    return;
  }

  if (action.type === 'login') {
    setAccessToken(action.accessToken);
    if (writeRefreshToken) setRefreshToken(action.refreshToken);
    if (action.user) localStorage.setItem('user', JSON.stringify(action.user));
    handlers.onLoginSuccess(null, action.accessToken);
    triggerProactiveRefresh();
    // 回调 URL 不再携带 user，登录后从 profile 拉取；失败重试一次
    const fetchProfile = (retry = true) => {
      authControllerGetProfile()
        .then((res) => {
          if (res.data) {
            const userData = res.data;
            localStorage.setItem('user', JSON.stringify(userData));
            handlers.onLoginSuccess(userData, action.accessToken);
          }
        })
        .catch((err) => {
          console.error('[useWechatAuth] 微信登录后获取用户信息失败:', err);
          if (retry) {
            setTimeout(() => fetchProfile(false), 1500);
          } else if (action.user) {
            // 兜底：回调/事务携带 user 时，profile 连续失败 2 次后用该 user 完成登录
            // （对齐旧行为——旧 txn 带 user 场景可完成登录，不因 profile 不可用而卡死）
            handlers.onLoginSuccess(action.user, action.accessToken);
          } else {
            // 兜底：hash/弹窗路径 action.user 恒为 undefined（回调不携带 user），
            // profile 连续失败 2 次后以空 user 对象完成登录跳转（与 txn 路径同构，
            // 不依赖 user 数据）；页面跳转后由后续刷新/查询恢复用户数据，避免卡在登录页
            handlers.onLoginSuccess({}, action.accessToken);
          }
        });
    };
    fetchProfile();
    return;
  }

  if (action.type === 'need_register') {
    setWechatTempToken(action.tempToken);
    handlers.redirect(
      '/register?wechat=1',
      wechatAutoRegister
        ? { state: { message: t('微信自动注册失败，请手动完成注册') } }
        : undefined
    );
    return;
  }

  if (action.type === 'bind_email') {
    setWechatTempToken(action.tempToken);
    handlers.redirect('/verify-email', {
      state: { tempToken: action.tempToken, mode: 'bind' },
    });
    return;
  }

  if (action.type === 'bind_phone') {
    setWechatTempToken(action.tempToken);
    handlers.redirect('/verify-phone', {
      state: { tempToken: action.tempToken, mode: 'bind' },
    });
  }
}
