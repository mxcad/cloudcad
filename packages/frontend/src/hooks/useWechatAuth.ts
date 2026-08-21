import { useEffect, useCallback, useRef } from 'react';
import { authControllerGetWechatAuthUrl } from '@/api-sdk';
import { classifyWechatAuthResult } from '@/utils/wechat-auth-result';
import { setWechatTempToken } from '@/utils/tokenUtils';
import { isMobile as isMobileDevice } from 'react-device-detect';
import { t } from '@/languages';
import {
  parseWechatHash,
  pollWechatTransaction,
  watchWechatStorage,
  applyWechatLoginAction,
  WECHAT_POLL_INTERVAL_MS,
  WECHAT_POLL_MAX_ATTEMPTS,
  WECHAT_STORAGE_POLL_INTERVAL_MS,
  WECHAT_STORAGE_POLL_MAX_ATTEMPTS,
  type WechatLoginActionHandlers,
} from './wechat-auth';

// 行为对照清单常量（公共 API，spec 依赖）
export {
  WECHAT_POLL_INTERVAL_MS,
  WECHAT_POLL_MAX_ATTEMPTS,
  WECHAT_STORAGE_POLL_INTERVAL_MS,
  WECHAT_STORAGE_POLL_MAX_ATTEMPTS,
} from './wechat-auth';

const WECHAT_RESULT_STORAGE_KEY = 'wechat_auth_result';

export type WechatPurpose = 'login' | 'bind' | 'deactivate';

export interface WechatAuthOptions {
  /** 授权用途：login（登录，AuthContext 全局实例持有）| bind（Profile 绑定）| deactivate（解绑） */
  purpose?: WechatPurpose;
  /** bind/deactivate 专用：授权成功回调（code/state 或 accessToken） */
  onSuccess?: (data: {
    code?: string;
    state?: string;
    accessToken?: string;
    refreshToken?: string;
    user?: unknown;
    needRegister?: boolean;
    tempToken?: string;
    error?: string;
  }) => void;
  /** 错误回调（login: AuthContext context error / Login form.setError） */
  onError?: (error: string) => void;
  /**
   * login 专用：登录成功回调。token 已写入 localStorage 后立即调用（user 为 null），
   * profile 拉取成功后再次调用（user 为用户信息）。
   */
  onLoginSuccess?: (user: unknown, accessToken: string) => void;
  /** login 专用：need_register 时是否携带"自动注册失败"提示（Login 页） */
  wechatAutoRegister?: boolean;
  /** login 专用：跳转函数（Login 页传 react-router navigate），默认 window.location.href 赋值 */
  navigateTo?: (path: string, options?: { state?: unknown }) => void;
  /** login 专用：注销冷静期内自动恢复成功回调（前端提示「账户已自动恢复」） */
  onRestored?: () => void;
  /** login 专用：注销冷静期已过回调（前端弹客服框，参数为数据彻底删除延迟天数） */
  onDeactivated?: (cleanupDays: number) => void;
}

export interface WechatAuthResult {
  open: () => Promise<void>;
}

/**
 * 微信授权唯一入口（T4 架构切片合并产物）
 *
 * 单一处理实例约定：login purpose 实例由 AuthContext（Provider）持有——
 * 它持有 setToken/setUser 是登录态权威；Login 页不注册独立实例，仅通过
 * AuthContext 暴露的方法触发登录并注入页面级回调（navigate/setError/
 * wechatAutoRegister）。bind/deactivate 由 Profile 页按 purpose 参数分流，
 * 走独立实例路径，不被全局 login 实例拦截。
 *
 * - purpose='login'：合并 AuthContext 弹窗轮询（storage 事件 + 500ms 兜底轮询，
 *   以 AuthContext 为主逻辑）+ Login 页 hash 解析 + 事务轮询（2s × 60 次）。
 *   行为对照清单（全部保持）：轮询间隔 2s、超时 60 次、hash 解析字段
 *   wechat_result、handledKeys 去重、弹窗关闭逻辑、wechatTempToken 读写、
 *   弹窗 error 无"微信登录失败："前缀、txn refreshToken 条件写入。
 * - purpose='bind'/'deactivate'：Profile 页微信绑定/解绑（hash 解析 + 事务轮询 + open）
 */
