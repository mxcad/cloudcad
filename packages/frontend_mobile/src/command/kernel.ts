/**
 * 圆角/倒角/标注命令共享的几何内核。
 *
 * 消费者：m_mx_fillet、m_mx_chamfer、marked/m_mx_aligned_marked、
 * marked/m_mx_dimangular、marked/m_mx_linear_marked。
 *
 * 过去它们从一个命令文件 import 另一个命令文件的内部导出（chamfer 引 fillet
 * 6 个符号、三个 marked 命令各引 1 个），依赖方向靠文件名巧合而非声明的契约；
 * 收拢到本文件后 5 个命令只依赖内核，互不依赖。
 *
 * 注意：这些函数不是纯函数——createChamferedLinesFromSegments 与 copyAttribute
 * 会原地修改传入的实体，darkenColor 会原地修改颜色。调用方按此约定使用。
 * 数学契约回归见 kernel.spec.ts。
 */
import {
  McDb,
  McDbArc,
  McDbEntity,
  McDbLine,
  McDbPolyline,
  McGePoint3d,
  MxCADUtility,
} from "mxcad";
/**
/**

/**

/**

/**

/**

/**

/**

/**

/**

/**
 创建线段与线段的导圆角连接处
Create rounded corner connections between line segments
Create rounded corner connections between line segments


Create rounded corner connections between line segments

/**Create rounded corner connections between line segments
/**Create rounded corner connections between line segments

/**Create rounded corner connections between line segments

/**Create rounded corner connections between line segments


 * @param radius 半径
*@ param radius radius
*@ param radius radius

*@ param radius radius

*@ param radius radius


*@ param radius radius
*@ param radius radius


*@ param radius radius

 * @param line 线段
*@ param line segment

*@ param line segment
*@ param line segment

*@ param line segment

*@ param line segment

*@ param line segment

*@ param line segment

*@ param line segment


*@ param line segment

*@ param line segment
*@ param line segment

*@ param line segment


*@ param line segment

*@ param line segment

 * @param oLine 线段
*@ paramoLine segment

*@ paramoLine segment
*@ paramoLine segment

*@ paramoLine segment

*@ paramoLine segment

*@ paramoLine segment

*@ paramoLine segment

*@ paramoLine segment


*@ paramoLine segment

*@ paramoLine segment
*@ paramoLine segment

*@ paramoLine segment


*@ paramoLine segment

*@ paramoLine segment

 * @param intersectPoint 交点
*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint
*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint


*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint
*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint


*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint

*Intersection point of @ param intersectPoint

 * @param isStart 保留的是line线段的起始点 通过isSegmentStartCloserToPoint 函数得到
*@ aram isStart retains the starting point of the line segment, which is obtained through the isSegmentStartCloserToPoint function

*@ aram isStart retains the starting point of the line segment, which is obtained through the isSegmentStartCloserToPoint function
*@ aram isStart retains the starting point of the line segment,  which is obtained through the isSegmentStartCloserToPoint function

*@ aram isStart retains the starting point of the line segment,  which is obtained through the isSegmentStartCloserToPoint function

*@ aram isStart retains the starting point of the line segment,  which is obtained through the isSegmentStartCloserToPoint function
*@ aram isStart retains the starting point of the line segment,   which is obtained through the isSegmentStartCloserToPoint function

*@ aram isStart retains the starting point of the line segment,   which is obtained through the isSegmentStartCloserToPoint function


*@ aram isStart retains the starting point of the line segment,  which is obtained through the isSegmentStartCloserToPoint function


*@ aram isStart retains the starting point of the line segment, which is obtained through the isSegmentStartCloserToPoint function

*@ aram isStart retains the starting point of the line segment, which is obtained through the isSegmentStartCloserToPoint function
*@ aram isStart retains the starting point of the line segment,  which is obtained through the isSegmentStartCloserToPoint function

*@ aram isStart retains the starting point of the line segment,  which is obtained through the isSegmentStartCloserToPoint function


*@ aram isStart retains the starting point of the line segment, which is obtained through the isSegmentStartCloserToPoint function

*@ aram isStart retains the starting point of the line segment, which is obtained through the isSegmentStartCloserToPoint function

 * @param isOStart 保留的是oLine线段的起始点 通过isSegmentStartCloserToPoint 函数得到
*@ aram isOStart retains the starting point of the oLine segment, which is obtained through the isSegmentStartCloserToPoint function

*@ aram isOStart retains the starting point of the oLine segment, which is obtained through the isSegmentStartCloserToPoint function
*@ aram isOStart retains the starting point of the oLine segment,  which is obtained through the isSegmentStartCloserToPoint function

*@ aram isOStart retains the starting point of the oLine segment,  which is obtained through the isSegmentStartCloserToPoint function

*@ aram isOStart retains the starting point of the oLine segment,  which is obtained through the isSegmentStartCloserToPoint function
*@ aram isOStart retains the starting point of the oLine segment,   which is obtained through the isSegmentStartCloserToPoint function

*@ aram isOStart retains the starting point of the oLine segment,   which is obtained through the isSegmentStartCloserToPoint function


*@ aram isOStart retains the starting point of the oLine segment,  which is obtained through the isSegmentStartCloserToPoint function


*@ aram isOStart retains the starting point of the oLine segment, which is obtained through the isSegmentStartCloserToPoint function

*@ aram isOStart retains the starting point of the oLine segment, which is obtained through the isSegmentStartCloserToPoint function
*@ aram isOStart retains the starting point of the oLine segment,  which is obtained through the isSegmentStartCloserToPoint function

*@ aram isOStart retains the starting point of the oLine segment,  which is obtained through the isSegmentStartCloserToPoint function


*@ aram isOStart retains the starting point of the oLine segment, which is obtained through the isSegmentStartCloserToPoint function

*@ aram isOStart retains the starting point of the oLine segment, which is obtained through the isSegmentStartCloserToPoint function

 * @param isPruning 是否进行修剪
*Is @ paramisPruning pruned
*Is @ paramisPruning pruned

*Is @ paramisPruning pruned

*Is @ paramisPruning pruned


*Is @ paramisPruning pruned
*Is @ paramisPruning pruned


*Is @ paramisPruning pruned

 * @param isApplyCorner 是否强制应用角点
*Does @ paramisApplyCCorner force the application of corner points
*Does @ paramisApplyCCorner force the application of corner points

*Does @ paramisApplyCCorner force the application of corner points

*Does @ paramisApplyCCorner force the application of corner points


*Does @ paramisApplyCCorner force the application of corner points
*Does @ paramisApplyCCorner force the application of corner points


*Does @ paramisApplyCCorner force the application of corner points

 * @returns object | undefined 没有返回对象表面两直线平行
*@ returns object | undefined does not return two parallel lines on the surface of the object
*@ returns object | undefined does not return two parallel lines on the surface of the object

*@ returns object | undefined does not return two parallel lines on the surface of the object

*@ returns object | undefined does not return two parallel lines on the surface of the object


*@ returns object | undefined does not return two parallel lines on the surface of the object
*@ returns object | undefined does not return two parallel lines on the surface of the object


*@ returns object | undefined does not return two parallel lines on the surface of the object

 * @returns object.arc 导圆角连接处的圆弧
*@ returns object.arc Arc at rounded corner connection
*@ returns object.arc Arc at rounded corner connection

*@ returns object.arc Arc at rounded corner connection

*@ returns object.arc Arc at rounded corner connection


*@ returns object.arc Arc at rounded corner connection
*@ returns object.arc Arc at rounded corner connection


*@ returns object.arc Arc at rounded corner connection

 * @returns object.bulge 导圆角连接处的多段线的bulge值
*The bulge value of polylines at the rounded corner connection of @ returns object.bulge
*The bulge value of polylines at the rounded corner connection of @ returns object.bulge

*The bulge value of polylines at the rounded corner connection of @ returns object.bulge

*The bulge value of polylines at the rounded corner connection of @ returns object.bulge


*The bulge value of polylines at the rounded corner connection of @ returns object.bulge
*The bulge value of polylines at the rounded corner connection of @ returns object.bulge


*The bulge value of polylines at the rounded corner connection of @ returns object.bulge

 * @returns object.segmentLine 计算的导角连接线
*The guide angle connecting line calculated by @ returns object.segmentLine
*The guide angle connecting line calculated by @ returns object.segmentLine

*The guide angle connecting line calculated by @ returns object.segmentLine

*The guide angle connecting line calculated by @ returns object.segmentLine


*The guide angle connecting line calculated by @ returns object.segmentLine
*The guide angle connecting line calculated by @ returns object.segmentLine


*The guide angle connecting line calculated by @ returns object.segmentLine

 * @returns object.chamferDist 倒角距离
*@ returns object.chamferDist chamfer distance
*@ returns object.chamferDist chamfer distance

*@ returns object.chamferDist chamfer distance

*@ returns object.chamferDist chamfer distance


*@ returns object.chamferDist chamfer distance
*@ returns object.chamferDist chamfer distance


*@ returns object.chamferDist chamfer distance

 * @returns object.center 倒圆角圆心
*@ returns object.center rounded circle center
*@ returns object.center rounded circle center

*@ returns object.center rounded circle center

*@ returns object.center rounded circle center


*@ returns object.center rounded circle center
*@ returns object.center rounded circle center


*@ returns object.center rounded circle center

 * @returns object.midPoint 倒圆角圆弧中点
*@ returns object.midPoint Rounded arc midpoint
*@ returns object.midPoint Rounded arc midpoint

*@ returns object.midPoint Rounded arc midpoint

*@ returns object.midPoint Rounded arc midpoint


*@ returns object.midPoint Rounded arc midpoint
*@ returns object.midPoint Rounded arc midpoint


*@ returns object.midPoint Rounded arc midpoint

 */
