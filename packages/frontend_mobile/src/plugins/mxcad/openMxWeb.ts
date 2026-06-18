
import { t } from "@/languages"
import { MxCpp } from "mxcad"
import { showToastOnce } from "@/utils/toast"


export function openMxWeb(url: string, options?: { requestHeaders?: Record<string, string> }) {
  return new Promise<boolean>((res) =>{
    try {
      const token = localStorage.getItem('accessToken')
      const objParam = options?.requestHeaders || (token ? { requestHeaders: { Authorization: `Bearer ${token}` } } : undefined)

      // SDK 的 openWebFile 在 emscripten 同步模式下可能丢失 query 参数，
      // 所以把 shareToken 也塞到请求头里，后端双路检测（query + header）
      let headers = objParam
      const shareTokenMatch = url.match(/[?&]shareToken=([^&]+)/)
      if (shareTokenMatch) {
        const shareToken = decodeURIComponent(shareTokenMatch[1])
        headers = {
          requestHeaders: {
            ...(objParam?.requestHeaders || {}),
            'x-share-token': shareToken,
          },
        }
      }

      const isOpen = MxCpp.App.getCurrentMxCAD().openWebFile(url, (iRet) => {
        if (iRet === 0) {
          showToastOnce(t("打开图纸成功"))
          res(true)
        } else {
          showToastOnce(t("打开图纸失败"))
          res(false)
        }
      }, undefined, headers)
      if (!isOpen) res(false)
    } catch (e) {
      console.error('openMxWeb failed:', e)
      showToastOnce(t("打开图纸失败"))
      res(false)
    }
  })
}