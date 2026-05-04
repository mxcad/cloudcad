#!/usr/bin/env node
/**
 * 从本地 swagger_json.json 生成 TypeScript 类型和验证规则
 *
 * swagger_json.json 由后端启动时自动同步到此目录，
 * 无需后端运行即可重新生成类型。
 *
 * 使用：pnpm generate:api-types
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SWAGGER_FILE = path.join(__dirname, '../swagger_json.json');
const OUTPUT_FILE = path.join(__dirname, '../src/types/api-client.ts');
const VALIDATION_FILE = path.join(__dirname, '../src/utils/validation.ts');

console.log('Generating OpenAPI client types...');

// 读取本地 swagger_json.json（后端启动时自动同步）
if (!fs.existsSync(SWAGGER_FILE)) {
  console.error(`Swagger file not found: ${SWAGGER_FILE}`);
  console.error('Start the backend once to auto-generate this file.');
  process.exit(1);
}

const swaggerData = JSON.parse(fs.readFileSync(SWAGGER_FILE, 'utf8'));

// 运行 openapicmd typegen
const binExt = process.platform === 'win32' ? '.CMD' : '';
const openapiBin = path.join(__dirname, `../node_modules/.bin/openapi${binExt}`);

try {
  const output = execSync(`"${openapiBin}" typegen "${SWAGGER_FILE}"`, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });

  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
  console.log(`Types generated: ${OUTPUT_FILE} (${fs.statSync(OUTPUT_FILE).size} bytes)`);
} catch (error) {
  console.error('Type generation failed:', error.message);
  process.exit(1);
}

// 生成验证规则
generateValidationRules(swaggerData);
console.log(`Validation rules generated: ${VALIDATION_FILE}`);

// ============================================================
// 验证规则生成（与之前逻辑相同）
// ============================================================

function generateValidationRules(swaggerData) {
  const schemas = swaggerData.components?.schemas || {};
  const validationRules = {};

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

  const code = generateValidationCode(validationRules);

  const utilsDir = path.dirname(VALIDATION_FILE);
  if (!fs.existsSync(utilsDir)) {
    fs.mkdirSync(utilsDir, { recursive: true });
  }

  fs.writeFileSync(VALIDATION_FILE, code, 'utf-8');
}

function generateValidationCode(rules) {
  const registerRules = rules.RegisterDto || {};

  const fieldRulesCode = Object.entries(registerRules)
    .map(([field, fieldRules]) => {
      const parts = [];

      if (fieldRules.required) parts.push('    required: true');
      if (fieldRules.minLength) parts.push(`    minLength: ${fieldRules.minLength}`);
      if (fieldRules.maxLength) parts.push(`    maxLength: ${fieldRules.maxLength}`);
      if (fieldRules.pattern) parts.push(`    pattern: /${fieldRules.pattern}/`);
      if (fieldRules.isEmail) parts.push('    isEmail: true');

      return `  ${field}: {\n${parts.join(',\n')}\n  }`;
    })
    .join(',\n');

  return [
    '/**',
    ' * Auto-generated validation rules from backend OpenAPI schema',
    ' * DO NOT EDIT — run `pnpm generate:api-types` to regenerate',
    ' */',
    '',
    'export const ValidationRules = {',
    fieldRulesCode,
    '} as const;',
    '',
    'const ERROR_MESSAGES: Record<string, Record<string, string>> = {',
    "  email: { required: '邮箱不能为空', isEmail: '请输入有效的邮箱地址' },",
    "  username: { required: '用户名不能为空', minLength: '用户名至少3个字符', maxLength: '用户名最多20个字符', pattern: '用户名只能包含字母、数字和下划线' },",
    "  password: { required: '密码不能为空', minLength: '密码至少8个字符', maxLength: '密码最多50个字符' },",
    "  nickname: { maxLength: '昵称最多50个字符' },",
    '};',
    '',
    'export function validateField(field: keyof typeof ValidationRules, value: string): string | null {',
    '  const rules = ValidationRules[field] as any;',
    '  if (!rules) return null;',
    '  const messages = ERROR_MESSAGES[field] || {};',
    '  if (rules.required && !value) return messages.required || field + "不能为空";',
    '  if (rules.minLength && value.length < rules.minLength) return messages.minLength || "至少" + rules.minLength + "个字符";',
    '  if (rules.maxLength && value.length > rules.maxLength) return messages.maxLength || "最多" + rules.maxLength + "个字符";',
    '  if (rules.pattern && !rules.pattern.test(value)) return messages.pattern || "格式不正确";',
    '  if (rules.isEmail && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) return messages.isEmail || "请输入有效的邮箱地址";',
    '  return null;',
    '}',
    '',
    'export function validateRegisterForm(',
    '  data: { email: string; username: string; password: string; confirmPassword: string; nickname?: string },',
    '  options?: { validateEmail?: boolean }',
    '): string | null {',
    '  if (options?.validateEmail !== false) { const e = validateField("email", data.email); if (e) return e; }',
    '  const u = validateField("username", data.username); if (u) return u;',
    '  const p = validateField("password", data.password); if (p) return p;',
    '  if (data.password !== data.confirmPassword) return "两次输入的密码不一致";',
    '  if (data.nickname) { const n = validateField("nickname", data.nickname); if (n) return n; }',
    '  return null;',
    '}',
    '',
  ].join('\n');
}
