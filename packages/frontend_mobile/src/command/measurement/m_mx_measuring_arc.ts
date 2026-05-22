import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { keepDecimal } from "@/utils/number";
import { McDbArc, MxCADUiPrPoint, MxCpp } from "mxcad";
import { MxType } from "mxdraw"
import { showToast } from "vant";
async function m_mx_measuring_arc() {
    while(true) {
        const getPoint = new MxCADUiPrPoint()
        getPoint.setOffsetInputPostion(true)
        getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
        getPoint.clearLastInputPoint()
        getPoint.setMessage(t("指定圆弧起点"))
        const startPoint = await getPoint.go()
        if(!startPoint) return
        getPoint.setUserDraw((pt, pw)=> {
            pw.drawLine(pt, startPoint)
        })
        getPoint.setMessage(t("指定圆弧端点"))
        const endPoint = await getPoint.go()
        if(!endPoint) return
        getPoint.setUserDraw((pt, pw)=> {
            const arc = new McDbArc()
            arc.computeArc(startPoint.x, startPoint.y, pt.x, pt.y, endPoint.x, endPoint.y)
            pw.drawMcDbEntity(arc)
            showToast(t("弧长") + ":" + keepDecimal(arc.getLength().val, 4).toString())
        })
        getPoint.setMessage(t("指定圆弧中间点"))
        await getPoint.go()
    }
}

addCommand("m_mx_measuring_arc", m_mx_measuring_arc)