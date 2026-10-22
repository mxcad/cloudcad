import { t } from '@/languages';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import {
  scorePasswordStrength,
  type PasswordRequirement,
} from '@cloudcad/platform';

/**
 * 口令策略参数与文案的唯一出口（PC 端）。
 *
 * 口令策略（最小长度 / 字符类别构成）是**按部署可配置的运行时事实**：
 * 后端 runtimeConfig 键 passwordPolicyMinLength / passwordPolicyMinCategories
 * （运维可改、env 可覆盖、安全模式 profile 有不同目标值），经
 * /runtime-config/public 下发。所有口令要求提示（placeholder / 清单 /
 * 错误文案）与提交前预检必须经 usePasswordPolicy() 取生效值、经本文件的
 * 文案函数渲染——禁止把策略数字写死成静态文案（门禁：
 * pnpm scan:password-policy；后端改默认值时前端自动跟随，无需改前端）。
 *
 * 强度分→标签/颜色的映射（passwordStrengthDisplay）也在此：评分算法在
 * @cloudcad/platform，但它的阈值由调用方传入的生效策略决定，因此强度条随部署
 * 策略相对变化（合规口令最低显示「一般」），不再是与策略无关的绝对刻度。
 *
 * 旧后端未公开该两键时，RuntimeConfigContext 回落 secure 基线默认（10/3），
 * 与 @cloudcad/platform 的 PASSWORD_POLICY 兜底一致。
 */
export interface PasswordPolicyParams {
  /** 最小长度（生效值；旧后端回落 10） */
  minLength: number;
  /** 至少需要的字符类别数（0 = 不要求；生效值；旧后端回落 3） */
  minCategories: number;
}

/** 读取生效口令策略参数（来自 /runtime-config/public）。 */
export function usePasswordPolicy(): PasswordPolicyParams {
  const { config } = useRuntimeConfig();
  return {
    minLength: config.passwordPolicyMinLength,
    minCategories: config.passwordPolicyMinCategories,
  };
}

/**
 * 口令要求提示（placeholder / 安全建议清单用），由生效策略值推导。
 * minCategories：0 = 不要求类别构成；≥4 = 四类全要。
 */
export function passwordPolicyHint({
  minLength,
  minCategories,
}: PasswordPolicyParams): string {
  if (minLength > 0 && minCategories >= 4) {
    return t('至少 {min} 位，需包含大小写字母、数字、特殊字符', {
      min: String(minLength),
    });
  }
  if (minLength > 0) {
    return minCategories > 0
      ? t('至少 {min} 位，需包含大小写字母、数字、特殊字符中至少 {cats} 类', {
          min: String(minLength),
          cats: String(minCategories),
        })
      : t('至少 {min} 位', { min: String(minLength) });
  }
  if (minCategories >= 4) {
    return t('需包含大小写字母、数字、特殊字符');
  }
  if (minCategories > 0) {
    return t('需包含大小写字母、数字、特殊字符中至少 {cats} 类', {
      cats: String(minCategories),
    });
  }
  return t('无密码复杂度要求');
}

/** 清单标签：最小长度要求（实时校验清单用）。 */
export function passwordLengthLabel(minLength: number): string {
  return t('至少 {min} 位', { min: String(minLength) });
}

/** 错误文案：长度不足（对齐后端 password_policy.too_short 语义）。 */
export function passwordTooShortMessage(minLength: number): string {
  return t('密码至少 {min} 个字符', { min: String(minLength) });
}

/** 错误文案：类别构成不足（对齐后端 password_policy.complexity 语义）。 */
export function passwordComplexityMessage(minCategories: number): string {
  return t('密码需包含大小写字母、数字、特殊字符中至少 {cats} 类', {
    cats: String(minCategories),
  });
}

export interface PasswordStrengthDisplay {
  strength: number;
  label: string;
  color: string;
}

/**
 * 强度五档标签与颜色（PC 硬编码 hex，移动端走 CSS token）。
 * 函数形式而非模块级常量：文案须在渲染期经 t() 取，且字面量要能被
 * i18n extract 扫到（写成 t(level.label) 的动态键 extract 扫不到）。
 */
function strengthLevels(): { label: string; color: string }[] {
  return [
    { label: t('太弱'), color: '#ef4444' },
    { label: t('较弱'), color: '#f97316' },
    { label: t('一般'), color: '#eab308' },
    { label: t('较强'), color: '#22c55e' },
    { label: t('很强'), color: '#10b981' },
  ];
}

/**
 * 强度条展示值（唯一出口，原 usePasswordProfile 与 Register 各写一份）。
 * 阈值由生效策略传入，故同一口令在宽松与严格策略下评分不同。
 */
export function passwordStrengthDisplay(
  password: string,
  policy: PasswordPolicyParams
): PasswordStrengthDisplay {
  if (!password) return { strength: 0, label: '', color: '' };
  const score = scorePasswordStrength(password, policy);
  const levels = strengthLevels();
  const level = levels[score] ?? levels[0]!;
  return { strength: score, label: level.label, color: level.color };
}

/**
 * 要求清单文案（platform 只给 key，i18n 文案按端渲染，唯一出口）。
 * 标签由生效策略值推导，禁止写死策略数字。
 */
export function passwordRequirementLabel(
  requirement: PasswordRequirement,
  policy: PasswordPolicyParams
): string {
  return requirement.key === 'length'
    ? passwordLengthLabel(policy.minLength)
    : passwordComplexityMessage(policy.minCategories);
}
