import { addCommand } from "@/plugins/mxcad/command";
import { MxCADUiPrPoint, MxCpp } from "mxcad";
import { MxType } from "mxdraw"
async function m_mx_point() {
    const getPoint = new MxCADUiPrPoint()
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd)
    const pt = await getPoint.go()
    if(!pt) return
    MxCpp.getCurrentMxCAD().drawPoint(pt.x, pt.y)
}

addCommand("m_mx_point", m_mx_point)