import { useCallback, useRef, useState, type ReactElement } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { buildLoginUrl } from '@/config/clientSetup';
import { LoginPrompt } from '@/components/auth/LoginPrompt';

export interface UseLoginGateOptions {
  isAuthenticated: boolean;
  /** 登录跳转前的钩子（如编辑器页隐藏 CAD 视图/结算 show 动作） */
  onLoginStart?: () => void;
  /**
   * 「稍后再说」关闭闸门视图的钩子：用户此刻放弃该动作，消费方据此清理
   * 已挂起的意图链（ADR-0081），避免下次登录时自动续跑一个用户已放弃的动作。
   * 路由变化触发的关闭同样会走这里——意图链只由显式动作创建，重建成本是一次点击。
   */
  onLoginPromptClose?: () => void;
}

export interface LoginGate {
  /**
   * 闸门（唯一动作入口）：
   * 已登录 → 放行 true；未登录且未抑制 → 显示闸门视图并返回 false；
   * 未登录但已抑制（用户已点「立即登录」）→ 静默返回 false。
   * 抑制语义与 return URL 构造在此私有化，消费方不得再自行拼 /login?redirect=。
   */
  requireLogin: (actionLabel: string) => boolean;
  /** 只读查询：用户是否已选择「立即登录」（抑制中，闸门视图不再弹出） */
  isLoginSuppressed: () => boolean;
  /** 解除抑制（登录成功回到首页后由 useFileOpenGuard 调用） */
  resetLoginSuppression: () => void;
  /** 闸门视图状态（只读） */
  showLoginPrompt: boolean;
  loginPromptAction: string;
  /**
   * 「立即登录」：置抑制 → onLoginStart → 隐藏编辑器 → 跳 buildLoginUrl(目标页)。
   * @param returnPath 登录后要回的目标页。缺省 = 当前 URL（打开图纸/外部参照/
   *   协同链接等「就地意图」，登录后继续原地动作）。侧边栏「我的项目/个人空间」
   *   卡片传明确目标页（/projects、/personal-space），否则登录后会回到 CAD 编辑器。
   */
  handleLoginClick: (returnPath?: string) => void;
  /** 「稍后再说」：仅关闭闸门视图（不置抑制，后续动作仍可再弹） */
  handleLoginPromptClose: () => void;
  /** 闸门视图（模态由本模块渲染，消费方只负责挂载） */
  loginPrompt: ReactElement;
}

/**
 * useLoginGate — 游客登录闸门的唯一 owner（A8）。
 *
 * 此前闸门被 5 个文件拼出来：useFileOpenGuard 返回 3 ref + 2 setter 让兄弟模块
 * 改写私有协议，SidebarContainer 另持一套本地状态，重定向 URL 手拼 ×3。
 * 现在：抑制标志、return URL（buildLoginUrl 单一出口）、showMxCAD(false)
 * 全部收敛于此，对外只暴露 requireLogin 一个动作 + 只读查询 + 视图元素。
 */
export function useLoginGate({
  isAuthenticated,
  onLoginStart,
  onLoginPromptClose,
}: UseLoginGateOptions): LoginGate {
  const navigate = useNavigate();
  const location = useLocation();

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginPromptAction, setLoginPromptAction] = useState<string>('');
  const loginPromptDismissedRef = useRef(false);

  const requireLogin = useCallback(
    (actionLabel: string) => {
      if (isAuthenticated) return true;
      if (loginPromptDismissedRef.current) return false;
      setLoginPromptAction(actionLabel);
      setShowLoginPrompt(true);
      return false;
    },
    [isAuthenticated]
  );

  const isLoginSuppressed = useCallback(
    () => loginPromptDismissedRef.current,
    []
  );

  const resetLoginSuppression = useCallback(() => {
    loginPromptDismissedRef.current = false;
  }, []);

  const handleLoginClick = useCallback(
    (returnPath?: string) => {
      loginPromptDismissedRef.current = true;
      setShowLoginPrompt(false);
      onLoginStart?.();

      // adapter 1：隐藏 CAD 编辑器，避免遮挡登录页面（best-effort，不阻塞跳转）
      import('../services/mxcadManager')
        .then(({ mxcadManager }) => {
          mxcadManager.showMxCAD(false);
        })
        .catch(() =>
          console.warn('[useLoginGate] handleLoginClick: showMxCAD(false) 失败')
        );

      // adapter 2：return URL 走 buildLoginUrl 单一出口（禁止手拼 /login?redirect=）。
      // 传入 returnPath = 「用户真正想去的目标页」（侧边栏项目/个人空间卡片）；
      // 缺省才是当前页（打开图纸/外部参照/协同链接等就地意图，登录后继续原地动作）。
      const target = returnPath ?? location.pathname + location.search;
      navigate(buildLoginUrl(target), { replace: true });
    },
    [navigate, location.pathname, location.search, onLoginStart]
  );

  const handleLoginPromptClose = useCallback(() => {
    setShowLoginPrompt(false);
    onLoginPromptClose?.();
  }, [onLoginPromptClose]);

  const loginPrompt = (
    <LoginPrompt
      isOpen={showLoginPrompt}
      action={loginPromptAction}
      // 包一层丢弃 Button 传入的 MouseEvent，避免其被当作 returnPath（truthy）
      onLogin={() => handleLoginClick()}
      onClose={handleLoginPromptClose}
    />
  );

  return {
    requireLogin,
    isLoginSuppressed,
    resetLoginSuppression,
    showLoginPrompt,
    loginPromptAction,
    handleLoginClick,
    handleLoginPromptClose,
    loginPrompt,
  };
}
