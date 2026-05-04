/**
 * Auto-generated validation rules from backend OpenAPI schema
 * DO NOT EDIT — run `pnpm generate:api-types` to regenerate
 */

export const ValidationRules = {
  email: {
    isEmail: true
  },
  username: {
    required: true,
    minLength: 3,
    maxLength: 20,
    pattern: /^[a-zA-Z0-9_]+$/
  },
  password: {
    required: true,
    minLength: 8,
    maxLength: 50
  },
  nickname: {
    maxLength: 50
  }
} as const;

const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  email: { required: '邮箱不能为空', isEmail: '请输入有效的邮箱地址' },
  username: { required: '用户名不能为空', minLength: '用户名至少3个字符', maxLength: '用户名最多20个字符', pattern: '用户名只能包含字母、数字和下划线' },
  password: { required: '密码不能为空', minLength: '密码至少8个字符', maxLength: '密码最多50个字符' },
  nickname: { maxLength: '昵称最多50个字符' },
};

export function validateField(field: keyof typeof ValidationRules, value: string): string | null {
  const rules = ValidationRules[field] as any;
  if (!rules) return null;
  const messages = ERROR_MESSAGES[field] || {};
  if (rules.required && !value) return messages.required || field + "不能为空";
  if (rules.minLength && value.length < rules.minLength) return messages.minLength || "至少" + rules.minLength + "个字符";
  if (rules.maxLength && value.length > rules.maxLength) return messages.maxLength || "最多" + rules.maxLength + "个字符";
  if (rules.pattern && !rules.pattern.test(value)) return messages.pattern || "格式不正确";
  if (rules.isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return messages.isEmail || "请输入有效的邮箱地址";
  return null;
}

export function validateRegisterForm(
  data: { email: string; username: string; password: string; confirmPassword: string; nickname?: string },
  options?: { validateEmail?: boolean }
): string | null {
  if (options?.validateEmail !== false) { const e = validateField("email", data.email); if (e) return e; }
  const u = validateField("username", data.username); if (u) return u;
  const p = validateField("password", data.password); if (p) return p;
  if (data.password !== data.confirmPassword) return "两次输入的密码不一致";
  if (data.nickname) { const n = validateField("nickname", data.nickname); if (n) return n; }
  return null;
}
