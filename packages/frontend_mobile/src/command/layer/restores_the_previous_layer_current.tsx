import { addCommand } from "@/plugins/mxcad/command";
import { currentLayerNameHistoryState } from "./currentLayerNameHistoryState";
import { showToast } from "vant";
import { MxCpp } from "mxcad";
import { t } from "@/languages";
function restores_the_previous_layer_current() {
  if(currentLayerNameHistoryState.value.length === 0) {
    return setTimeout(()=> showToast(t("没有上一置顶图层状态")))
  }
  const layerName = currentLayerNameHistoryState.value.pop()
  if(!layerName) return
  MxCpp.getCurrentDatabase().setCurrentlyLayerName(layerName)
  setTimeout(()=> showToast(t("已恢复上一置顶图层")))
}
addCommand("restores_the_previous_layer_current", restores_the_previous_layer_current)