export function createLineSegmentRoundJoin (radius: number, line: McDbLine, oLine: McDbLine, intersectPoint: McGePoint3d, isStart: boolean, isOStart: boolean, isPruning = true, isApplyCorner = false) {
  // ‍  计算圆角的方式
// ‍ The method of calculating rounded corners

  // ‍  先计算交点夹角一般的sin值
// ‍ First, calculate the general sin value of the intersection angle

  const start = line.startPoint
  const end = line.endPoint
  const oStart = oLine.startPoint
  const oEnd = oLine.endPoint
  const startVet = intersectPoint.sub( isStart ? start: end)
  const endVet = intersectPoint.sub( isOStart ? oStart: oEnd)
  const tanVal = Math.tan(startVet.angleTo1(endVet) / 2)
  // ‍  临边 = 对边(半径) / tan值
// ‍ Edge=opposite edge (radius)/tan value

  const dist = radius / tanVal
  // ‍  斜边就相当于倒角的距离
// ‍ The oblique edge is equivalent to the distance of the chamfer

  const segmentLine = createChamferedLinesFromSegments(line, oLine, intersectPoint, isStart, isOStart, isApplyCorner ? 0 : dist, isApplyCorner ? 0 : dist, isPruning)
  if(!segmentLine) return {
    segmentLine,
    chamferDist: dist,
  }
  // ‍  然后利用倒角的逻辑得到倒角位置计算出圆心 和圆弧中点
// ‍ Then use the logic of chamfering to obtain the chamfering position and calculate the center of the circle and the midpoint of the arc

  const vet = segmentLine.startPoint.sub(intersectPoint).perpVector()
  const vet1 = segmentLine.endPoint.sub(intersectPoint).perpVector()
  segmentLine.endPoint.addvec(vet1)
  const iPoints = new McDbLine(segmentLine.startPoint, segmentLine.startPoint.clone().addvec(vet)).IntersectWith(new McDbLine(segmentLine.endPoint, segmentLine.endPoint.clone().addvec(vet1)), McDb.Intersect.kExtendBoth)
  if(!iPoints.isEmpty()) {
    const center = iPoints.at(0)
    const midPoint = center.clone().addvec(intersectPoint.sub(center).normalize().mult(radius))
    const arc = new McDbArc();
     const bulge = MxCADUtility.calcBulge(segmentLine.startPoint, midPoint, segmentLine.endPoint).val
     arc.computeArc(segmentLine.startPoint.x, segmentLine.startPoint.y, midPoint.x, midPoint.y, segmentLine.endPoint.x, segmentLine.endPoint.y)

    return {
      arc,
      bulge,
      segmentLine,
      chamferDist: dist,
      center,
      midPoint
    }
  }else {
    return
  }
}

 /**
  * 创建线段与线段的倒角线
*Create chamfer lines for line segments
*Create chamfer lines for line segments

*Create chamfer lines for line segments

*Create chamfer lines for line segments


*Create chamfer lines for line segments
*Create chamfer lines for line segments


*Create chamfer lines for line segments

  * @param line 线段
  * @param oLine 线段
  * @param intersectPoint 交点
  * @param isStart 保留的是line线段的起始点 通过isSegmentStartCloserToPoint 函数得到
  * @param isOStart 保留的是oLine线段的起始点 通过isSegmentStartCloserToPoint 函数得到
  * @param chamferDist 倒角距离
*@ paramchamferDist chamfer distance
*@ paramchamferDist chamfer distance

*@ paramchamferDist chamfer distance

*@ paramchamferDist chamfer distance


*@ paramchamferDist chamfer distance
*@ paramchamferDist chamfer distance


*@ paramchamferDist chamfer distance

 */
 export function createChamferedLinesFromSegments(line: McDbLine, oLine: McDbLine, intersectPoint:McGePoint3d, isStart: boolean, isOStart: boolean, chamferDist: number, chamferDist1: number, isPruning = true) {
  // ‍  倒角线段
// ‍ Chamfered line segment

  const segmentLine = new McDbLine()
  let vet = line.endPoint.sub(line.startPoint).normalize().mult(chamferDist)
  let oVet = oLine.endPoint.sub(oLine.startPoint).normalize().mult(chamferDist1)

  if (isStart) {
    vet.negate()
    const point = intersectPoint.clone().addvec(vet)
    if (isPruning) {
      line.endPoint = point
    }
    segmentLine.startPoint = point.clone()
  } else {
    const point = intersectPoint.clone().addvec(vet)
    if (isPruning) {
      line.startPoint = point
    }
    segmentLine.startPoint = point.clone()
  }
  if (isOStart) {
    oVet.negate()
    const point = intersectPoint.clone().addvec(oVet)
    if (isPruning) {
      oLine.endPoint = point
    }
    segmentLine.endPoint = point.clone()
  } else {
    const point = intersectPoint.clone().addvec(oVet)
    if (isPruning) {
      oLine.startPoint = point
    }
    segmentLine.endPoint = point.clone()
  }
  if (chamferDist <= 0 && chamferDist1 <= 0) return
  return segmentLine
}

