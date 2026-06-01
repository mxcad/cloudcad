import { openMxWeb } from "@/plugins/mxcad/openMxWeb";
import { showFilePicker, FilePickerResult } from "@/composables/useNativeFilePicker";
import { showLoadingToast } from "vant";
import { showToastOnce } from "@/utils/toast";
import { checkPublicFileExternalRefs } from "@/composables/useFileLoader";
import { FetchAttributes, MxCpp } from "mxcad";
import { addCommand } from "@/plugins/mxcad/command";
import { t } from "@/languages";

async function OpenDwgImp(param: FilePickerResult, noCache: boolean): Promise<boolean> {
    const fileHash = param.hash;
    const type = param.type;
    const file = param.file;

    if (type === "mxweb") {
        const filePath = URL.createObjectURL(file.source);
        setTimeout(() => openMxWeb(filePath));
        return true;
    }

    // 外部参照检查 (仅新上传的文件需要)
    if (!param.isUseServerExistingFile) {
        const toast = showLoadingToast(t("检查外部参照") + "...");
        await checkPublicFileExternalRefs(fileHash);
        toast.close();
    }

    // 打开文件
    const toast = showLoadingToast(t("打开图纸中") + "...");
    const filePath = "/api/v1/public-file/access/" + fileHash + "." + type + ".mxweb";

    const token = localStorage.getItem("accessToken");
    const headers = token ? { requestHeaders: { Authorization: "Bearer " + token } } : undefined;

    const fetchAttrib = noCache
        ? FetchAttributes.EMSCRIPTEN_FETCH_LOAD_TO_MEMORY | FetchAttributes.EMSCRIPTEN_FETCH_PERSIST_FILE | FetchAttributes.EMSCRIPTEN_FETCH_REPLACE
        : 0;

    const mxcad = MxCpp.App.getCurrentMxCAD();
    const openTime = Date.now();

    return new Promise<boolean>((resolve) => {
        mxcad.openWebFile(filePath, (iRet) => {
            toast.close();
            if (iRet === 0) {
                if (Date.now() - openTime > 5000) {
                    showToastOnce(t("更新显示") + "...");
                }
                resolve(true);
            } else {
                showToastOnce(t("打开图纸失败"));
                resolve(false);
            }
        }, undefined, headers, fetchAttrib);
    });
}


addCommand("OpenDwg", async () => {
    showFilePicker(async (param) => {
        await OpenDwgImp(param, false);
    }, false);
})

addCommand("OpenDwg_DoNotUseCache", async () => {
    showFilePicker(async (param) => {
        await OpenDwgImp(param, true);
    }, true);
})
