import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { McDbPolyline, McGePoint3d, MxCADUiPrPoint, MxCpp } from "mxcad";
import { MrxDbgUiPrBaseReturn, MxType } from "mxdraw"
async function m_mx_rect() {
    const getPoint = new MxCADUiPrPoint()
    getPoint.clearLastInputPoint()
    getPoint.setMessage(t("指定第一个点"))
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    const pt1 = await getPoint.go()
    if(!pt1) return
    getPoint.setMessage(t("指定第二个点"))
    const createRect = (pt1: McGePoint3d, pt3: McGePoint3d)=> {
        const pt2 = new McGePoint3d(pt1.x, pt3.y, pt1.z);
        const pt4 = new McGePoint3d(pt3.x, pt1.y, pt3.z);
        const pl = new McDbPolyline();
        pl.addVertexAt(pt1)
        pl.addVertexAt(pt2)
        pl.addVertexAt(pt3)
        pl.addVertexAt(pt4)
        pl.isClosed = true
        return pl
    }
    getPoint.setUserDraw((pt3, pw)=> {
        const rect = createRect(pt1, pt3)
        pw.drawMcDbEntity(rect)
    })
    const pt3 = await getPoint.go()
    if(pt3) {
        const rect = createRect(pt1, pt3)
        MxCpp.getCurrentMxCAD().drawEntity(rect)
    }
}

addCommand("m_mx_rect", m_mx_rect)