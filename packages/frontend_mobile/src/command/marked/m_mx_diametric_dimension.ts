
import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { McDb, McDbArc, McDbCircle, McDbLine, McGeVector3d, MxCADUiPrEntity, MxCADUiPrPoint, MxCpp } from "mxcad"
import { MrxDbgUiPrBaseReturn, MxFun, MxType } from "mxdraw"
async function m_mx_diametric_dimension() {

  const mxcad = MxCpp.getCurrentMxCAD()
  // mxcad.drawDimDiametric(500, 0, -500, 0, 20);
  mxcad.addDimStyle("MyDimStyle2", "41,0.18,141,0.09,40,200", "77,1,271,3", "", "");
  mxcad.drawDimStyle = "MyDimStyle2"
  while (true) {
    const getEnt = new MxCADUiPrEntity()
    getEnt.setOffsetInputPostion(true)
    getEnt.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getEnt.setMessage(t("选择圆弧或者圆"))
    const entId = await getEnt.go()
    if (getEnt.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
    if (getEnt.getStatus() === MrxDbgUiPrBaseReturn.kNone) return
    const ent = entId.getMcDbEntity()
    if (ent instanceof McDbArc || ent instanceof McDbCircle) {
      const getPoint = new MxCADUiPrPoint()
      getPoint.setOffsetInputPostion(true)
      getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
      getPoint.setMessage(t("指定对角点"))
      const pt = await getPoint.go()
      if (getPoint.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
      if (getPoint.getStatus() === MrxDbgUiPrBaseReturn.kNone) return
      if (pt) {
        const center = ent.center.clone()
        const vet = pt.sub(center).normalize().mult(ent.radius)
        const entPt1 = center.clone().addvec(vet)
        const entPt2 = center.clone().addvec(vet.clone().negate())
        const length = Math.min(entPt2.distanceTo(pt), entPt1.distanceTo(pt))
        mxcad.drawDimDiametric(entPt1.x, entPt1.y, entPt2.x, entPt2.y, length)
      }
      break;
    } else {
      MxFun.acutPrintf(t("所选对象不是圆弧或圆"))
      continue;
    }
  }
}

addCommand("m_mx_diametric_dimension", m_mx_diametric_dimension)