/** 同步图形属性 */
export const copyAttribute = (oEnt: McDbEntity, ent: McDbEntity) => {
  oEnt.layer = ent.layer
  oEnt.trueColor = ent.trueColor
  oEnt.colorIndex = ent.colorIndex
  oEnt.linetype = ent.linetype
  oEnt.visible = ent.visible
  oEnt.textStyle = ent.textStyle
  oEnt.lineweight = ent.lineweight
  oEnt.drawOrder = ent.drawOrder
  oEnt.linetypeScale = ent.linetypeScale
}

/** 计算点P 到 p1和p2构成的线段上 距离 */
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

/** 通过一个点从多段线中选中一条线段
/**Select a segment from a polyline through a point
/**Select a segment from a polyline through a point

/**Select a segment from a polyline through a point

/**Select a segment from a polyline through a point


/**Select a segment from a polyline through a point
/**Select a segment from a polyline through a point


/**Select a segment from a polyline through a point

 *  @param ent 多段线实体
*@ parament polyline entity
*@ parament polyline entity

*@ parament polyline entity

*@ parament polyline entity


*@ parament polyline entity
*@ parament polyline entity


*@ parament polyline entity

 *  @param selectPt 提供选择点
*@ paramselectPt provides selection points
*@ paramselectPt provides selection points

*@ paramselectPt provides selection points

*@ paramselectPt provides selection points


*@ paramselectPt provides selection points
*@ paramselectPt provides selection points


*@ paramselectPt provides selection points

 *  @param distanceTolerance 点到线段的最大允许直线距离 (超出距离无法选择 默认为0)
*The maximum allowable straight-line distance from a point to a line segment in @ paramdistanceTolerance (if the distance is exceeded, it cannot be selected and defaults to 0)
*The maximum allowable straight-line distance from a point to a line segment in @ paramdistanceTolerance (if the distance is exceeded, it cannot be selected and defaults to 0)

*The maximum allowable straight-line distance from a point to a line segment in @ paramdistanceTolerance (if the distance is exceeded, it cannot be selected and defaults to 0)

*The maximum allowable straight-line distance from a point to a line segment in @ paramdistanceTolerance (if the distance is exceeded, it cannot be selected and defaults to 0)


*The maximum allowable straight-line distance from a point to a line segment in @ paramdistanceTolerance (if the distance is exceeded, it cannot be selected and defaults to 0)
*The maximum allowable straight-line distance from a point to a line segment in @ paramdistanceTolerance (if the distance is exceeded, it cannot be selected and defaults to 0)


*The maximum allowable straight-line distance from a point to a line segment in @ paramdistanceTolerance (if the distance is exceeded, it cannot be selected and defaults to 0)

 *  @returns returnObj 表示该函数返回的对象
*@ returns returnObj represents the object returned by the function
*@ returns returnObj represents the object returned by the function

*@ returns returnObj represents the object returned by the function

*@ returns returnObj represents the object returned by the function


*@ returns returnObj represents the object returned by the function
*@ returns returnObj represents the object returned by the function


*@ returns returnObj represents the object returned by the function

 *  @returns returnObj.start 表示选中线段的开始点
*@ returns returnObj.start represents the starting point of the selected line segment
*@ returns returnObj.start represents the starting point of the selected line segment

*@ returns returnObj.start represents the starting point of the selected line segment

*@ returns returnObj.start represents the starting point of the selected line segment


*@ returns returnObj.start represents the starting point of the selected line segment
*@ returns returnObj.start represents the starting point of the selected line segment


*@ returns returnObj.start represents the starting point of the selected line segment

 *  @returns returnObj.end 表示选中线段的结束点
*@ returns returnObj. end represents the end point of the selected line segment
*@ returns returnObj. end represents the end point of the selected line segment

*@ returns returnObj. end represents the end point of the selected line segment

*@ returns returnObj. end represents the end point of the selected line segment


*@ returns returnObj. end represents the end point of the selected line segment
*@ returns returnObj. end represents the end point of the selected line segment


*@ returns returnObj. end represents the end point of the selected line segment

 *  @returns returnObj.startIndex 表示选中线段开始点在多段线中的索引
*@ returns returnObj.startIndex represents the index of the starting point of the selected line segment in the polyline
*@ returns returnObj.startIndex represents the index of the starting point of the selected line segment in the polyline

*@ returns returnObj.startIndex represents the index of the starting point of the selected line segment in the polyline

*@ returns returnObj.startIndex represents the index of the starting point of the selected line segment in the polyline


*@ returns returnObj.startIndex represents the index of the starting point of the selected line segment in the polyline
*@ returns returnObj.startIndex represents the index of the starting point of the selected line segment in the polyline


*@ returns returnObj.startIndex represents the index of the starting point of the selected line segment in the polyline

 *  @returns returnObj.endIndex 表示选中线段结束点在多段线中的索引
*@ returns returnObj. endIndex represents the index of the end point of the selected line segment in the polyline
*@ returns returnObj. endIndex represents the index of the end point of the selected line segment in the polyline

*@ returns returnObj. endIndex represents the index of the end point of the selected line segment in the polyline

*@ returns returnObj. endIndex represents the index of the end point of the selected line segment in the polyline


*@ returns returnObj. endIndex represents the index of the end point of the selected line segment in the polyline
*@ returns returnObj. endIndex represents the index of the end point of the selected line segment in the polyline


*@ returns returnObj. endIndex represents the index of the end point of the selected line segment in the polyline

 *  */ 
