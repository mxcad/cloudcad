import { addCommand } from "@/plugins/mxcad/command";
import {  McObjectIdType, MxCADUiPrEntity, MxCADUiPrPoint, MxCADUtility, MxCpp } from "mxcad";
import { showToast } from "vant";
import { MrxDbgUiPrBaseReturn } from "mxdraw"
import { currentLayerNameHistoryState } from "./currentLayerNameHistoryState";
import { t } from "@/languages";
async function set_current() {
    while(true) {
        const getEnt = new MxCADUiPrEntity()
        getEnt.setMessage(t("点击选择对象"))
        const objId = await getEnt.go()
        if(getEnt.getStatus() ===  MrxDbgUiPrBaseReturn.kNone) {
            setTimeout(()=> {
                showToast(t("未选中对象, 置为当前图层失败"))
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
        getStatus.setMessage(`${t("是否将图层")}:"${ent.layer}"${t("置为")}${t("当前图层")}`)
        await getStatus.go()
        if(getStatus.getStatus() === MrxDbgUiPrBaseReturn.kCancel)  {
            ent.highlight(false)
            break;
        }
        MxCpp.getCurrentDatabase().setCurrentlyLayerName(ent.layer)
        currentLayerNameHistoryState.value.push(ent.layer)
        setTimeout(()=> {
            ent.highlight(false)
            MxCpp.getCurrentMxCAD().updateDisplay()
        }, 1000)
        showToast(t("置为当前图层成功"))
        break;
    }
}
addCommand("set_current", set_current)