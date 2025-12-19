#!/usr/bin/env node

/**
 * 从后端 Swagger API 生成前端类型定义
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES 模块中获取 __dirname 的等效方法
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SWAGGER_URL = 'http://localhost:3001/api/docs';
const OUTPUT_FILE = path.join(__dirname, '../types/api.ts');
const VALIDATION_FILE = path.join(__dirname, '../utils/validation.ts');

async function generateTypes() {
  try {
    console.log('🚀 开始生成前端类型定义...');
    console.log(`📍 输出文件路径: ${OUTPUT_FILE}`);

    // 确保输出目录存在
    const outputDir = path.dirname(OUTPUT_FILE);
    console.log(`📁 输出目录: ${outputDir}`);
    if (!fs.existsSync(outputDir)) {
      console.log('📁 创建输出目录...');
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 检查后端服务是否运行
    console.log('📡 检查后端服务状态...');
    console.log(`🔗 Swagger URL: ${SWAGGER_URL}-json`);
    let swaggerData;
    try {
      const response = await fetch(`${SWAGGER_URL}-json`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      swaggerData = await response.json();
      console.log('✅ 后端服务正常运行');
    } catch (error) {
      console.error('❌ 后端服务未运行，请先启动后端: pnpm dev');
      console.error('错误详情:', error.message);
      process.exit(1);
    }

    // 生成类型定义
    console.log('📝 正在生成类型定义...');
    const command = `npx openapi-typescript ${SWAGGER_URL}-json -o ${OUTPUT_FILE}`;

    try {
      execSync(command, { stdio: 'inherit' });
      console.log('✅ 类型定义生成完成!');
      console.log(`📁 输出文件: ${OUTPUT_FILE}`);

      // 验证文件是否生成成功
      if (fs.existsSync(OUTPUT_FILE)) {
        const stats = fs.statSync(OUTPUT_FILE);
        console.log(`📊 文件大小: ${stats.size} 字节`);
      } else {
        throw new Error('类型文件未生成');
      }
    } catch (execError) {
      console.error('❌ 生成命令执行失败:', execError.message);
      throw execError;
    }

    // 生成验证规则
    console.log('📝 正在生成验证规则...');
    await generateValidationRules(swaggerData);
    console.log('✅ 验证规则生成完成!');
    console.log(`📁 输出文件: ${VALIDATION_FILE}`);
  } catch (error) {
    console.error('❌ 生成类型定义失败:', error.message);
    process.exit(1);
  }
}

/**
 * 从 OpenAPI Schema 生成验证规则
 */
async function generateValidationRules(swaggerData) {
  const schemas = swaggerData.components?.schemas || {};
  const validationRules = {};

  // 提取需要的 DTO 验证规则
  const targetDtos = ['RegisterDto', 'LoginDto'];

  for (const dtoName of targetDtos) {
    const schema = schemas[dtoName];
    if (!schema || !schema.properties) continue;

    validationRules[dtoName] = {};

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const rules = {};

      if (fieldSchema.minLength) rules.minLength = fieldSchema.minLength;
      if (fieldSchema.maxLength) rules.maxLength = fieldSchema.maxLength;
      if (fieldSchema.pattern) rules.pattern = fieldSchema.pattern;
      if (fieldSchema.format === 'email') rules.isEmail = true;
      if (schema.required?.includes(fieldName)) rules.required = true;

      if (Object.keys(rules).length > 0) {
        validationRules[dtoName][fieldName] = rules;
      }
    }
  }

  // 生成验证规则代码
  const code = generateValidationCode(validationRules);

  // 确保utils目录存在
  const utilsDir = path.dirname(VALIDATION_FILE);
  if (!fs.existsSync(utilsDir)) {
    fs.mkdirSync(utilsDir, { recursive: true });
  }

  fs.writeFileSync(VALIDATION_FILE, code, 'utf-8');
}

/**
 * 生成验证规则代码
 */
function generateValidationCode(rules) {
  const registerRules = rules.RegisterDto || {};

  // 生成字段规则对象
  const fieldRulesCode = Object.entries(registerRules)
    .map(([field, fieldRules]) => {
      const parts = [];

      if (fieldRules.required) {
        parts.push('    required: true');
      }
      if (fieldRules.minLength) {
        parts.push(`    minLength: ${fieldRules.minLength}`);
      }
      if (fieldRules.maxLength) {
        parts.push(`    maxLength: ${fieldRules.maxLength}`);
      }
      if (fieldRules.pattern) {
        // 正确生成 RegExp 对象
        parts.push(`    pattern: /${fieldRules.pattern}/`);
      }
      if (fieldRules.isEmail) {
        parts.push('    isEmail: true');
      }

      return `  ${field}: {\n${parts.join(',\n')}\n  }`;
    })
    .join(',\n');

  return `/**
 * 自动生成的验证规则 - 来自后端 OpenAPI Schema
 * 🚫 请勿手动编辑此文件，运行 pnpm generate:types 重新生成
 */

export const ValidationRules = {
${fieldRulesCode}
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
    pattern: '密码必须包含至少1个大写字母、1个小写字母、1个数字和1个特殊字符',
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
    return messages.required || \`\${field}不能为空\`;
  }

  if (rules.minLength && value.length < rules.minLength) {
    return messages.minLength || \`至少\${rules.minLength}个字符\`;
  }

  if (rules.maxLength && value.length > rules.maxLength) {
    return messages.maxLength || \`最多\${rules.maxLength}个字符\`;
  }

  if (rules.pattern && !rules.pattern.test(value)) {
    return messages.pattern || '格式不正确';
  }

  if (rules.isEmail && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {
    return messages.isEmail || '请输入有效的邮箱地址';
  }

  return null;
}

/**
 * 验证注册表单
 */
export function validateRegisterForm(data: {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  nickname?: string;
}): string | null {
  const emailError = validateField('email', data.email);
  if (emailError) return emailError;

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
`;
}

// 如果直接运行此脚本
generateTypes();

export { generateTypes };
