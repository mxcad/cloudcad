///////////////////////////////////////////////////////////////////////////////
// ‍ 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// ‍ Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.

// ‍ 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// ‍ The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement

// ‍ 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// ‍ This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials

//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////


import { addCommand } from "@/plugins/mxcad/command";
import { MxFun,MxType } from "mxdraw"
import { interval } from "@/utils/interval";
import { McDbCircle, McDbEntity, McDbLine, McDbPolyline, McGePoint3d, MxCADResbuf, MxCADUiPrDist, MxCADUiPrPoint, MxCADUtility, MxCpp } from "mxcad";
import { DetailedResult, MrxDbgUiPrBaseReturn } from "mxdraw"
import { t } from "@/languages";

function calculateSegmentLength(curveLength: number, minInterval: number, maxInterval: number) {
  let start = minInterval;
  let end = maxInterval;
  while (end - start > 0.0001) {
    let mid = (start + end) / 2;
    let numSegments = Math.floor(curveLength / mid);
    if (numSegments * mid > curveLength || mid < minInterval) {
      end = mid;
    } else {
      start = mid;
    }
  }
  let numSegments = Math.floor(curveLength / start);
  return curveLength / numSegments;
}

// ‍  分段
// ‍ Segmented

function subsection(start: McGePoint3d, end: McGePoint3d, minArcLength: number, maxArcLength: number) {
  const length = start.distanceTo(end)
  const segmentLength = calculateSegmentLength(length, minArcLength, maxArcLength)
  const n = length / segmentLength
  const vet = end.sub(start).normalize()
  const points: McGePoint3d[] = []
  for (let i = 0; i < n; i++) {
    points.push(start.clone().addvec(vet.clone().mult(segmentLength * i)))
  }
  return points
}
/**
/**

 * 生成规则多边形的顶点坐标
*Generate vertex coordinates for regular polygons

 * @param {McGePoint3d} centerPoint - 多边形中心点
*@ param {McGePoint3d} centerPoint - Polygon center point

 * @param {McGePoint3d} vertexPoint - 多边形顶点
*@ param {McGePoint3d} vertexPoint - Polygon vertex

 * @param {number} sides - 多边形边数（至少为3）
*@ param {number} sides - The number of polygon edges (at least 3)

 * @returns {McGePoint3d[]} 多边形的顶点坐标数组
*@ Returns {McGePoint3d []} Polygon vertex coordinate array

 */
export function computeRegularPolygonVertices(centerPoint = new McGePoint3d(), vertexPoint = new McGePoint3d(), sides = 3, arcAngle = Math.PI * 2): McGePoint3d[] {
  const verticesArray: McGePoint3d[] = [];
  sides = Math.max(3, sides);
  verticesArray.push(vertexPoint);

  // ‍  计算每个顶点的角度增量
// ‍ Calculate the angle increment of each vertex

  const angleIncrement = arcAngle / sides;

  for (let i = 1; i < sides; i++) {
    // ‍  计算当前顶点对应的角度上的余弦和正弦值
// ‍ Calculate the cosine and sine values at the angle corresponding to the current vertex

    const cosValue = Math.cos(angleIncrement * i),
      sinValue = Math.sin(angleIncrement * i);

    // ‍  复制中心点和顶点，以免修改原始点的值
// ‍ Copy the center point and vertices to avoid modifying the values of the original points

    const startPt = centerPoint.clone();
    const endPt = vertexPoint.clone();

    // ‍  计算相对于中心点的偏移量
// ‍ Calculate the offset relative to the center point

    const deltaX = endPt.x - startPt.x;
    const deltaY = endPt.y - startPt.y;

    // ‍  根据旋转公式计算新的顶点坐标
// ‍ Calculate new vertex coordinates based on the rotation formula

    const newX = deltaX * cosValue - deltaY * sinValue + startPt.x;
    const newY = deltaX * sinValue + deltaY * cosValue + startPt.y;

    // ‍  创建新的顶点对象并加入数组
// ‍ Create a new vertex object and add it to the array

    const point = new McGePoint3d(newX, newY);
    verticesArray.push(point);
  }

  return verticesArray;
}

