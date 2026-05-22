import { addCommand } from "@/plugins/mxcad/command";
import { MxCpp } from "mxcad";
import { Layer } from "./layer_list"
// ‍  打开所有图层
// ‍ Open all layers

function layer_fully_closed() {
    const layerTable = MxCpp.getCurrentDatabase().getLayerTable()
    const json = JSON.parse( MxCpp.getCurrentDatabase().getLayerTable().getJson()) as Layer[]
    json.forEach((item)=> {
        item.off = 1
    })
    layerTable.setJson(JSON.stringify(json))
    MxCpp.getCurrentMxCAD().updateLayerDisplayStatus()
    MxCpp.getCurrentMxCAD().updateDisplay()
}

addCommand("layer_fully_closed", layer_fully_closed)