
import { t } from "@/languages"
import { MxCpp } from "mxcad"
import { showLoadingToast, showToast } from "vant"


export function openMxWeb(url:string) {
  return new Promise<boolean>((res) =>{
    try {
      showLoadingToast(`${t("正在打开图纸")}，${t("请耐心等待")}...`)
      // ‍  直接打开mxweb文件。
// ‍ Open the mxweb file directly.

      const isOpen = MxCpp.App.getCurrentMxCAD().openWebFile(url, (iRet) => {
        if (iRet === 0) {
          showToast(t("打开图纸成功"))
          res(true)
        } else {
          showToast(t("打开图纸失败"))
          res(false)
        }
      })
      res(isOpen)
    } catch (e) {
      res(false)
    }
  })
}