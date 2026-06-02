import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { McDbArc, MxCADUiPrPoint, MxCpp } from "mxcad";
import { MxType } from "mxdraw"
async function m_mx_arc() {
    const getPoint = new MxCADUiPrPoint()
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getPoint.clearLastInputPoint()
    getPoint.setMessage(t("指定圆弧起点"))
    const startPoint = await getPoint.go()
    if(!startPoint) return
    getPoint.setUserDraw((pt, pw)=> {
        pw.drawLine(pt.toVector3(), startPoint.toVector3())
    })
    getPoint.setMessage(t("指定圆弧端点"))
    const endPoint = await getPoint.go()
    if(!endPoint) return
    getPoint.setUserDraw((pt, pw)=> {
        const arc = new McDbArc()
        arc.computeArc(startPoint.x, startPoint.y, pt.x, pt.y, endPoint.x, endPoint.y)
        pw.drawMcDbEntity(arc)
    })
    getPoint.setMessage(t("指定圆弧中间点"))
    const midPoint = await getPoint.go()
    if(midPoint) {
        const arc = new McDbArc()
        arc.computeArc(startPoint.x, startPoint.y, midPoint.x, midPoint.y, endPoint.x, endPoint.y)
        MxCpp.getCurrentMxCAD().drawEntity(arc)
    }
}

addCommand("m_mx_arc", m_mx_arc)