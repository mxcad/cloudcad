import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { McDbLine, MxCADUiPrPoint, MxCpp } from "mxcad";
import { MrxDbgUiPrBaseReturn, MxType } from "mxdraw"
async function m_mx_line() {
    const getPoint = new MxCADUiPrPoint()
    getPoint.clearLastInputPoint()
    getPoint.setMessage(t("指定第一个点"))
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    const startPoint = await getPoint.go()
    if(!startPoint) return
    // ‍  获取第二个点
// ‍ Obtain the second point

    getPoint.setUserDraw((pt, pw)=> {
        const line = new McDbLine(startPoint, pt)
        pw.drawMcDbEntity(line)
    })
    getPoint.setMessage(t("指定第二个点"))
    let endPoint = await getPoint.go()
    if(getPoint.getStatus() === MrxDbgUiPrBaseReturn.kNone) {
        return getPoint.drawReserve()
    }
    if(!endPoint) return
    const line = new McDbLine(startPoint, endPoint)
    MxCpp.getCurrentMxCAD().drawEntity(line)
}

addCommand("m_mx_line", m_mx_line)