export function selectLineSegmentFromPolylineByPoint(ent: McDbPolyline, selectPt: McGePoint3d, distanceTolerance = 0) {
  for (let index = 0; index < ent.numVerts(); index++) {
    const pt = ent.getPointAt(index).val
    const nextPt = ent.getPointAt(index + 1).val
    const start = ent.getClosestPointTo(selectPt, true).val
    if (nextPt && calculateDistanceFromPointToLine(start, pt, nextPt) < distanceTolerance) {
      return {
        start: pt,
        end: nextPt,
        startIndex: index,
        endIndex: index + 1
      }
    }
  }
  if(ent.isClosed) {
    const end = ent.getPointAt(0).val
    const start = ent.getPointAt(ent.numVerts() - 1).val
    const pt = ent.getClosestPointTo(selectPt, true).val
    if(calculateDistanceFromPointToLine(pt, start, end) < distanceTolerance) {
      return {
        start,
        end,
        startIndex: ent.numVerts() - 1,
        endIndex: 0,
        isClosed: true
      }
    }
  }
}

/** 判断通过点选中的线段是否更接近开始点
/**Determine whether the selected line segment is closer to the starting point
/**Determine whether the selected line segment is closer to the starting point

/**Determine whether the selected line segment is closer to the starting point

/**Determine whether the selected line segment is closer to the starting point


/**Determine whether the selected line segment is closer to the starting point
/**Determine whether the selected line segment is closer to the starting point


/**Determine whether the selected line segment is closer to the starting point

 * @param start 线段开始点
*@ param start line segment starting point
*@ param start line segment starting point

*@ param start line segment starting point

*@ param start line segment starting point


*@ param start line segment starting point
*@ param start line segment starting point


*@ param start line segment starting point

 * @param end 线段结束点
*@ param end line segment endpoint
*@ param end line segment endpoint

*@ param end line segment endpoint

*@ param end line segment endpoint


*@ param end line segment endpoint
*@ param end line segment endpoint


*@ param end line segment endpoint

 * @param intersectPoint 交点
 * @param pt 用户选中的点
*@ parampt user selected point
*@ parampt user selected point

*@ parampt user selected point

*@ parampt user selected point


*@ parampt user selected point
*@ parampt user selected point


*@ parampt user selected point

 * @returns 返回true表示选中的点更接近开始点(更接近开始点 则表明 两条线段相交选中的线段是开始点到交点的这条线段)
*@ returns returns true to indicate that the selected point is closer to the starting point (closer to the starting point indicates that two line segments intersect)
*@ returns returns true to indicate that the selected point is closer to the starting point (closer to the starting point indicates that two line segments intersect)

*@ returns returns true to indicate that the selected point is closer to the starting point (closer to the starting point indicates that two line segments intersect)

*@ returns returns true to indicate that the selected point is closer to the starting point (closer to the starting point indicates that two line segments intersect)


*@ returns returns true to indicate that the selected point is closer to the starting point (closer to the starting point indicates that two line segments intersect)
*@ returns returns true to indicate that the selected point is closer to the starting point (closer to the starting point indicates that two line segments intersect)


*@ returns returns true to indicate that the selected point is closer to the starting point (closer to the starting point indicates that two line segments intersect)

 *  */
