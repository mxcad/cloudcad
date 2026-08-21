import { addCommand } from "@/plugins/mxcad/command";
import {  McObjectIdType, MxCADUiPrEntity, MxCADUiPrPoint, MxCADUtility, MxCpp } from "mxcad";
import { showConfirmDialog, showToast } from "vant";
import { MrxDbgUiPrBaseReturn } from "mxdraw"
import { Layer } from "./layer_list";
import { t } from "@/languages";
async function turn_off_other_layers() {
    while(true) {
        const getEnt = new MxCADUiPrEntity()
        getEnt.setMessage(t("点击选择对象"))
        const objId = await getEnt.go()
        if(getEnt.getStatus() ===  MrxDbgUiPrBaseReturn.kNone) {
            setTimeout(()=> {
                showToast(t("未选中对象")+  ","+  t("无法确定需要关闭的图层"))
            })
            break
        }
        if(getEnt.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
        if(!objId) continue
        if(objId.type === McObjectIdType.kInvalid) continue;
        if(objId.isErase()) continue;
        if(!objId.isValid()) continue;
        const ent = objId.getMcDbEntity()
        if(!ent) break
        if(!ent.layer) break
        ent.highlight(true)
        const getStatus =  new MxCADUiPrPoint()
        getStatus.setMessage(`${t("是否关闭除该对象所在图层")}"${ent.layer}"${t("以外的")}${t("所有图层")}`)
        await getStatus.go()
        if(getStatus.getStatus() === MrxDbgUiPrBaseReturn.kCancel)  {
            ent.highlight(false)
            break;
        }
        const layerTable = MxCpp.getCurrentDatabase().getLayerTable()
        const json  =JSON.parse(layerTable.getJson()) as Layer[]
        json.forEach((layerInfo)=> {
            if(ent.layer === layerInfo.name) return
            layerInfo.off = 1
        })

        layerTable.setJson(JSON.stringify(json))
        MxCpp.getCurrentMxCAD().updateLayerDisplayStatus()
        MxCpp.getCurrentMxCAD().updateDisplay()
        setTimeout(()=> {
            ent.highlight(false)
            MxCpp.getCurrentMxCAD().updateDisplay()
        }, 1000)
        showToast(t("成功关闭除该对象所在图层以外的所有图层"))
        break;
    }
}
addCommand("turn_off_other_layers", turn_off_other_layers)