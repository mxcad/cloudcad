import { addCommand } from "@/plugins/mxcad/command";
import { MxCADUtility, MxCADUiPrPoint, MxCoordConvert, McDbEntity } from "mxcad";
import { MxGetMcDbEntityBoundingBox } from "./m_mx_copy";
import { MxType} from "mxdraw"
import { t } from "@/languages";
export async function m_mx_move() {
    let aryId = MxCADUtility.getCurrentSelect();
    if(aryId.length === 0) return
    let minPt: THREE.Vector3;
    let maxPt: THREE.Vector3;
    if (aryId.length >= 10) {
      let retBox = MxGetMcDbEntityBoundingBox(aryId);
      if (retBox) {
        minPt = retBox.minPt;
        maxPt = retBox.maxPt;
      }
    }

    let getPoint = new MxCADUiPrPoint();
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getPoint.setOffsetInputPostion(true)
    getPoint.setMessage("\n" + t("指定基点"));
    getPoint.clearLastInputPoint();
    let ptBase = await getPoint.go();
    if (!ptBase) return;
  
    getPoint.setMessage(t("指定移动到点"));
    getPoint.setBasePt(ptBase);
    getPoint.setUseBasePt(true);
    //getPoint.setDynamicInputType(DynamicInputType.kXYCoordInput);
  
    getPoint.setUserDraw((v, worldDraw) => {
  
      if (minPt && maxPt) {
        let xf = v.x - (ptBase as any).x;
        let yf = v.y - (ptBase as any).y;
        let tmpPt1 = new THREE.Vector3(minPt.x + xf, maxPt.y + yf, 0);
        let tmpPt2 = new THREE.Vector3(maxPt.x + xf, minPt.y + yf, 0);
        let tmpPt3 = new THREE.Vector3(tmpPt1.x, tmpPt2.y, 0);
        let tmpPt4 = new THREE.Vector3(tmpPt2.x, tmpPt1.y, 0);
        tmpPt1 = MxCoordConvert.cad2doc2(tmpPt1.x, tmpPt1.y, tmpPt1.z);
        tmpPt2 = MxCoordConvert.cad2doc2(tmpPt2.x, tmpPt2.y, tmpPt2.z);
        tmpPt3 = MxCoordConvert.cad2doc2(tmpPt3.x, tmpPt3.y, tmpPt3.z);
        tmpPt4 = MxCoordConvert.cad2doc2(tmpPt4.x, tmpPt4.y, tmpPt4.z);
  
        worldDraw.drawLine(tmpPt4, tmpPt1);
        worldDraw.drawLine(tmpPt1, tmpPt3);
        worldDraw.drawLine(tmpPt3, tmpPt2);
        worldDraw.drawLine(tmpPt2, tmpPt4);
      }
  
      for (let i = 0; i < aryId.length && i < 10; i++) {
        let tmp: McDbEntity = aryId[i].clone() as McDbEntity;
        if (!tmp) {
          continue;
        }
        tmp.move((ptBase as any), v);
        worldDraw.drawMcDbEntity(tmp);
      }
    });
  
    let ptMoveTo = await getPoint.go();
    if (!ptMoveTo) return;
  
    for (let i = 0; i < aryId.length; i++) {
      let tmp: McDbEntity = aryId[i].getMcDbObject() as McDbEntity;
      if (!tmp) {
        continue;
      }
      tmp.move((ptBase as any), ptMoveTo);
    }
  }

  addCommand("m_mx_move", m_mx_move)