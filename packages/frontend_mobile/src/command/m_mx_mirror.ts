import { MxCADUtility, MxCADUiPrPoint, McGeMatrix3d, McGePoint3d, MxCoordConvert, McDbEntity, MxCADUiPrKeyWord, MxCpp } from "mxcad";
import { MxGetMcDbEntityBoundingBox } from "./m_mx_copy";
import { addCommand } from "@/plugins/mxcad/command";
import { DynamicInputType, MrxDbgUiPrBaseReturn, MxType } from "mxdraw"
import { t } from "@/languages";
async function m_mx_mirror() {
    let aryId = MxCADUtility.getCurrentSelect();
    if (aryId.length == 0) return
  
    let minPt: THREE.Vector3;
    let maxPt: THREE.Vector3;
  
    let retBox = MxGetMcDbEntityBoundingBox(aryId);
    if (retBox) {
      minPt = retBox.minPt;
      maxPt = retBox.maxPt;
    }
  
    let getPoint = new MxCADUiPrPoint();
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getPoint.setOffsetInputPostion(true)
    getPoint.setMessage(t("指定基点"));
    let ptBase = await getPoint.go();
    if (ptBase == null) return;
  
    getPoint.setMessage(t("指定镜向点"));
    getPoint.setBasePt(ptBase);
    getPoint.setUseBasePt(true);
  
    getPoint.setUserDraw((v, worldDraw) => {
      if (minPt && maxPt) {
        let mat = new McGeMatrix3d();
        mat.setMirror(ptBase as any, v);
        let tmpPt1 = new McGePoint3d(minPt.x, maxPt.y, 0);
        let tmpPt2 = new McGePoint3d(maxPt.x, minPt.y, 0);
        let tmpPt3 = new McGePoint3d(tmpPt1.x, tmpPt2.y, 0);
        let tmpPt4 = new McGePoint3d(tmpPt2.x, tmpPt1.y, 0);
        tmpPt1.transformBy(mat);
        tmpPt2.transformBy(mat);
        tmpPt3.transformBy(mat);
        tmpPt4.transformBy(mat);
  
        tmpPt1 = MxCoordConvert.cad2doc(tmpPt1);
        tmpPt2 = MxCoordConvert.cad2doc(tmpPt2);
        tmpPt3 = MxCoordConvert.cad2doc(tmpPt3);
        tmpPt4 = MxCoordConvert.cad2doc(tmpPt4);
  
        worldDraw.drawLine(tmpPt4.toVector3(), tmpPt1.toVector3());
        worldDraw.drawLine(tmpPt1.toVector3(), tmpPt3.toVector3());
        worldDraw.drawLine(tmpPt3.toVector3(), tmpPt2.toVector3());
        worldDraw.drawLine(tmpPt2.toVector3(), tmpPt4.toVector3());
      }
  
      for (let i = 0; i < aryId.length && i < 10; i++) {
        let tmp: McDbEntity = aryId[i].clone() as McDbEntity;
        if (!tmp) {
          continue;
        }
        tmp.mirror(ptBase as any, v);
        worldDraw.drawMcDbEntity(tmp);
      }
    });
  
    getPoint.setDynamicInputType(DynamicInputType.kXYCoordInput);
    let ptBase2 = await getPoint.go();
    if (!ptBase2) return;
    const getKey = new MxCADUiPrKeyWord()
    getKey.clearLastInputPoint()
    getKey.setMessage(`${t("要删除源对象吗")}？<N>`)
    getKey.setKeyWords(`[${t("是")}(Y)/${t("否")}(N)]`)
    const key = await getKey.go()
    if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kCancel) {
      return
    }
    for (let i = 0; i < aryId.length; i++) {
      let tmp: McDbEntity = aryId[i].clone() as McDbEntity;
      if (!tmp) {
        continue;
      }
      tmp.mirror(ptBase as any, ptBase2);
      MxCpp.getCurrentMxCAD().drawEntity(tmp);
    }
  
    if (key?.toLocaleLowerCase() === "y") {
      for (let i = 0; i < aryId.length; i++) {
        aryId[i].erase()
      }
    }
}
addCommand("m_mx_mirror", m_mx_mirror)