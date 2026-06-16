import { addCommand } from "@/plugins/mxcad/command";
import { getMxwebBlob } from "../services/saveService";
import { t } from "@/languages";
import { showToast } from "vant";

async function Mx_SaveAsMxWeb() {
  try {
    const blob = await getMxwebBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drawing.mxweb";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t("文件已保存到本地"));
  } catch (e) {
    showToast(t("保存失败"));
  }
}

addCommand("Mx_SaveAsMxWeb", Mx_SaveAsMxWeb);
