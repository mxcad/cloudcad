import { openMxWeb } from "@/plugins/mxcad/openMxWeb";
import { showFilePicker, FilePickerResult } from "@/composables/useNativeFilePicker";
import { showToastOnce } from "@/utils/toast";
import { checkPublicFileExternalRefs } from "@/composables/useFileLoader";
import { useEditorState } from "@/composables/useEditorState";
import { FetchAttributes, MxCpp } from "mxcad";
import { addCommand } from "@/plugins/mxcad/command";
import { t } from "@/languages";

async function OpenDwgImp(param: FilePickerResult, noCache: boolean): Promise<boolean> {
    const editorState = useEditorState();
    const fileHash = param.hash;
    const type = param.type;
    const file = param.file;

    if (type === "mxweb") {
        const filePath = URL.createObjectURL(file.source);
        editorState.resetFileState();
        editorState.setProgressStage('opening');
        editorState.setLoading(true);
        const opened = await openMxWeb(filePath);
        editorState.setLoading(false);
        if (opened) {
            editorState.setIsActive(true);
            editorState.setFileName(param.name);
            editorState.setIsPublicFile(true);
            editorState.setFileHash(fileHash);
        } else {
            showToastOnce(t('打开图纸失败'));
        }
        return opened;
    }

    // 打开/转换文件（上传已完成）
    editorState.resetFileState();

    if (param.isUseServerExistingFile) {
        // 服务端已有文件，直接打开
        editorState.setProgressStage('opening');
    } else {
        // 新上传的文件，先转换再打开
        editorState.setProgressStage('converting');
        await checkPublicFileExternalRefs(fileHash);
        editorState.setProgressStage('opening');
    }
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
            editorState.setLoading(false);
            if (iRet === 0) {
                editorState.setIsActive(true);
                editorState.setFileName(param.name);
                editorState.setIsPublicFile(true);
                editorState.setFileHash(fileHash);
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
    }, false, true);
})

addCommand("OpenDwg_DoNotUseCache", async () => {
    showFilePicker(async (param) => {
        await OpenDwgImp(param, true);
    }, true, true);
})
