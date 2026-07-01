import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { McDbEntity, McObjectId, MxCADUiPrPoint, MxCADUtility, MxCoordConvert, MxCpp } from "mxcad";
import { MxType } from "mxdraw"
export function MxGetMcDbEntityBoundingBox(aryId: McObjectId[]): any {
    let minPt: THREE.Vector3 | undefined = undefined;
    let maxPt: THREE.Vector3 | undefined = undefined;
  
    aryId.forEach((val) => {
      let ent = val.getMcDbEntity();
      if (ent == null) return;
      let bound = ent.getBoundingBox();
      if (!bound.ret) return;
      if (!minPt || !maxPt) {
        minPt = new THREE.Vector3(bound.minPt.x, bound.minPt.y, 0);
        maxPt = new THREE.Vector3(bound.maxPt.x, bound.maxPt.y, 0);
      }
      else {
        if (minPt.x > bound.minPt.x) {
          minPt.x = bound.minPt.x;
        }
        if (minPt.y > bound.minPt.y) {
          minPt.y = bound.minPt.y;
        }
  
        if (maxPt.x < bound.maxPt.x) {
          maxPt.x = bound.maxPt.x;
        }
        if (maxPt.y < bound.maxPt.y) {
          maxPt.y = bound.maxPt.y;
        }
      }
    });
    if (minPt && maxPt) {
      return { minPt: minPt, maxPt: maxPt }
    }
    else {
      return undefined;
    }
  }
  
async function m_mx_copy() {
    const aryId = MxCADUtility.getCurrentSelect();
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
    let ptBase = await getPoint.go();
    if (!ptBase) return;
  
    //getPoint.setDynamicInputType(DynamicInputType.kXYCoordInput);
    getPoint.setMessage(t("指定移动到点"));
    getPoint.setBasePt(ptBase);
    getPoint.setUseBasePt(true);
  
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
        tmp.move(ptBase as any, v);
        worldDraw.drawMcDbEntity(tmp);
      }
    });
    let ptMoveTo = await getPoint.go();
    if (!ptMoveTo) return;
    for (let i = 0; i < aryId.length; i++) {
    let tmp: McDbEntity = aryId[i].clone() as McDbEntity;
    if (!tmp) {
        continue;
    }
    tmp.move(ptBase as any, ptMoveTo);
    MxCpp.getCurrentMxCAD().drawEntity(tmp);
    }
  }
  addCommand("m_mx_copy", m_mx_copy)