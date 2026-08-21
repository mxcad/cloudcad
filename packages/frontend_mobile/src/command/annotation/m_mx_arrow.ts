import { McEdGetPointWorldDrawObject, MxDbArrow, MxFun, MrxDbgUiPrPoint, MxType } from "mxdraw"
import { MxCADUiPrPoint, MxCpp } from "mxcad";
import { addCommand } from "@/plugins/mxcad/command";
function getScreenPixel(pixel: number, isFontSize?: boolean): number {
    let _pixel = MxFun.screenCoordLong2World(isFontSize ? pixel : pixel - pixel / 3)
    _pixel = MxFun.worldCoordLong2Doc(_pixel)
    return _pixel
}
export async function m_mx_arrow() {
    const lines = new MxDbArrow()
    const getPoint = new MxCADUiPrPoint()
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    lines.setLineWidth(10)
    lines.innerOffset = getScreenPixel(10)
    lines.outerOffset = getScreenPixel(22)
    lines.topOffset = getScreenPixel(36)
    lines.color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();
    const pt1 = await getPoint.go()
    if(!pt1) return
    lines.startPoint = pt1?.toVector3()
    getPoint.setUserDraw((pt, pw)=> {
        lines.endPoint = pt.toVector3()
        pw.drawCustomEntity(lines)
    })
    const pt2 = await getPoint.go()
    if(!pt2) return
    lines.endPoint = pt2?.toVector3()
    MxCpp.getCurrentMxCAD().mxdraw.addMxEntity(lines)
}

addCommand("m_mx_arrow", m_mx_arrow)