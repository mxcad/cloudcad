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
import { errMsg } from '@/utils/apiError'
import { shareUrl } from '@/utils/shareUrl'

export interface ShareCreateResult {
  fileName: string
  token: string
  url: string
  expiresAt?: string | null
  success: boolean
  error?: string
}

export function useShareCreate() {
  /**
   * @param onProgress 每完成一个文件回调一次（done=已完成数，total=总数）。
   *   对齐 PC `setBatchResults([...results])` 的实时进度（loading 视图显示 done/total）；
   *   不传则与旧调用完全一致。
   */
  async function createShares(
    files: Array<{ fileId: string; fileName: string }>,
    expiration: ShareExpirationOption,
    customDays: number,
    onProgress?: (done: number, total: number) => void
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
            error: errMsg(res.error, t('创建分享链接失败')),
          })
        } else {
          const raw = res.data as
            | { token?: string; url?: string; expiresAt?: string | null }
            | undefined
          if (raw && raw.token) {
            results.push({
              fileName: file.fileName,
              token: raw.token,
              url: shareUrl(raw.url),
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
        }
      } catch (e) {
        results.push({
          fileName: file.fileName,
          token: '',
          url: '',
          expiresAt: null,
          success: false,
          error: errMsg(e, t('创建失败，请重试')),
        })
      }
      onProgress?.(results.length, files.length)
    }
    return results
  }

  return { createShares }
}
