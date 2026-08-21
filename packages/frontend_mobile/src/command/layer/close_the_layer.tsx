import { addCommand } from "@/plugins/mxcad/command";
import {  McObjectIdType, MxCADUiPrEntity, MxCADUiPrPoint, MxCADUtility, MxCpp } from "mxcad";
import { showConfirmDialog, showToast } from "vant";
import { MrxDbgUiPrBaseReturn } from "mxdraw"
import { t } from "@/languages";
async function close_the_layer() {
    while(true) {
        const getEnt = new MxCADUiPrEntity()
        getEnt.setMessage(t("点击选择对象"))
        const objId = await getEnt.go()
        if(getEnt.getStatus() ===  MrxDbgUiPrBaseReturn.kNone) {
            setTimeout(()=> {
                showToast(t("未选中对象, 无法关闭图层"))
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
        const layerId = MxCpp.getCurrentDatabase().getLayerTable().get(ent.layer)
        const layerRecord = layerId.getMcDbLayerTableRecord()
        if(!layerRecord) {
            ent.highlight(false)
            setTimeout(()=> {
                showToast(t("获取该对象图层失败"))
            })
            break
        }
        const call = ()=> {
            layerRecord.isOff = true
            setTimeout(()=> {
                ent.highlight(false)
                MxCpp.getCurrentMxCAD().updateDisplay()
            }, 1000)
            showToast(t("成功关闭该对象所在图层"))
        }
        if(ent.layer === MxCpp.getCurrentDatabase().getCurrentlyLayerName()) {
            const dialogAction  = await showConfirmDialog({
                message: t("所选图层为当前图层") + "," +  t("是否关闭") +"？",
            })
            if(dialogAction === "cancel") {
                ent.highlight(false)
                continue;
            }
            call()
            break;
        }
        getStatus.setMessage(`${t("是否关闭该对象所在图层")}"${ent.layer}"`)
        await getStatus.go()
        if(getStatus.getStatus() === MrxDbgUiPrBaseReturn.kCancel)  {
            ent.highlight(false)
            break;
        }
        call()
        break;
    }
}
addCommand("close_the_layer", close_the_layer)