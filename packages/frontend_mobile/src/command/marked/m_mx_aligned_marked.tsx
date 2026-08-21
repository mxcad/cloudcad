
import { MxFun, MxType } from "mxdraw";

import { MxCADUiPrPoint, McDbDimension, MxCpp, McObjectId, McCmColor, MxCADUiPrString, MxCADUiPrAngle, McGeVector3d, McGePoint3d, McGeMatrix3d, MxCADUiPrEntity, MxCADResbuf, McDbEntity, MxCADUtility, McDbArc, McDbCircle, McDbLine, McDbPolyline, McDb } from "mxcad";
import { DetailedResult, MrxDbgUiPrBaseReturn, McEdGetPointWorldDrawObject  } from "mxdraw"
import { calculateDistanceFromPointToLine } from "../m_mx_fillet";
import { addCommand } from "@/plugins/mxcad/command";
import { ref } from "vue";
import { Field, showConfirmDialog, showToast } from "vant";
import { t } from "@/languages";
const m_mx_aligned_marked = async () => {
  const mxcad = MxCpp.getCurrentMxCAD()
  const getPoint = new MxCADUiPrPoint()
  getPoint.setOffsetInputPostion(true)
  getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
  getPoint.setMessage(t("指定第一条尺寸界线原点"))
  getPoint.setKeyWords("[" + t("选择对象") + "(O)]")
  let pt1 = await getPoint.go()
  let pt2!: McGePoint3d | null
  if(getPoint.isKeyWordPicked("o")) {
    const getEnt = new MxCADUiPrEntity()
    getEnt.setOffsetInputPostion(true)
    getEnt.setInputToucheType(MxType.InputToucheType.kGetEnd);
    const filter = new MxCADResbuf()
    filter.AddMcDbEntityTypes("CIRCLE,ARC,LINE,LWPOLYLINE")
    let movePt!: McGePoint3d
    let oldEnt!: McDbEntity | null
    const movePtFun = (pt: McGePoint3d, pw: McEdGetPointWorldDrawObject) => {
      movePt = pt
      const objId = MxCADUtility.findEntAtPoint(pt.x, pt.y, pt.z, -1, filter)
      if (!(objId && objId.isValid())) return
      const ent = objId.getMcDbEntity()
      if (!ent) return
      if (oldEnt) oldEnt.highlight(false)
      ent.highlight(true)
      oldEnt = ent
    }
    while (true) {
      getEnt.setMessage(t("选择标注对象"))
      getEnt.setUserDraw(movePtFun)
      getEnt.setFilter(filter)
      const objId = await getEnt.go()
      const ent = objId.getMcDbEntity()
      if (oldEnt) oldEnt.highlight(false)
      if (getEnt.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
      else if (ent instanceof McDbArc) {
        const start = ent.getStartPoint().val
        const radius = ent.radius
        const vet =  McGeVector3d.kXAxis.clone().rotateBy(ent.endAngle).mult(radius)
        const center = ent.center
        const end = center.clone().addvec(vet)
        if (!start || !end) return
        pt1 = start
        pt2 = end
        break;
      }
      else if (ent instanceof McDbCircle) {
        const center = ent.center
        const start = ent.getClosestPointTo(movePt, false).val
        if(!start) return
        pt1 = start
        pt2 = start.clone().addvec(center.sub(start).mult(2))
        break;
      }
      else if (ent instanceof McDbLine) {
        pt1 = ent.startPoint
        pt2 = ent.endPoint
        break;
      }
      else if(ent instanceof McDbPolyline) {
        for (let index = 0; index < ent.numVerts(); index++) {
          const pt = ent.getPointAt(index).val
          const nextPt = ent.getPointAt(index + 1).val
          const start = ent.getClosestPointTo(movePt, false).val
          if(nextPt && calculateDistanceFromPointToLine(start, pt, nextPt) === 0) {
             pt1 = pt
             pt2 = nextPt
          }
        }
        break;
      }
      else {
        MxFun.acutPrintf("\n" + t("所选对象不是直线、圆弧或圆。"))
        continue;
      }

    }
  }
  if (!pt1) return
  if(!pt2) {
    getPoint.setMessage(t("指定第二条尺寸界线原点"))
    getPoint.setUserDraw((pt, pw)=> {
      if(!pt1) return
      pw.drawMcDbLine(pt1.x, pt1.y,pt1.z, pt.x, pt.y, pt.z,)
    })
    pt2 = await getPoint.go()
    if (!pt2) return
  }

  let text: string | undefined
  let textAngle: number | undefined
  while (true) {
    getPoint.setMessage(t("指定尺寸线位置"))
    getPoint.setKeyWords(`[${t("文本")}(T)/${t("角度")}(A)]`)
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getPoint.clearLastInputPoint()
    let id!: McObjectId
    getPoint.setUserDraw((pt) => {
      if(!pt1 || !pt2) return
      id && id.erase()
      id = mxcad.drawDimAligned(pt1.x, pt1.y, pt2.x, pt2.y, pt.x, pt.y);
      const dimension = id.getMcDbDimension()
      if(!dimension) return

      if(text) {
        dimension.dimensionText = text
      }
      if(textAngle) {
        dimension.textRotation = textAngle
      }
      dimension.trueColor = new McCmColor(0, 255, 0)
    })

    const pos = await getPoint.go()
  
    if(getPoint.isKeyWordPicked("T")) {
      const txt = ref("")
      const res = await showConfirmDialog({
          title: t("请输入标注文字"),
          message: ()=> (<Field v-model={ txt.value } label={t("内容")} placeholder={t("请输入文字")} border clearable clickable autofocus></Field>),
      })
      if(res === "cancel") continue;
      if(txt.value === "") showToast(t("内容不能为空"))
      text = txt.value
      id && id.erase()
      continue;
    }
    id && id.erase()
    if(getPoint.isKeyWordPicked("A")) {
      const getAngle = new MxCADUiPrAngle()
      getAngle.setOffsetInputPostion(true)
      getAngle.setInputToucheType(MxType.InputToucheType.kGetEnd);
      getAngle.clearLastInputPoint()
      getAngle.setMessage(t("指定标注文字的角度"))
      const val =  await getAngle.go()
      if(!val) return
      if(getAngle.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
      if(getAngle.getDetailedResult() === DetailedResult.kCoordIn) {
         textAngle = val * (Math.PI / 180)
      }else {
        textAngle = val
      }
      continue;
    }

    if(!pos) return

    id = mxcad.drawDimAligned(pt1.x, pt1.y, pt2.x, pt2.y, pos.x, pos.y);
    const dimension = id.getMcDbDimension()
    if(!dimension) return
    dimension.textPosition =  pos
    dimension.useSetTextPosition()
    if(text) {
      dimension.dimensionText = text
    }
    if(textAngle) {
      dimension.textRotation = textAngle
    }
    dimension.trueColor = new McCmColor(0, 255, 0)
    mxcad.updateDisplay();
    break;
  }
}

addCommand("m_mx_aligned_marked", m_mx_aligned_marked)
