import { addCommand } from "@/plugins/mxcad/command";
import { exportDrawing } from "../services/exportService";
import { t } from "@/languages";
import { showToast } from "vant";

// 本地另存为 MXWEB：与导出面板「另存为」共用 exportDrawing 的 mxweb 分支，
// 这里只做命令注册与失败兜底，勿重写取 blob / 触发下载的逻辑
async function Mx_SaveAsMxWeb() {
  try {
    await exportDrawing("mxweb");
  } catch (e) {
    showToast(t("保存失败"));
  }
}

addCommand("Mx_SaveAsMxWeb", Mx_SaveAsMxWeb);
