
import { t } from "@/languages"
import { MxCpp } from "mxcad"
import { showLoadingToastOnce, showToastOnce } from "@/utils/toast"


export function openMxWeb(url:string) {
  return new Promise<boolean>((res) =>{
    try {
      showLoadingToastOnce(`${t("正在打开图纸")}，${t("请耐心等待")}...`)
      // ‍  直接打开mxweb文件。
// ‍ Open the mxweb file directly.

      const isOpen = MxCpp.App.getCurrentMxCAD().openWebFile(url, (iRet) => {
        if (iRet === 0) {
          showToastOnce(t("打开图纸成功"))
          res(true)
        } else {
          showToastOnce(t("打开图纸失败"))
          res(false)
        }
      })
      res(isOpen)
    } catch (e) {
      res(false)
    }
  })
}