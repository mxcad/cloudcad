import { t } from '@/languages'

/**
 * 名称合法性校验（A-24）：新建文件夹 / 新建图纸 / 重命名共用。
 * 对齐 PC useFileSystemCRUD.validateFolderName（非法字符 / 保留名 / 长度 / 首尾点）。
 */
export function validateName(name: string): { valid: boolean; error?: string } {
  const trimmedName = name.trim()

  if (!trimmedName) {
    return { valid: false, error: t('名称不能为空') }
  }

  if (trimmedName.length > 255) {
    return { valid: false, error: t('名称长度不能超过 255 个字符') }
  }

  if (/[<>:"|?*/\\]/.test(trimmedName)) {
    return { valid: false, error: t('名称包含非法字符：< > : " | ? * / \\') }
  }

  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/u.test(trimmedName)) {
    return { valid: false, error: t('名称包含非法字符') }
  }

  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(trimmedName)) {
    return { valid: false, error: t('该名称为系统保留名称') }
  }

  if (trimmedName.startsWith('.') || trimmedName.endsWith('.')) {
    return { valid: false, error: t('名称不能以点开头或结尾') }
  }

  return { valid: true }
}
