#!/usr/bin/env node
/**
 * 从 OpenAPI 定义生成 TypeScript 类型和验证规则
 * 使用 openapicmd typegen（openapicmd 已安装为前端 devDependency）
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SWAGGER_URL = 'http://localhost:3001/api/docs-json';
const LOCAL_SWAGGER_FILE = path.join(__dirname, '../swagger_json.json');
const OUTPUT_FILE = path.join(__dirname, '../packages/frontend/src/types/api-client.ts');
const VALIDATION_FILE = path.join(__dirname, '../packages/frontend/src/utils/validation.ts');

console.log('🚀 开始生成 OpenAPI 客户端类型...');

async function generateTypes() {
  let swaggerData;
  let swaggerSource;

  // 尝试从后端服务获取 Swagger JSON
  // 注意：operationId 中的 _v1 后缀需要在 swagger_json.json 中预先去除
  try {
    console.log(`📡 尝试从后端获取 Swagger: ${SWAGGER_URL}`);
    const response = await fetch(SWAGGER_URL);
    if (response.ok) {
      swaggerData = await response.json();
      swaggerSource = 'backend';
      console.log('✅ 从后端获取 Swagger 成功');

      // 同时更新本地 swagger_json.json 文件
      fs.writeFileSync(
        LOCAL_SWAGGER_FILE,
        JSON.stringify(swaggerData, null, 2),
        'utf8'
      );
      console.log(`💾 已更新本地文件: ${LOCAL_SWAGGER_FILE}`);
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn(`⚠️ 无法从后端获取 Swagger: ${error.message}`);
    console.log(`📁 尝试使用本地文件: ${LOCAL_SWAGGER_FILE}`);

    // 回退到本地文件
    if (fs.existsSync(LOCAL_SWAGGER_FILE)) {
      swaggerData = JSON.parse(fs.readFileSync(LOCAL_SWAGGER_FILE, 'utf8'));
      swaggerSource = 'local';
      console.log('✅ 使用本地 Swagger 文件');
    } else {
      console.error('❌ 本地 Swagger 文件也不存在');
      process.exit(1);
    }
  }

  console.log(`📁 输出文件: ${OUTPUT_FILE}`);

  // 确保输出目录存在
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 运行 openapicmd typegen（使用本地安装的 openapicmd，bin 名为 openapi）
  try {
    const inputSource =
      swaggerSource === 'backend' ? SWAGGER_URL : LOCAL_SWAGGER_FILE;
    const binExt = process.platform === 'win32' ? '.CMD' : '';
    const openapiBin = path.join(
      __dirname, `../packages/frontend/node_modules/.bin/openapi${binExt}`,
    );
    const output = execSync(`"${openapiBin}" typegen "${inputSource}"`, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });

    fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
    console.log('✅ 类型生成完成!');
    console.log(`📊 文件大小: ${fs.statSync(OUTPUT_FILE).size} 字节`);
  } catch (error) {
    console.error('❌ 类型生成失败:', error.message);
    process.exit(1);
  }

  // 生成验证规则
  console.log('📝 正在生成验证规则...');
  await generateValidationRules(swaggerData);
  console.log('✅ 验证规则生成完成!');
  console.log(`📁 输出文件: ${VALIDATION_FILE}`);
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

      return `  ${field}: {
${parts.join(',\n')}
  }`;
    })
    .join(',\n');

  // 使用字符串拼接避免模板字符串转义问题
  const code = [
    '/**',
    ' * 自动生成的验证规则 - 来自后端 OpenAPI Schema',
    ' * 🚫 请勿手动编辑此文件，运行 pnpm generate:types 重新生成',
    ' */',
    '',
    'export const ValidationRules = {',
    fieldRulesCode,
    '} as const;',
    '',
    '/**',
    ' * 字段验证规则错误消息映射',
    ' */',
    'const ERROR_MESSAGES: Record<string, Record<string, string>> = {',
    '  email: {',
    "    required: '邮箱不能为空',",
    "    isEmail: '请输入有效的邮箱地址',",
    '  },',
    '  username: {',
    "    required: '用户名不能为空',",
    "    minLength: '用户名至少3个字符',",
    "    maxLength: '用户名最多20个字符',",
    "    pattern: '用户名只能包含字母、数字和下划线',",
    '  },',
    '  password: {',
    "    required: '密码不能为空',",
    "    minLength: '密码至少8个字符',",
    "    maxLength: '密码最多50个字符',",

    '  },',
    '  nickname: {',
    "    maxLength: '昵称最多50个字符',",
    '  },',
    '};',
    '',
    '/**',
    ' * 验证字段',
    ' */',
    'export function validateField(field: keyof typeof ValidationRules, value: string): string | null {',
    '  const rules = ValidationRules[field] as any;',
    '  if (!rules) return null;',
    '',
    '  const messages = ERROR_MESSAGES[field] || {};',
    '',
    '  if (rules.required && !value) {',
    "    return messages.required || field + '不能为空';",
    '  }',
    '',
    '  if (rules.minLength && value.length < rules.minLength) {',
    "    return messages.minLength || '至少' + rules.minLength + '个字符';",
    '  }',
    '',
    '  if (rules.maxLength && value.length > rules.maxLength) {',
    "    return messages.maxLength || '最多' + rules.maxLength + '个字符';",
    '  }',
    '',
    '  if (rules.pattern && !rules.pattern.test(value)) {',
    "    return messages.pattern || '格式不正确';",
    '  }',
    '',
    '  if (rules.isEmail && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {',
    "    return messages.isEmail || '请输入有效的邮箱地址';",
    '  }',
    '',
    '  return null;',
    '}',
    '',
    '/**',
    ' * 验证注册表单',
    ' * @param data 表单数据',
    ' * @param options 可选配置',
    ' * @param options.validateEmail 是否验证邮箱（默认 true），当邮件服务未启用时设为 false',
    ' */',
    'export function validateRegisterForm(',
    '  data: {',
    '    email: string;',
    '    username: string;',
    '    password: string;',
    '    confirmPassword: string;',
    '    nickname?: string;',
    '  },',
    '  options?: { validateEmail?: boolean }',
    '): string | null {',
    '  const shouldValidateEmail = options?.validateEmail !== false;',
    '',
    '  // 仅在需要验证邮箱时才检查',
    '  if (shouldValidateEmail) {',
    "    const emailError = validateField('email', data.email);",
    '    if (emailError) return emailError;',
    '  }',
    '',
    "  const usernameError = validateField('username', data.username);",
    '  if (usernameError) return usernameError;',
    '',
    "  const passwordError = validateField('password', data.password);",
    '  if (passwordError) return passwordError;',
    '',
    '  if (data.password !== data.confirmPassword) {',
    "    return '两次输入的密码不一致';",
    '  }',
    '',
    '  if (data.nickname) {',
    "    const nicknameError = validateField('nickname', data.nickname);",
    '    if (nicknameError) return nicknameError;',
    '  }',
    '',
    '  return null;',
    '}',
    '',
  ].join('\n');

  return code;
}

// 执行生成
generateTypes().catch((error) => {
  console.error('❌ 生成失败:', error.message);
  process.exit(1);
});
