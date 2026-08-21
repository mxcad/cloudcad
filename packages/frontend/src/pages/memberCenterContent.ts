import { Database, HardDrive, FileText, Zap } from 'lucide-react';
import { t } from '@/languages';

/**
 * 会员中心权益明细/FAQ 静态内容（ADR-0033：与 MemberCenter.tsx 拆分）。
 * 转换频率条目为动态数据，按「当前等级配置 → registry 默认值」回落（ADR-0043）。
 */

export interface BenefitItem {
  key: string;
  icon: typeof Database;
  color: string;
  title: string;
  boundaryText: string;
  example: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export const BENEFIT_ITEMS: BenefitItem[] = [
  {
    key: 'quota.personal_storage_mb',
    icon: Database,
    color: 'var(--primary-500)',
    title: t('个人存储空间'),
    boundaryText: t(
      '无法上传新图纸，系统提示"存储空间不足"。请升级 VIP 获取更大空间，或删除不需要的文件释放空间。'
    ),
    example: t(
      '免费用户 50MB 空间，已用 45MB，想上传 10MB 图纸时会被阻止，提示空间不足。'
    ),
  },
  {
    key: 'quota.max_projects',
    icon: FileText,
    color: 'var(--accent-500)',
    title: t('项目数量'),
    boundaryText: t(
      '无法创建新项目，系统提示"项目数量已达上限"。请升级 VIP 获取更多项目额度，或删除不需要的项目。'
    ),
    example: t('免费用户最多 5 个项目，已建 5 个，创建第 6 个时会被阻止。'),
  },
  {
    key: 'quota.project_size_mb',
    icon: HardDrive,
    color: 'var(--success)',
    title: t('单项目存储上限'),
    boundaryText: t(
      '无法向该项目新增内容（上传图纸、复制文件、外部参照等），系统提示"单项目存储上限不足"。请升级 VIP 提高上限，或清理项目中的旧文件。'
    ),
    example: t(
      'VIP0 单项目上限 100MB，项目已有 90MB，再上传 20MB 图纸时 90+20=110MB 超出上限，新增操作被阻止。'
    ),
  },
];

/**
 * 转换频率限制条目：窗口小时数与窗口内次数按「当前等级配置 → registry 默认值」动态解析，
 * 与后端 MembershipService.getEffectiveMembership 的回落语义一致（ADR-0043）。
 * count <= 0 表示不限制（与后端"0 = 不限"语义一致）。
 *
 * 方向语义（2026-08-13 门控上线后）：
 * - 打开方向（其他格式 → MXWEB）：所有人可用，计入窗口次数
 * - 导出下载方向（MXWEB → PDF/DWG/DXF）：仅 VIP 可用（运行时开关 freeExportDownloadEnabled
 *   开放后免费用户也可用）；VIP 的窗口次数为打开 + 导出共用
 */
export function buildConversionBenefitItem(
  windowHours: number,
  windowCount: number,
  isVip: boolean
): BenefitItem {
  const example = isVip
    ? windowCount > 0
      ? t(
          '当前等级每 {hours} 小时可转换（图纸打开 + 导出下载共用）{count} 次，更高 VIP 等级的窗口次数更多（以套餐配置为准）。',
          { hours: String(windowHours), count: String(windowCount) }
        )
      : t('当前等级不限图纸转换次数（图纸打开 + 导出下载共用）。')
    : windowCount > 0
      ? t(
          '当前等级每 {hours} 小时可打开转换图纸 {count} 次，用完需等待窗口结束。导出下载（转 PDF/DWG/DXF）为 VIP 专属功能，升级 VIP 后可用。',
          { hours: String(windowHours), count: String(windowCount) }
        )
      : t(
          '当前等级不限图纸打开转换次数。导出下载（转 PDF/DWG/DXF）为 VIP 专属功能，升级 VIP 后可用。'
        );
  return {
    key: 'quota.conversion_window_count',
    icon: Zap,
    color: 'var(--info)',
    title: t('图纸转换频率限制'),
    boundaryText: isVip
      ? t(
          '窗口内转换次数（图纸打开 + 导出下载共用）用完，系统提示"图纸转换过于频繁，请稍后再试"。每 {hours} 小时窗口结束后自动恢复，或升级更高 VIP 等级获得更高次数上限。',
          { hours: String(windowHours) }
        )
      : t(
          '窗口内图纸打开转换次数用完，系统提示"图纸转换过于频繁，请稍后再试"。每 {hours} 小时窗口结束后自动恢复。导出下载（图纸转 PDF/DWG/DXF）为 VIP 专属功能，升级 VIP 后即可使用。',
          { hours: String(windowHours) }
        ),
    example,
  };
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: t(
      '我是免费用户，单项目上限 100MB，项目里已有 90MB 图纸，再上传 20MB 的图纸会怎样？'
    ),
    a: t(
      '系统会阻止新增操作（上传图纸、复制文件、外部参照等），并提示"单项目存储上限不足"。因为 90MB + 20MB = 110MB，已超出 100MB 的限制。您有两个选择：① 升级 VIP 提高单项目存储上限（VIP1 为 500MB）；② 删除项目中的部分旧图纸释放空间。'
    ),
  },
  {
    q: t('升级 VIP 后，配额限制会立即生效吗？'),
    a: t(
      '是的，升级成功后所有配额（存储空间、项目数量、单项目上限、转换次数等）立即按新 VIP 等级生效，无需重新登录或等待。之前因超限被阻止的操作，升级后即可正常进行。'
    ),
  },
  {
    q: t('我的个人存储空间用完了怎么办？'),
    a: t(
      '系统会阻止上传新图纸，提示"存储空间不足"。您可以升级 VIP 获得更大的个人存储空间，或者在文件管理器中删除不需要的图纸和文件来释放空间。删除后空间立即释放。'
    ),
  },
  {
    q: t('VIP 到期后，已上传的数据会怎样？'),
    a: t(
      'VIP 到期后您的配额会自动恢复为免费用户级别。已上传的文件不会被删除，但如果超出免费配额，您将无法上传新文件直到清理空间或续费。建议在到期前续费以保持服务连续性。'
    ),
  },
  {
    q: t('项目数量上限包含已归档项目吗？'),
    a: t(
      '所有项目（包括已归档项目）都计入项目总数；删除到回收站的项目不计入上限，但恢复时会校验总数不超过当前套餐上限；彻底删除后释放名额'
    ),
  },
  {
    q: t('为什么我不能将图纸导出为 PDF/DWG/DXF？'),
    a: t(
      '导出下载（图纸转 PDF/DWG/DXF）为 VIP 专属功能。升级 VIP 后即可使用，导出下载与图纸打开共用窗口转换次数。'
    ),
  },
];

