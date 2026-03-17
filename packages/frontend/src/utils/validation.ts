///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 自动生成的验证规则 - 来自后端 OpenAPI Schema
 * 🚫 请勿手动编辑此文件，运行 pnpm generate:types 重新生成
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

/**
 * 字段验证规则错误消息映射
 */
const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  email: {
    required: '邮箱不能为空',
    isEmail: '请输入有效的邮箱地址',
  },
  username: {
    required: '用户名不能为空',
    minLength: '用户名至少3个字符',
    maxLength: '用户名最多20个字符',
    pattern: '用户名只能包含字母、数字和下划线',
  },
  password: {
    required: '密码不能为空',
    minLength: '密码至少8个字符',
    maxLength: '密码最多50个字符',
  },
  nickname: {
    maxLength: '昵称最多50个字符',
  },
};

/**
 * 验证字段
 */
export function validateField(field: keyof typeof ValidationRules, value: string): string | null {
  const rules = ValidationRules[field] as any;
  if (!rules) return null;

  const messages = ERROR_MESSAGES[field] || {};

  if (rules.required && !value) {
    return messages.required || field + '不能为空';
  }

  if (rules.minLength && value.length < rules.minLength) {
    return messages.minLength || '至少' + rules.minLength + '个字符';
  }

  if (rules.maxLength && value.length > rules.maxLength) {
    return messages.maxLength || '最多' + rules.maxLength + '个字符';
  }

  if (rules.pattern && !rules.pattern.test(value)) {
    return messages.pattern || '格式不正确';
  }

  if (rules.isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return messages.isEmail || '请输入有效的邮箱地址';
  }

  return null;
}

/**
 * 验证注册表单
 * @param data 表单数据
 * @param options 可选配置
 * @param options.validateEmail 是否验证邮箱（默认 true），当邮件服务未启用时设为 false
 */
export function validateRegisterForm(
  data: {
    email?: string;
    username: string;
    password: string;
    confirmPassword: string;
    nickname?: string;
  },
  options?: { validateEmail?: boolean }
): string | null {
  const shouldValidateEmail = options?.validateEmail !== false;

  // 仅在需要验证邮箱时才检查
  if (shouldValidateEmail && data.email) {
    const emailError = validateField('email', data.email);
    if (emailError) return emailError;
  }

  const usernameError = validateField('username', data.username);
  if (usernameError) return usernameError;

  const passwordError = validateField('password', data.password);
  if (passwordError) return passwordError;

  if (data.password !== data.confirmPassword) {
    return '两次输入的密码不一致';
  }

  if (data.nickname) {
    const nicknameError = validateField('nickname', data.nickname);
    if (nicknameError) return nicknameError;
  }

  return null;
}
