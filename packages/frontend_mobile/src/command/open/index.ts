import { getBaseUrl, getUploadFileConfig } from "@/config/serverConfig";
import { openMxWeb } from "@/plugins/mxcad/openMxWeb";
import { LoadFileParam, uploadFile } from "@/plugins/WebUploader/useDwgUpload";
import { showLoadingToast } from "vant";
import { showToastOnce } from "@/utils/toast";
import { processorExternalFile } from "./openPreloading";
import { FetchAttributes, MxCpp } from "mxcad";
import $api from "@/plugins/axios"
import { addCommand } from "@/plugins/mxcad/command";
import { t } from "@/languages";
async function OpenDwgImp(param: LoadFileParam, isUseBuffer: boolean) {
    return new Promise<boolean>(async (res) => {
        let fileHash = param.hash;
        let type = param.type;
        const file = param.file

        if (type === "mxweb") {
            const filePath = URL.createObjectURL(file.source.source)
            setTimeout(() => {
                openMxWeb(filePath)
            })
        } else {
       
            const { close } = showLoadingToast(t("打开图纸中") + "...")
            let {
                mxfilepath = ""
            } = getUploadFileConfig() || {};

            let baseUrl = getBaseUrl();

            let filePath = baseUrl + mxfilepath + fileHash + "." + type + ".mxweb";

            let fileTzPath = baseUrl + mxfilepath + fileHash + "/___mx___tz___.dwg.mxweb";

            // ‍  处理加载该文件时需要的其它文件。
// ‍ Process other files required for loading this file.

            let isWaiteTzFile = false;

            if (!param.isUseServerExistingFile) {
                let processorResult: any = await processorExternalFile(filePath, fileHash as string);
                if (!processorResult.ok) {
                    close()
                    return res(false);
                }
                if (processorResult.tz) {
                    isWaiteTzFile = true;
                }
            }

            showToastOnce(t("正在打开文件中") + "...");
            var dTime1 = (new Date()).getTime();

            let iFetchAttrib = 0;

            if (!isUseBuffer) {
                iFetchAttrib = FetchAttributes.EMSCRIPTEN_FETCH_LOAD_TO_MEMORY | FetchAttributes.EMSCRIPTEN_FETCH_PERSIST_FILE | FetchAttributes.EMSCRIPTEN_FETCH_REPLACE;
            }

            let mxcad = MxCpp.App.getCurrentMxCAD();

            const isOpen = mxcad.openWebFile(filePath, (iRet) => {
                close();
                if (iRet === 0) {
                    res(true)
                    var dTime2 = (new Date()).getTime();
                    if (dTime2 - dTime1 > 5000) {
                        showToastOnce(t("更新显示") + "...")
                    }
                    // ‍  图纸加载完成.
// ‍ The drawing loading is completed

                    if (isWaiteTzFile) {
                        let posttz = baseUrl + "/mxcad/files/tz";
                        $api.post(posttz, { fileHash: fileHash }).then((res: any) => {
                            if (res && res.data && res.data.code == 0) {
                                mxcad.getImp().loadTz(fileTzPath);
                            }
                        });
                    }
                } else {
                    res(false)
                    showToastOnce(t("打开图纸失败"))
                }
            }, undefined, undefined, iFetchAttrib, !isWaiteTzFile);

            if (isOpen) res(true)
            else res(false)

            res(false)
        }
    })

}


addCommand("OpenDwg", async () => {
    await uploadFile(false, "OpenDwgImp")
})
addCommand("OpenDwgImp", async (param: LoadFileParam) => {
  await OpenDwgImp(param, true);
})

addCommand("OpenDwg_DoNotUseCache", async () => {
    await uploadFile(true, "OpenDwgImp_DoNotUseCache")
})
addCommand("OpenDwgImp_DoNotUseCache", async (param: LoadFileParam) => {
    await OpenDwgImp(param, false);
})