import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { McDbEllipse, McGePoint3d, MxCADUiPrPoint, MxCpp } from "mxcad";
import { MxType, MrxDbgUiPrBaseReturn } from "mxdraw"
async function m_mx_elliptical() {
    const getPoint = new MxCADUiPrPoint()
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd)
    getPoint.setMessage(t("指定椭圆的轴端点"))
    const endPt1 = await getPoint.go()
    if(!endPt1) return
    getPoint.setMessage(t("指定轴的另一个端点"))
    getPoint.setBasePt(endPt1)
    const endPt2 = await getPoint.go()
    if(!endPt2) return
    getPoint.setMessage(t("指定长度"))
    const create = (endPt1: McGePoint3d, endPt2: McGePoint3d, pt: McGePoint3d)=> {
        const ellipse = new McDbEllipse()
        ellipse.center =  new McGePoint3d((endPt1.x + endPt2.x) / 2, (endPt1.y + endPt2.y) / 2)
        ellipse.majorAxis =  endPt1.sub(endPt2)
        ellipse.minorAxis = endPt1.sub(endPt2)
        ellipse.radiusRatio = (ellipse.center.distanceTo(pt) / 2) / (endPt1.distanceTo(endPt2) / 2)
        return ellipse
    }
    getPoint.setUserDraw((pt, pw)=> {
        pw.drawMcDbEntity(create(endPt1, endPt2, pt))
    })
    getPoint.setUseBasePt(false)
    const distPoint = await getPoint.go()
    if(distPoint) {
        MxCpp.getCurrentMxCAD().drawEntity(create(endPt1, endPt2, distPoint))
    }
}

addCommand("m_mx_elliptical", m_mx_elliptical)