const getRectPoints = (pt1: McGePoint3d, pt3: McGePoint3d): McGePoint3d[] => {
  const pt2 = new McGePoint3d(pt1.x, pt3.y, pt1.z);
  const pt4 = new McGePoint3d(pt3.x, pt1.y, pt3.z);
  return [pt1, pt2, pt3, pt4];
};


async function m_mx_revcloud() {
  const maxWidth = MxFun.viewCoordLong2Cad(2)
  let minArcLength = Number(localStorage.getItem("mx_revcloud_minArcLength"))
  let maxArcLength = Number(localStorage.getItem("mx_revcloud_maxArcLength"))

  const getPoint = new MxCADUiPrPoint()
  getPoint.setOffsetInputPostion(true)
  getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
  let bulge = -0.45
  let isRect = false
  let isPolyline = false
  // ‍  手绘
// ‍ Hand drawn

  let isHandDrawn = false
  function copyEntProps(pl: McDbEntity, ent: McDbEntity) {
    pl.colorIndex = ent.colorIndex
    pl.trueColor = ent.trueColor
    pl.drawOrder = ent.drawOrder
    pl.layer = ent.layer
    pl.layerId = ent.layerId
    pl.linetype = ent.linetype
    pl.linetypeScale = ent.linetypeScale
    pl.lineweight = ent.lineweight
    pl.textStyle = ent.textStyle
  }
  while (true) {
    let msg = t("第一点")
    if (isRect) msg = t("指定第一个角点")
    if (isPolyline) msg = t("指定起点")
    getPoint.setMessage(msg)
    getPoint.setKeyWords(`[${t("弧长")}(A)/${t("对象")}(O)/${t("矩形")}(R)/${t("多边形")}(P)/${t("徒手画")}(F)/${t("样式")}(S)]`)
    const pl = new McDbPolyline()
    getPoint.clearLastInputPoint()
    const callReverse = async (pl: McDbPolyline) => {
      getPoint.clearLastInputPoint()
      getPoint.setMessage(t("反转方向"))
      getPoint.setKeyWords(`[${t("是")}(Y)/${t("否")}(N)]`)
      await getPoint.go()
      if (getPoint.isKeyWordPicked("Y")) {
        const n = pl.numVerts()
        for (let index = 0; index < n; index++) {
          const bulge = pl.getBulgeAt(index)
          pl.setBulgeAt(index, -bulge)
        }
      }
      return true
    }
    let start = await getPoint.go()
    if (getPoint.isKeyWordPicked("A")) {
      const getDist = new MxCADUiPrDist()
      getDist.setOffsetInputPostion(true)
      getDist.setInputToucheType(MxType.InputToucheType.kGetEnd);
      getDist.setMessage(t("请输入最小弧长"))
      let dist = await getDist.go()
      if (typeof dist !== "number") return
      minArcLength = dist
      localStorage.setItem("mx_revcloud_minArcLength", dist.toString())
      const getMaxLength: () => Promise<false | void> = async () => {
        getDist.setMessage(t("指定最大弧长"))
        let dist1 = await getDist.go()
        if (typeof dist1 !== "number") return false
        if (dist1 < minArcLength) {
          return await getMaxLength()
        }
        maxArcLength = dist1
        localStorage.setItem("mx_revcloud_maxArcLength", dist1.toString())
      }
      if (await getMaxLength() === false) return
      continue;
    }
    if (getPoint.isKeyWordPicked("O")) {
      const filter = new MxCADResbuf()
      filter.AddMcDbEntityTypes("CIRCLE,ARC,LINE,LWPOLYLINE,ELLIPSE")
      const ids = await MxCADUtility.userSelect(t("选择对象"), filter)
      const id = ids[0]
      if (!id) return
      const ent = id.getMcDbEntity()
      if (!ent) return

      if (ent instanceof McDbPolyline) {
        pl.isClosed = ent.isClosed
        pl.constantWidth = ent.constantWidth
        copyEntProps(pl, ent)
        const length = ent.numVerts()
        let start!: McGePoint3d
        for (let index = 0; index < length; index++) {
          const end = ent.getPointAt(index).val
          if (start && end) {
            subsection(start, end, minArcLength, maxArcLength).forEach((pt) => {
              pl.addVertexAt(pt, bulge, void 0, isHandDrawn ? maxWidth : void 0)
            })
          }
          start = end
        }
        if (pl.isClosed) {
          subsection(start, ent.getPointAt(0).val, minArcLength, maxArcLength).forEach((pt) => {
            pl.addVertexAt(pt, bulge, void 0, isHandDrawn ? maxWidth : void 0)
          })
        } else {
          pl.addVertexAt(start, bulge)
        }
        await callReverse(pl)
        ent.erase()
        return MxCpp.getCurrentMxCAD().drawEntity(pl)
      }
      if (ent instanceof McDbLine) {
        copyEntProps(pl, ent)
        subsection(ent.startPoint, ent.endPoint, minArcLength, maxArcLength).forEach((pt) => {
          pl.addVertexAt(pt, bulge, void 0, isHandDrawn ? maxWidth : void 0)
        })
        pl.addVertexAt(ent.endPoint, bulge, void 0, isHandDrawn ? maxWidth : void 0)
        await callReverse(pl)
        ent.erase()
        return MxCpp.getCurrentMxCAD().drawEntity(pl)
      }
      if (ent instanceof McDbCircle) {
        const length = ent.getLength().val
        const len = length / calculateSegmentLength(length, minArcLength, maxArcLength)

        const start = ent.getStartPoint().val

        computeRegularPolygonVertices(ent.center, start, len).forEach((pt) => {
          pl.addVertexAt(pt, bulge, void 0, isHandDrawn ? maxWidth : void 0)
        })

        copyEntProps(pl, ent)
        if (ent instanceof McDbCircle) {
          pl.isClosed = true
        }
        await callReverse(pl)
        ent.erase()
        return MxCpp.getCurrentMxCAD().drawEntity(pl)
      }
    }
    if (getPoint.isKeyWordPicked("R")) {
      isRect = true
      isPolyline = false
      continue;
    }
    if (getPoint.isKeyWordPicked("P")) {
      isPolyline = true
      isRect = false
      continue;
    }
    if (getPoint.isKeyWordPicked("F")) {
      isPolyline = false
      isRect = false
      continue;
    }
    if (getPoint.isKeyWordPicked("S")) {
      getPoint.setMessage(t("选择圆弧样式"))
      getPoint.setKeyWords(`[${t("普通")}(N)/${t("手绘")}(C)]`)
      await getPoint.go()
      if (getPoint.getDetailedResult() === DetailedResult.kEcsIn) return
      if (getPoint.getDetailedResult() === DetailedResult.kNewCommadIn) return
      if (getPoint.getStatus() === MrxDbgUiPrBaseReturn.kNone) return
      if (getPoint.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return

      if (getPoint.isKeyWordPicked("N")) {
        isHandDrawn = false
      }
      if (getPoint.isKeyWordPicked("C")) {
        isHandDrawn = true
      }
      continue;
    }
    if (!start) return
    if (isRect) {
      getPoint.setMessage(t("指定对角点"))
      getPoint.setMessage("")
      const call = (pl: McDbPolyline, end: McGePoint3d) => {
        if (!start) return
        const [pt1, pt2, pt3, pt4] = getRectPoints(start, end);
        const isReverse = start.x < end.x && start.y < end.y || start.x > end.x && start.y > end.y;
        [[pt1, pt2], [pt2, pt3], [pt3, pt4], [pt4, pt1]].forEach(([start, end]) => {
          subsection(start, end, minArcLength, maxArcLength).forEach((pt) => {
            pl.addVertexAt(pt, isReverse ? bulge : -bulge, void 0, isHandDrawn ? maxWidth : void 0)
          })
        })
        pl.isClosed = true
      }
      getPoint.setUserDraw((pt, pw) => {
        const pl = new McDbPolyline()
        call(pl, pt)
        pw.drawMcDbEntity(pl)
      })

      const end = await getPoint.go()
      if (!end) return
      call(pl, end)
      return MxCpp.getCurrentMxCAD().drawEntity(pl)
    }
    else if (isPolyline) {
      let startPoint = start
      const points: McGePoint3d[] = []
      points.push(startPoint)
      const call = (pl: McDbPolyline, points: McGePoint3d[]) => {
        let oldPt!: McGePoint3d
        points.forEach((point) => {
          if (oldPt) {
            subsection(oldPt, point, minArcLength, maxArcLength).forEach((pt) => {
              pl.addVertexAt(pt, bulge, void 0, isHandDrawn ? maxWidth : void 0)
            })
          }
          oldPt = point
        })

        if (points.length > 2) {
          pl.isClosed = true
          subsection(oldPt, points[0], minArcLength, maxArcLength).forEach((pt) => {
            pl.addVertexAt(pt, bulge, void 0, isHandDrawn ? maxWidth : void 0)
          })
        } else {
          pl.addVertexAt(oldPt, bulge, void 0, isHandDrawn ? maxWidth : void 0)
        }
      }
      getPoint.setUserDraw((pt, pw) => {
        const pl = new McDbPolyline()
        call(pl, [...points, pt])
        pw.drawMcDbEntity(pl)
      })
      while (true) {
        getPoint.setMessage(t("指定下一点"))
        getPoint.setKeyWords(points.length < 2 ? "" : `[${t("放弃")}(U)]`)
        const nextPoint = await getPoint.go()
        if (getPoint.isKeyWordPicked("U")) {
          points.pop()
          getPoint.clearLastInputPoint()
          continue;
        }
        if (getPoint.getDetailedResult() === DetailedResult.kNullEnterIn || getPoint.getDetailedResult() === DetailedResult.kMouseRightIn) {
          call(pl, points)
          await callReverse(pl)
          return MxCpp.getCurrentMxCAD().drawEntity(pl)
        }
        if (!nextPoint) return
        points.push(nextPoint)
        continue;
      }
    }
    else {
      pl.addVertexAt(start, bulge, void 0, isHandDrawn ? maxWidth : void 0)
      const startPt = start.clone()
      let dist = 0
      let end = start
      const call = async () => {
        cancel()
        await callReverse(pl)
        const mxcad = MxCpp.getCurrentMxCAD()
        mxcad.drawEntity(pl);
      }

      getPoint.setMessage(t("沿云线路径引导十字光标") + "...")
      getPoint.setKeyWords("")
      getPoint.setUserDraw((pt, pw) => {
        if (!start) return
        end = pt
        dist = start.distanceTo(pt)
        pw.drawMcDbEntity(pl.clone())
        pw.drawLine(start.toVector3(), pt.toVector3())
      })
      getPoint.clearLastInputPoint()
      let isRun = false
      const cancel = interval(20, async () => {
        if (dist < minArcLength) return
        if(end.distanceTo(startPt) < minArcLength) {
          pl.isClosed = true
          MxFun.stopRunCommand();
          isRun = true
          return
        }
        pl.addVertexAt(end, bulge, void 0, isHandDrawn ? maxWidth : void 0)
        start = end
        dist = 0
      })
      const pt = await getPoint.go()
      if (getPoint.getDetailedResult() === DetailedResult.kMouseRightIn || getPoint.getDetailedResult() === DetailedResult.kNullEnterIn) {
        await call()
      }

      if (!pt && !isRun) return cancel()
      if(pt) {
        pl.addVertexAt(pt, bulge, void 0, isHandDrawn ? maxWidth : void 0)
      }

      await call()
      break;
    }

  }
}

// ‍  云线
// ‍ Cloud Line

addCommand("m_mx_revcloud", m_mx_revcloud)
