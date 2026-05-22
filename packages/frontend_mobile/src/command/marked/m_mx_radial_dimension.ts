
import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { McDb, McDbArc, McDbCircle, McGeVector3d, MxCADUiPrEntity, MxCADUiPrPoint, MxCpp } from "mxcad"
import { MrxDbgUiPrBaseReturn, MxFun, MxType } from "mxdraw"
async function m_mx_radial_dimension() {

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
      // const getPoint = new MxCADUiPrPoint()
      // const pt = await getPoint.go()
      // if (getPoint.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
      // if (getPoint.getStatus() === MrxDbgUiPrBaseReturn.kNone) return
      const center = ent.center.clone()
      const vet = McGeVector3d.kXAxis.clone().mult(ent.radius)
      const entPt1 = center.clone().addvec(vet)
      mxcad.drawDimDiametric(center.x, center.y, entPt1.x, entPt1.y, ent.radius)

      break;
    } else {
      MxFun.acutPrintf(t("所选对象不是圆弧或圆"))
      continue;
    }
  }
}

addCommand("m_mx_radial_dimension", m_mx_radial_dimension)
