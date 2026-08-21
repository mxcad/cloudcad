///////////////////////////////////////////////////////////////////////////////
// ‍ 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// ‍ Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.

// ‍ 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// ‍ The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement

// ‍ 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// ‍ This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials

//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { MxFun, MxType } from "mxdraw";
// import { calculateDistanceFromPointToLine } from "@/utils/geometric/calculateDistanceFromPointToLine";
import { MxCADUiPrPoint, McDbDimension, MxCpp, McObjectId, McCmColor, MxCADUiPrString, MxCADUiPrAngle, McGeVector3d, McGePoint3d, McGeMatrix3d, MxCADUiPrEntity, MxCADResbuf, McDbEntity, MxCADUtility, McDbArc, McDbCircle, McDbLine, McDbPolyline, McDb } from "mxcad";
import { DetailedResult, MrxDbgUiPrBaseReturn, McEdGetPointWorldDrawObject  } from "mxdraw"
import { addCommand } from "@/plugins/mxcad/command";
import { t } from "@/languages";


/**  ‍ 计算点P 到 p1和p2构成的线段上 距离*/
/** ‍ Calculate the distance on the line segment formed by point P to p1 and p2*/

export function calculateDistanceFromPointToLine(pointToCheck: McGePoint3d, pointA: McGePoint3d, pointB: McGePoint3d) {
  const Q = pointA.clone()
  const R = pointB.clone()
  const P = pointToCheck.clone()

  const QP = P.sub(Q)
  const QR = R.sub(Q)
  const RP = P.sub(R)
  // ‍  点P到线段QR的距离
// ‍ Distance from point P to line segment QR

  let dist: number
  // ‍  点P到QR所在直线的距离 叉乘的大小(length)就是平行四边形面积 / 底边就是 平行四边形的高度 也就是 点P到QR的距离
// ‍ The length of the product of the distance between point P and the line where QR is located is the area of the parallelogram, and the base is the height of the parallelogram, which is the distance between point P and QR

  let dist1 = QP.crossProduct(QR).length() / QR.length();
  // ‍  计算点积
// ‍ Calculate dot product

  let result = QP.dotProduct(QR);
  // ‍  点积的性质:点积的结果除以QR的长度就是向量在另一个向量上的投影长度
// ‍ The property of dot product: The result of dot product divided by the length of QR is the projection length of the vector on another vector

  const QN = QR.clone().mult(result / QR.length() ** 2);
  // ‍  得到点N
// ‍ Get point N

  const N = Q.clone().addvec(QN)
  if (result < 0) {

    dist = QP.length()
  } else if (result > Math.pow(QR.length(), 2)) {
    // ‍  在几何学中，点P到线段QR的最短距离的平方等于点P到QR所在直线的垂直距离的平方。
// ‍ In geometry, the square of the shortest distance between point P and line segment QR is equal to the square of the vertical distance between point P and the line segment QR.

    // ‍  因此，当判断点P在QR的延长线的哪一侧时，使用QR长度的平方来进行比较，以确定点P到线段QR的最短距离。
// ‍ Therefore, when determining which side of the extension line of QR point P is on, the square of the QR length is used for comparison to determine the shortest distance from point P to the line segment QR.

    dist = RP.length()
  } else {
    dist = dist1
  }
  return Math.floor(dist)
}

const m_mx_measuring_length = async () => {
  const mxcad = MxCpp.getCurrentMxCAD()

  const getPoint = new MxCADUiPrPoint()
  getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
  getPoint.setOffsetInputPostion(true)
  getPoint.setMessage(t("指定第一条尺寸界线原点") + "<" + t("选择对象") + ">")
  getPoint.setKeyWords("")
  let pt1 = await getPoint.go()
  let pt2!: McGePoint3d | null
  if(getPoint.getStatus() === MrxDbgUiPrBaseReturn.kNone) {
    const getEnt = new MxCADUiPrEntity()
    getEnt.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getEnt.setOffsetInputPostion(true)
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
    })

    const pos = await getPoint.go()

    if(getPoint.isKeyWordPicked("T")) {
      const getString = new MxCADUiPrString()
      getString.setInputToucheType(MxType.InputToucheType.kGetEnd);
      getString.setOffsetInputPostion(true)
      getString.clearLastInputPoint()
      getString.setMessage(`${t("输入标注文字")}<${ text ? text: id.getMcDbDimension()?.dimensionText || "" }>`)
      getString.setKeyWords("")
      const val = await getString.go()
      if(typeof val !== "string") return
      text = val
      id && id.erase()
      continue;
    }
    id && id.erase()
    if(getPoint.isKeyWordPicked("A")) {
      const getAngle = new MxCADUiPrAngle()
      getAngle.setInputToucheType(MxType.InputToucheType.kGetEnd);
      getAngle.setOffsetInputPostion(true)
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
    mxcad.updateDisplay();
    return dimension
  }
}

async function m_mx_measuring_length_continuous() {
  while(true) {
    const res = await m_mx_measuring_length()
    if(!res) return
    continue;
  }
}

addCommand("m_mx_measuring_length", m_mx_measuring_length)
addCommand("m_mx_measuring_length_continuous", m_mx_measuring_length_continuous)