export function useWechatAuth(options: WechatAuthOptions): WechatAuthResult {
  const {
    purpose = 'login',
    onSuccess,
    onError,
    onLoginSuccess,
    wechatAutoRegister,
    navigateTo,
    onRestored,
    onDeactivated,
  } = options;
  const isLogin = purpose === 'login';
  const loadingRef = useRef(false);
  const processedRef = useRef(false);
  // 实例级去重缓存（模块级 Set 随应用生命周期累积泄漏；消费完成即清理）。
  // 双实例修复后 login 实例唯一，跨实例共享缓存不再需要。
  const processedResultRef = useRef(new Set<string>());
  const processedTxnRef = useRef(new Set<string>());
  // 回调经 ref 读取：回调引用变化不重启监听 effect（页面级回调动态注册/注销）
  const handlersRef = useRef({
    onSuccess,
    onError,
    onLoginSuccess,
    wechatAutoRegister,
    navigateTo,
    onRestored,
    onDeactivated,
  });
  handlersRef.current = {
    onSuccess,
    onError,
    onLoginSuccess,
    wechatAutoRegister,
    navigateTo,
    onRestored,
    onDeactivated,
  };

  // ── login 专用：登录结果处理（AuthContext 全局实例）────────────────
  useEffect(() => {
    if (!isLogin) return;
    let cancelled = false;
    const h = () => handlersRef.current;

    const redirect = (path: string, opts?: { state?: unknown }) => {
      const navigateTo = h().navigateTo;
      if (navigateTo) navigateTo(path, opts);
      else window.location.href = path;
    };

    const loginHandlers: WechatLoginActionHandlers = {
      onError: (msg) => h().onError?.(msg),
      onLoginSuccess: (user, accessToken) =>
        h().onLoginSuccess?.(user, accessToken),
      redirect,
    };

    // 1. 微信登录回调 Hash 解析（桌面端 EXE 非弹窗模式 / 弹窗自身）
    parseWechatHash({
      hash: window.location.hash,
      onPopup: (result) => {
        // 弹窗自身：写入 localStorage 供主窗口通过 storage 事件接收，然后关闭
        localStorage.setItem(WECHAT_RESULT_STORAGE_KEY, JSON.stringify(result));
        window.close();
      },
      onResult: (result) => {
        // hash 路径 error 带"微信登录失败："前缀（还原旧 Login 行为）
        const raw = JSON.stringify(result);
        if (processedResultRef.current.has(raw)) return;
        processedResultRef.current.add(raw);
        try {
          applyWechatLoginAction(
            classifyWechatAuthResult(result),
            loginHandlers,
            {
              errorPrefix: t('微信登录失败'),
              writeRefreshToken: true,
              wechatAutoRegister: h().wechatAutoRegister ?? false,
            }
          );
        } finally {
          processedResultRef.current.delete(raw);
        }
      },
    });

    // 2. 事务轮询（桌面端 C++ WebView / 手机浏览器回调）
    const params = new URLSearchParams(window.location.search);
    const wechatTxn = params.get('wechat_txn');
    const wechatError = params.get('wechat_error');
    if (wechatTxn) {
      window.history.replaceState(null, '', window.location.pathname);

      if (wechatError) {
        h().onError?.(
          `${t('微信登录失败')}：${decodeURIComponent(wechatError)}`
        );
      } else {
        pollWechatTransaction({
          txn: wechatTxn,
          intervalMs: WECHAT_POLL_INTERVAL_MS,
          maxAttempts: WECHAT_POLL_MAX_ATTEMPTS,
          isCancelled: () =>
            cancelled || processedTxnRef.current.has(wechatTxn),
          onComplete: (result) => {
            if (result.error) {
              if (result.errorCode === 'ACCOUNT_DEACTIVATED') {
                // 注销冷静期已过：弹客服信息弹框（联系客服恢复 + 数据彻底删除告知）
                h().onDeactivated?.(result.cleanupDays ?? 30);
              } else {
                h().onError?.(`${t('微信登录失败')}：${result.error}`);
              }
              return 'consumed';
            }
            if (result.action === 'login' && result.accessToken) {
              processedTxnRef.current.add(wechatTxn);
              try {
                applyWechatLoginAction(
                  {
                    type: 'login',
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken || '',
                    user: result.user,
                  },
                  loginHandlers,
                  {
                    errorPrefix: t('微信登录失败'),
                    // 还原旧 Login txn 行为：refreshToken 存在才写入
                    writeRefreshToken: !!result.refreshToken,
                    wechatAutoRegister: h().wechatAutoRegister ?? false,
                  }
                );
                // 注销冷静期内登录自动恢复：提示「账户已自动恢复，注销已取消」
                if (result.restored) h().onRestored?.();
              } finally {
                processedTxnRef.current.delete(wechatTxn);
              }
              return 'consumed';
            }
            if (result.action === 'need_register' && result.tempToken) {
              setWechatTempToken(result.tempToken);
              window.location.href = '/register?wechat=1';
              return 'consumed';
            }
            if (result.action === 'bind_email' && result.tempToken) {
              setWechatTempToken(result.tempToken);
              window.location.href = '/verify-email';
              return 'consumed';
            }
            if (result.action === 'bind_phone' && result.tempToken) {
              setWechatTempToken(result.tempToken);
              window.location.href = '/verify-phone';
              return 'consumed';
            }
            // purpose 分流：completed 但非 login 流程 action（bind/deactivate 等事务）
            // 静默忽略，不被全局 login 实例误判为"微信登录失败"
            return 'consumed';
          },
          onTimeout: () => {
            if (!cancelled) h().onError?.(t('微信登录超时，请重试'));
          },
        });
      }
    }

    // 3. 弹窗结果监听（storage 事件 + 兜底轮询）
    // 弹窗 error 无"微信登录失败："前缀（还原旧 AuthContext setError(action.message)）
    const cleanupStorage = watchWechatStorage({
      storageKey: WECHAT_RESULT_STORAGE_KEY,
      intervalMs: WECHAT_STORAGE_POLL_INTERVAL_MS,
      maxAttempts: WECHAT_STORAGE_POLL_MAX_ATTEMPTS,
      isCancelled: () => cancelled,
      onResult: (raw) => {
        if (processedResultRef.current.has(raw)) return;
        processedResultRef.current.add(raw);
        try {
          applyWechatLoginAction(
            classifyWechatAuthResult(JSON.parse(raw)),
            loginHandlers,
            {
              writeRefreshToken: true,
              wechatAutoRegister: h().wechatAutoRegister ?? false,
            }
          );
        } catch (err) {
          console.error('解析微信登录结果失败', err);
        } finally {
          processedResultRef.current.delete(raw);
        }
      },
    });

    return () => {
      cancelled = true;
      cleanupStorage();
    };
  }, [isLogin]);

  // ── bind / deactivate 专用：Profile 页微信绑定/解绑 ────
  useEffect(() => {
    if (isLogin) return;
    let cancelled = false;
    const h = () => handlersRef.current;

    const checkHashResult = () => {
      if (processedRef.current) return;
      const hash = window.location.hash;
      if (!hash.includes('wechat_result')) return;
      try {
        const hashValue = hash.split('wechat_result=')[1];
        if (!hashValue) return;
        const result = JSON.parse(decodeURIComponent(hashValue));

        if (result.purpose !== purpose) return;

        processedRef.current = true;
        window.history.replaceState(null, '', window.location.pathname);

        if (result.error) {
          h().onError?.(result.error);
        } else if (result.code || result.accessToken) {
          h().onSuccess?.(result);
        }
      } catch (e) {
        console.error('解析微信授权结果失败', e);
      }
    };

    checkHashResult();

    const params = new URLSearchParams(window.location.search);
    const wechatTxn = params.get('wechat_txn');
    const wechatError = params.get('wechat_error');
    if (wechatTxn) {
      window.history.replaceState(null, '', window.location.pathname);
      if (wechatError) {
        h().onError?.(decodeURIComponent(wechatError));
        return;
      }
      const cancel = pollWechatTransaction({
        txn: wechatTxn,
        intervalMs: WECHAT_POLL_INTERVAL_MS,
        maxAttempts: WECHAT_POLL_MAX_ATTEMPTS,
        isCancelled: () => cancelled,
        onComplete: (result) => {
          if (result.status !== 'completed') return 'ignored';
          if (result.error) {
            h().onError?.(result.error);
            return 'consumed';
          }
          h().onSuccess?.({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            user: result.user,
            tempToken: result.tempToken,
            needRegister: result.action === 'need_register',
          });
          return 'consumed';
        },
        onTimeout: () => {
          if (!cancelled) h().onError?.(t('请求超时'));
        },
      });
      return () => {
        cancelled = true;
        cancel();
      };
    }

    const handleHashChange = () => checkHashResult();
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [isLogin, purpose]);

  const open = useCallback(async () => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    processedRef.current = false;
    try {
      const response = await authControllerGetWechatAuthUrl({
        query: {
          origin: window.location.origin,
          isPopup: 'false',
          purpose,
          client: isMobileDevice ? 'mobile' : 'web',
          txn: '',
        },
      });
      // SDK 默认不抛错：失败时错误在 result.error，直接对 undefined 解构会向用户显示英文引擎报错
      if (response.error) throw response.error;

      const { authUrl } = response.data as { authUrl: string };
      window.location.href = authUrl;
    } catch (err) {
      console.error('[useWechatAuth] 获取授权链接失败:', err);
      const errorMsg =
        (err as Error & { response?: { data?: { message?: string } } })
          ?.response?.data?.message ||
        (err as Error).message ||
        t('获取授权链接失败');
      handlersRef.current.onError?.(errorMsg);
    } finally {
      loadingRef.current = false;
    }
  }, [purpose]);

  return { open };
}