/**
 * 转换频率 FAQ：窗口小时数与窗口内次数按「当前等级配置 → registry 默认值」动态解析（ADR-0043）。
 * count <= 0 表示不限制（与后端"0 = 不限"语义一致）。
 * 方向语义：打开方向人人可用计入窗口；导出下载（MXWEB → PDF/DWG/DXF）为 VIP 专属。
 */
export function buildConversionFaq(
  windowHours: number,
  windowCount: number,
  isVip: boolean
): FaqItem {
  const answer = isVip
    ? windowCount > 0
      ? t(
          '转换次数按窗口限制（当前等级每 {hours} 小时 {count} 次，图纸打开与导出下载共用），窗口结束后自动恢复。',
          { hours: String(windowHours), count: String(windowCount) }
        )
      : t('当前等级不限图纸转换次数，可正常打开与导出下载图纸。')
    : windowCount > 0
      ? t(
          '图纸打开转换按窗口限制（当前等级每 {hours} 小时 {count} 次），窗口结束后自动恢复。导出下载（MXWEB 转 PDF/DWG/DXF）为 VIP 专属功能，升级 VIP 后即可使用。',
          { hours: String(windowHours), count: String(windowCount) }
        )
      : t(
          '当前等级不限图纸打开转换次数。导出下载（MXWEB 转 PDF/DWG/DXF）为 VIP 专属功能，升级 VIP 后即可使用。'
        );
  return {
    q: t('图纸转换次数用完了还能用吗？'),
    a: answer,
  };
}
