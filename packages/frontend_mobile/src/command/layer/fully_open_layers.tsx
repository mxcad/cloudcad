import { addCommand } from "@/plugins/mxcad/command";
import { MxCpp } from "mxcad";
import { Layer } from "./layer_list"
import { showToast } from "vant";
import { t } from "@/languages";
// ‍  打开所有图层
// ‍ Open all layers

function fully_open_layers() {
    const layerTable = MxCpp.getCurrentDatabase().getLayerTable()
    const json = JSON.parse(layerTable.getJson()) as Layer[]
    json.forEach((item)=> {
        item.off = 0
    })
    layerTable.setJson(JSON.stringify(json))
    MxCpp.getCurrentMxCAD().updateLayerDisplayStatus()
    MxCpp.getCurrentMxCAD().updateDisplay()
    showToast(t("所有图层均已打开"))
}

addCommand("fully_open_layers", fully_open_layers)