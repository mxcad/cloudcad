import { addCommand } from "@/plugins/mxcad/command";
import { getMxwebBlob } from "../services/saveService";
import { triggerBlobDownload } from "../utils/download";
import { t } from "@/languages";
import { showToast } from "vant";
import { useEditorStore } from "../stores/editor";

async function Mx_SaveAsMxWeb() {
  try {
    const blob = await getMxwebBlob();
    const baseName = useEditorStore().state.fileName.replace(/\.[^/.]+$/, "") || "drawing";
    triggerBlobDownload(blob, `${baseName}.mxweb`);
    showToast(t("文件已保存到本地"));
  } catch (e) {
    showToast(t("保存失败"));
  }
}

addCommand("Mx_SaveAsMxWeb", Mx_SaveAsMxWeb);
