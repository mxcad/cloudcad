/**
 * 文件名合法性规则——跨端共享的纯判定。
 *
 * 新建文件夹/新建图纸/重命名共用同一套规则（空名 / 长度 / 非法字符 /
 * 控制字符 / Windows 保留名 / 首尾点）。过去 PC `utils/fileUtils.ts`
 * `validateFolderName` 与移动端 `utils/validateName.ts` 逐字节各写一份；
 * 这里收敛为唯一判定，错误文案（i18n）留在各端按 reasonCode 映射。
 */

/** 不合法原因码（端包据此映射 i18n 文案）。 */
export type FileNameReason =
  | 'empty'
  | 'too_long'
  | 'illegal_chars'
  | 'control_chars'
  | 'reserved_name'
  | 'dot_edges';

export type FileNameCheckResult =
  { valid: true } | { valid: false; reason: FileNameReason };

const ILLEGAL_CHARS = /[<>:"|?*/\\]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/u;
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/**
 * 判定文件名合法性。`maxLength` 缺省 255（两端现行口径）。
 * 判定顺序即优先级：空 → 长度 → 非法字符 → 控制字符 → 保留名 → 首尾点。
 */
export function checkFileName(
  name: string,
  maxLength = 255
): FileNameCheckResult {
  const trimmed = name.trim();

  if (!trimmed) return { valid: false, reason: 'empty' };
  if (trimmed.length > maxLength) return { valid: false, reason: 'too_long' };
  if (ILLEGAL_CHARS.test(trimmed))
    return { valid: false, reason: 'illegal_chars' };
  if (CONTROL_CHARS.test(trimmed))
    return { valid: false, reason: 'control_chars' };
  if (RESERVED_NAMES.test(trimmed))
    return { valid: false, reason: 'reserved_name' };
  if (trimmed.startsWith('.') || trimmed.endsWith('.'))
    return { valid: false, reason: 'dot_edges' };

  return { valid: true };
}
