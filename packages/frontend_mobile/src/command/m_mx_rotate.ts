import { McObjectId, MxCADUtility, MxCADSelectionSet, MxCADUiPrPoint, MxCADUiPrAngle, _ML_String, McGeVector3d, McGeMatrix3d, McGePoint3d, MxCoordConvert, McDbEntity, MxCADUiPrDist, MxCpp } from "mxcad";
import { MxGetMcDbEntityBoundingBox } from "./m_mx_copy";
import { DetailedResult, MxType } from "mxdraw"
import { addCommand } from "@/plugins/mxcad/command";
import { t } from "@/languages";
export async function m_mx_rotate() {
    let aryId = MxCADUtility.getCurrentSelect();
    if(aryId.length === 0) return
  
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
    getPoint.setMessage("\n" + t("指定基点"));
    let ptBase = await getPoint.go();
    if (ptBase == null) return;
    let isCopy = false
    // ‍  参照角
// ‍ Reference angle

    let refAngle = 0
    const getAngle = new MxCADUiPrAngle()
    getAngle.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getAngle.setOffsetInputPostion(true)
    getAngle.setMessage(_ML_String("Entity_Rotate_Angle", t("指定旋转角度")))
    getAngle.setKeyWords(`[${t("复制")}(C)/${t("参照")}(R)]`)
    getAngle.setBasePt(ptBase);
    getAngle.setUseBasePt(true);
    //getAngle.setDynamicInputType(DynamicInputType.kXYCoordInput);
  
    while (true) {
      
      getAngle.setUserDraw((v, worldDraw) => {
        let curPoint = v;
        let basePoint = (ptBase as any);
        let vec = curPoint.sub(basePoint);
        let ang = vec.angleTo2(McGeVector3d.kXAxis, McGeVector3d.kNegateZAxis) - refAngle;
  
        let mat = new McGeMatrix3d();
        mat.setToRotation(ang, McGeVector3d.kZAxis, basePoint);
  
        if (minPt && maxPt) {
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
        mat.setToRotation(ang, McGeVector3d.kZAxis, basePoint);
  
        for (let i = 0; i < aryId.length && i < 10; i++) {
          let tmp: McDbEntity = aryId[i].clone() as McDbEntity;
          if (!tmp) {
            continue;
          }
          tmp.transformBy(mat);
          worldDraw.drawMcDbEntity(tmp);
        }
      });
      let val = await getAngle.go();
      if (getAngle.isKeyWordPicked("C")) {
        isCopy = true
        continue;
      }
      if (getAngle.isKeyWordPicked("R")) {
        const getAngle = new MxCADUiPrDist()
        getAngle.setInputToucheType(MxType.InputToucheType.kGetEnd);
        getAngle.setOffsetInputPostion(true)
        getAngle.setMessage(_ML_String("Entity_Rotate_Ref_Angle", t("指定参照角") + ":<" + (refAngle / (Math.PI / 180)).toFixed(3) + ">"))
        getAngle.setKeyWords("")
        getAngle.setBasePt(ptBase)
        getAngle.setUseBasePt(true)
        let _refAngle = 0
        getAngle.setUserDraw((pt) => {
          if (!ptBase) return
          let vec = pt.sub(ptBase);
          _refAngle = vec.angleTo2(McGeVector3d.kXAxis, McGeVector3d.kNegateZAxis)
        })
        const val = await getAngle.go()
        if (typeof val !== "number") return
        if (getAngle.getDetailedResult() === DetailedResult.kCoordIn) {
          refAngle = val;
        } else if (_refAngle !== 0) {
          refAngle = _refAngle
        }
        continue;
      }
      if (!val) return;
      
      let basePoint = ptBase
      let mat = new McGeMatrix3d();
      mat.setToRotation(val, McGeVector3d.kZAxis, basePoint);
      const isMcDbEntity = (idObj: any): idObj is McDbEntity => idObj instanceof McDbEntity
      if (isCopy) {
        const cAryId: McObjectId[] = []
        for (let i = 0; i < aryId.length; i++) {
          let tmp = aryId[i].clone();
          if (!tmp) {
            continue;
          }
          if (isMcDbEntity(tmp)) {
            tmp.transformBy(mat);
            cAryId.push(MxCpp.getCurrentMxCAD().drawEntity(tmp));
          }
        }
        return cAryId
      } else {
        for (let i = 0; i < aryId.length; i++) {
          let tmp: McDbEntity = aryId[i].getMcDbObject() as McDbEntity;
          if (!tmp) {
            continue;
          }
          tmp.transformBy(mat);
        }
        return aryId
      }
  
    }
  }

  addCommand("m_mx_rotate", m_mx_rotate)