export function isSegmentStartCloserToPoint(start: McGePoint3d, end: McGePoint3d, intersectPoint: McGePoint3d, pt: McGePoint3d) {
  // ‍  先判断第一条线的选中点选中的是 开始点到交点这条线段还是结束点到交点这条线段 这里为true表示 开始点到交点的线段
// ‍ First, determine whether the selected point of the first line is the line segment from the starting point to the intersection point or the line segment from the ending point to the intersection point. True here indicates the line segment from the starting point to the intersection point

  // ‍  计算点到线段终点与交点间距离 来确定点在那条线段中
// ‍ Calculate the distance between the point and the endpoint of the line segment, as well as the intersection point, to determine which line segment the point belongs to

  const ptLineStatDist = calculateDistanceFromPointToLine(pt, start, intersectPoint)
  const ptLineEndDist = calculateDistanceFromPointToLine(pt, end, intersectPoint)
  if (isNaN(ptLineEndDist)) return true
  if (isNaN(ptLineStatDist)) return false
  if (ptLineEndDist === ptLineStatDist) {
    return intersectPoint.distanceTo(start) > intersectPoint.distanceTo(end)
  }
  return ptLineStatDist < ptLineEndDist
}

/** 颜色变暗 */
export function darkenColor(color: THREE.Color, factor: number) {
  // ‍  获取当前RGB值
// ‍ Retrieve the current RGB values

  var r = color.r;
  var g = color.g;
  var b = color.b;

  // ‍  计算新的亮度更低的RGB值，各分量均乘以同一降低因子
// ‍ Calculate new RGB values with lower brightness, and multiply each component by the same reduction factor

  r *= factor;
  g *= factor;
  b *= factor;

  // ‍  确保RGB值在0-1之间
// ‍ Ensure that RGB values are between 0-1

  color.r = Math.max(Math.min(r, 1), 0);
  color.g = Math.max(Math.min(g, 1), 0);
  color.b = Math.max(Math.min(b, 1), 0);
}


 // ‍  计算两点之间的斜率
// ‍ Calculate the slope between two points

function calculateSlope(point1: McGePoint3d, point2: McGePoint3d) {
  return (point2.y - point1.y) / (point2.x - point1.x);
}


/**  ‍ 判断两条直线是否共线 */
/** ‍ Determine whether two straight lines are collinear*/

export function areLinesCollinear(line: McDbLine, line1: McDbLine) {
  // ‍  计算斜率
// ‍ Calculate slope

  var slope1 = calculateSlope(line.startPoint, line.endPoint);
  var slope2 = calculateSlope(line1.startPoint, line1.endPoint);

  // ‍  判断斜率是否相等，同时考虑斜率为无穷大的情况
// ‍ Determine whether the slopes are equal, while considering the case where the slope is infinite

  if (isNaN(slope1) && isNaN(slope2)) {
    // ‍  两条直线垂直于坐标轴
// ‍ Two straight lines perpendicular to the coordinate axis

    return line.startPoint.x === line1.startPoint.x;
  } else {
    return slope1 === slope2;
  }
}
