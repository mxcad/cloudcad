import { t } from '@/languages'
import { checkFileName } from '@cloudcad/platform'

/**
 * 名称合法性校验（A-24）：新建文件夹 / 新建图纸 / 重命名共用。
 * 判定规则收敛到 @cloudcad/platform 的 checkFileName（与 PC 共用），
 * 这里只负责把 reasonCode 映射成本端 i18n 文案。
 */
export function validateName(name: string): { valid: boolean; error?: string } {
  const result = checkFileName(name)

  if (result.valid) return { valid: true }

  switch (result.reason) {
    case 'empty':
      return { valid: false, error: t('名称不能为空') }
    case 'too_long':
      return { valid: false, error: t('名称长度不能超过 255 个字符') }
    case 'illegal_chars':
      return { valid: false, error: t('名称包含非法字符：< > : " | ? * / \\') }
    case 'control_chars':
      return { valid: false, error: t('名称包含非法字符') }
    case 'reserved_name':
      return { valid: false, error: t('该名称为系统保留名称') }
    case 'dot_edges':
      return { valid: false, error: t('名称不能以点开头或结尾') }
  }
}
