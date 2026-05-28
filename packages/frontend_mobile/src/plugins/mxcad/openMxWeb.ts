
import { t } from "@/languages"
import { MxCpp } from "mxcad"
import { showLoadingToastOnce, showToastOnce } from "@/utils/toast"


export function openMxWeb(url: string, options?: { requestHeaders?: Record<string, string> }) {
  return new Promise<boolean>((res) =>{
    try {
      showLoadingToastOnce(`${t("正在打开图纸")}，${t("请耐心等待")}...`)

      const token = localStorage.getItem('accessToken')
      const objParam = options?.requestHeaders || (token ? { requestHeaders: { Authorization: `Bearer ${token}` } } : undefined)

      const isOpen = MxCpp.App.getCurrentMxCAD().openWebFile(url, (iRet) => {
        if (iRet === 0) {
          showToastOnce(t("打开图纸成功"))
          res(true)
        } else {
          showToastOnce(t("打开图纸失败"))
          res(false)
        }
      }, undefined, objParam)
      if (isOpen) res(true)
    } catch (e) {
      res(false)
    }
  })
}