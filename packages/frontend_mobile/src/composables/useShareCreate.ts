/**
 * 批量分享创建（M-01，对齐 PC ShareDialog createBatchShares）。
 *
 * 同一 expiresIn 逐文件循环调用 shareControllerCreateShare（后端无批量端点，
 * PC 同为逐文件循环），收集每文件结果：成功项带 token/url/expiresAt，
 * 失败项带 error 且不影响其余文件继续创建。
 *
 * expiresIn（秒）计算收敛到 @cloudcad/platform computeExpiresInSeconds（与 PC 共用）。
 */
import { shareControllerCreateShare } from '@cloudcad/api-sdk/sdk.gen'
import { computeExpiresInSeconds, type ShareExpirationOption } from '@cloudcad/platform'
import { t } from '@/languages'

export interface ShareCreateResult {
  fileName: string
  token: string
  url: string
  expiresAt?: string | null
  success: boolean
  error?: string
}

export function useShareCreate() {
  async function createShares(
    files: Array<{ fileId: string; fileName: string }>,
    expiration: ShareExpirationOption,
    customDays: number
  ): Promise<ShareCreateResult[]> {
    const expiresInValue = computeExpiresInSeconds(expiration, customDays)
    const results: ShareCreateResult[] = []
    for (const file of files) {
      try {
        const res = await shareControllerCreateShare({
          body: {
            fileId: file.fileId,
            ...(expiresInValue !== undefined ? { expiresIn: expiresInValue } : {}),
          },
        })
        if (res.error) {
          results.push({
            fileName: file.fileName,
            token: '',
            url: '',
            expiresAt: null,
            success: false,
            error: String(res.error),
          })
          continue
        }
        const raw = res.data as { token?: string; url?: string; expiresAt?: string | null } | undefined
        if (raw && raw.token) {
          results.push({
            fileName: file.fileName,
            token: raw.token,
            url: raw.url ?? '',
            expiresAt: raw.expiresAt ?? null,
            success: true,
          })
        } else {
          results.push({
            fileName: file.fileName,
            token: '',
            url: '',
            expiresAt: null,
            success: false,
            error: t('创建分享链接失败'),
          })
        }
      } catch {
        results.push({
          fileName: file.fileName,
          token: '',
          url: '',
          expiresAt: null,
          success: false,
          error: t('创建失败，请重试'),
        })
      }
    }
    return results
  }

  return { createShares }
}
