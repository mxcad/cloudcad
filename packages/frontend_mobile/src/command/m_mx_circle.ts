import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { McDbCircle, MxCADUiPrPoint, MxCpp } from "mxcad";
import { MrxDbgUiPrBaseReturn, MxType } from "mxdraw"
async function m_mx_circle() {
    const getPoint = new MxCADUiPrPoint()
    getPoint.clearLastInputPoint()
    getPoint.setMessage(t("指定圆心"))
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getPoint.setOffsetInputPostion(true)
    const center = await getPoint.go()
    if(!center) return
    
    getPoint.setUserDraw((pt, pw)=> {
        const circle = new McDbCircle()
        circle.center = center
        circle.radius = center.distanceTo(pt)
        pw.drawMcDbEntity(circle)
    })
    
    getPoint.setMessage("指定半径")
    const radiusPoint = await getPoint.go()
    if(radiusPoint) {
        const circle = new McDbCircle()
        circle.center = center
        circle.radius = center.distanceTo(radiusPoint)
        MxCpp.getCurrentMxCAD().drawEntity(circle)
    }
}

addCommand("m_mx_circle", m_mx_circle)