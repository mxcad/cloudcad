import { t } from "@/languages"
import { addCommand } from "@/plugins/mxcad/command"
import { MxCADUiPrDist, MxCADUiPrEntity, MxCADResbuf, McDbPolyline, McGePoint3d, McDbLine, MxCpp, MxCADUiPrKeyWord, McDbEntity, McDb, MxCADUtility } from "mxcad"
import { DynamicInputType, MrxDbgUiPrBaseReturn, MxFun } from "mxdraw"
import {
  areLinesCollinear,
  copyAttribute,
  createLineSegmentRoundJoin,
  darkenColor,
  isSegmentStartCloserToPoint,
  selectLineSegmentFromPolylineByPoint,
} from "./kernel";

async function m_mx_fillet() {
    let radius = Number(localStorage.getItem("Mx_Fillet_radius")) || 0
    let isPruning = localStorage.getItem("Mx_Fillet_isPruning") === "false" ? false : true
    let isMultiple = false
    MxFun.acutPrintf(`\n${t("当前设置")}: ${t("模式")} = ${isPruning ? t("修剪") : t("不修剪")}, ${t("半径")} = ${radius.toFixed(4)}`)
    const getRadius = async () => {
      const getDist = new MxCADUiPrDist()
      getDist.setDynamicInputType(DynamicInputType.kDistanceInput)
      getDist.setKeyWords(`${t("指定圆角半径")}<${radius.toFixed(4)}>`)
      const val = await getDist.go()
      if (getDist.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
      if (getDist.getStatus() === MrxDbgUiPrBaseReturn.kNone) return radius
      if (typeof val !== "number") return
      radius = val
      localStorage.setItem("Mx_Fillet_radius", radius.toString())
      return radius
    }
    const getEnt = new MxCADUiPrEntity()
    const entFilter = new MxCADResbuf();
    entFilter.AddMcDbEntityTypes("LINE,LWPOLYLINE");
    while (true) {
      getEnt.setDynamicInputType(DynamicInputType.kNoInput)
      getEnt.setFilter(entFilter)
      getEnt.setMessage(t("选择第一个对象"))
      getEnt.setKeyWords(`[${t("放弃")}(U)/${t("多段线")}(P)/${t("半径")}(R)/${t("修剪")}(T)/${t("多个")}(M)]`)
      const objId = await getEnt.go()
      if (getEnt.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
      if (getEnt.isKeyWordPicked("U")) {
        continue;
      }
      if (getEnt.isKeyWordPicked("P")) {
        getPl: while (true) {
          getEnt.setMessage(t("选择二维多段线"))
          getEnt.setKeyWords(`[${t("半径")}(R)]`)
          const plFilter = new MxCADResbuf();
          plFilter.AddMcDbEntityTypes("LWPOLYLINE");
          getEnt.setFilter(plFilter)
          const plObjeId = await getEnt.go()
          if (getEnt.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
          if (getEnt.isKeyWordPicked("R")) {
            if (typeof await getRadius() !== "number") return
            continue;
          }
          if (!plObjeId) return
          if (!plObjeId.isValid()) return
          const pl = plObjeId.getMcDbEntity()
          if (!(pl instanceof McDbPolyline)) return
          let numVerts = pl.numVerts()
          // ‍  记录拐角
// ‍ Record the corner

          let index = 0
          // ‍  记录下一个获取的点索引
// ‍ Record the index of the obtained point

          let num = 0
          // ‍  剪切模式下得到新的多义线坐标点
// ‍ Obtain new polyline coordinate points in cutting mode

          let points: { point: McGePoint3d, bulge: number, width: number, width1: number }[] = []
          if (!pl.isClosed) {
            numVerts--
          }
          while (index < numVerts) {
            index++
            if (num > numVerts - 1) num = 0
            const { val: pt1 } = pl.getPointAt(num)
            if (!pt1) {
              if (isMultiple) continue getPl;
              else return
            }
            num++
            if (num > numVerts - 1) num = 0
            const { val: pt2 } = pl.getPointAt(num)
            if (!pt2) {
              if (isMultiple) continue getPl;
              else return
            }
            num++
            if (num > numVerts - 1) num = 0
            const { val: pt3 } = pl.getPointAt(num)
            if (!pt3) {
              if (isMultiple) continue getPl;
              else return
            }
            num = index
            const roundJoinInfo = createLineSegmentRoundJoin(radius, new McDbLine(pt1, pt2), new McDbLine(pt2, pt3), pt2, true, false, isPruning)
            if(!roundJoinInfo) {
              return console.log(t("两直线平行"))
            }
            const { arc, segmentLine, bulge } = roundJoinInfo
            if(!segmentLine) return
            if (isPruning) {
              const { ret, val1, val2 } = pl.getWidthsAt(index)
              if (!ret) {
                if (pl.isClosed) {
                  const { ret, val1, val2 } = pl.getWidthsAt(0)
                  if (!ret) continue
                  points.push({
                    width: val1,
                    width1: val2,
                    bulge,
                    point: segmentLine.startPoint
                  })
                  points.unshift({
                    width: val1,
                    width1: val2,
                    bulge: pl.getBulgeAt(0),
                    point: segmentLine.endPoint
                  })
                }
                continue;
              }
              points.push({
                width: val1,
                width1: val2,
                bulge,
                point: segmentLine.startPoint
              })
              points.push({
                width: val1,
                width1: val2,
                bulge: pl.getBulgeAt(index),
                point: segmentLine.endPoint
              })
            }
            else {
              copyAttribute(arc, pl)
              MxCpp.getCurrentMxCAD().drawEntity(arc)
            }
          }
          if (isPruning) {
            const num = pl.numVerts()
            for (let index = 0; index < num; index++) {
              pl.removeVertexAt(0)
            }
            points.forEach(({ point, bulge, width, width1 }) => {
              pl.addVertexAt(point, bulge, width, width1)
            })
          }
          if (isMultiple) continue
          else return
        }
      }
      if (getEnt.isKeyWordPicked("R")) {
        if (typeof await getRadius() !== "number") return
        continue;
      }
      if (getEnt.isKeyWordPicked("T")) {
        const getKey = new MxCADUiPrKeyWord()
        getKey.setDynamicInputType(DynamicInputType.kNoInput)
        getKey.setMessage(`${t("输入剪切模式选项")}<${isPruning ? t("修剪") : t("不修剪")}>`)
        getKey.setKeyWords(`[${t("修剪")}(T)/${t("不修剪")}(N)]`)
        const key = await getKey.go()
        if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
        if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kNone) continue;
        if (typeof key !== "string") return
        if (key.toLocaleLowerCase() === "t") {
          isPruning = true
          localStorage.setItem("Mx_Fillet_isPruning", "true")
          continue;
        }
        if (key.toLocaleLowerCase() === "n") {
          isPruning = false
          localStorage.setItem("Mx_Fillet_isPruning", "false")
          continue;
        }
      }
      if (getEnt.isKeyWordPicked("M")) {
        isMultiple = true
        continue;
      }
      if (!objId) {
        continue
      }
      if (!objId.isValid()) {
        continue
      }
      const pt1 = getEnt.pickPoint()
  
      let filter = new MxCADResbuf();
      filter.AddMcDbEntityTypes("LINE,LWPOLYLINE");
      let selEntity1 = new MxCADUiPrEntity();
      selEntity1.setFilter(filter)
      const lineEnt = objId.getMcDbEntity()
      if (!lineEnt) continue;
      if (lineEnt instanceof McDbLine) {
        lineEnt.highlight(true);
      }
      let selectLineInfo: ReturnType<typeof selectLineSegmentFromPolylineByPoint> | undefined
      if (lineEnt instanceof McDbPolyline) {
        selectLineInfo = selectLineSegmentFromPolylineByPoint(lineEnt, pt1, MxFun.viewCoordLong2Cad(2))
        if (!selectLineInfo) {
          continue;
        }
      }
      let selEntity2 = new MxCADUiPrEntity();
      selEntity2.setFilter(filter)
      /**  ‍ 触发自动补全因为倒角距离过长无法闭合的提示记录 */
/** ‍ Trigger auto completion for prompt record that cannot be closed due to excessive chamfer distance*/

      let isChamferLengthWarningShow = false
      const showWarning = (text: string) => {
        // ‍  避免重复一直提示
// ‍ Avoid repeating and constantly prompting

        if (isChamferLengthWarningShow) {
          MxFun.acutPrintf(text)
          isChamferLengthWarningShow = false
        }
      }
      // ‍  退出操作
// ‍ Exit operation

      const exit = () => {
        // ‍  重新允许提示倒角距离警告
// ‍ Allow the warning of chamfer distance to be prompted again

        isChamferLengthWarningShow = true
        lineEnt.highlight(false)
      }
      // ‍  处理倒角
// ‍ Processing chamfers

      const calculateAndApplyFilletBetweenTwoLines = (line: McDbEntity, oLine: McDbEntity, opt: McGePoint3d, draw = (line: McDbEntity) => {
        MxCpp.getCurrentMxCAD().drawEntity(line)
      }) => {
        const lineEnt = line
        const oLineEnt = oLine
        // ‍  应用倒角函数 传入选中的图元将直接应用倒角修改图元本身, 如果为传入，则默认采用处理倒角时传入的图元
// ‍ Applying the chamfer function to the selected element will directly apply the chamfer to modify the element itself. If it is passed in, the element passed in during chamfer processing will be used by default

        let apply!: (ent1?: McDbEntity, ent2?: McDbEntity, isSame?: boolean) => boolean | undefined | void
        // ‍  多义线找出选中的直线
// ‍ Find the selected straight line with multiple meanings

        if (line instanceof McDbPolyline && selectLineInfo) {
          const { start, end } = selectLineInfo
          line = new McDbLine(start, end)
        }
        let selectOLineInfo!: ReturnType<typeof selectLineSegmentFromPolylineByPoint>
        if (oLine instanceof McDbPolyline) {
          selectOLineInfo = selectLineSegmentFromPolylineByPoint(oLine, opt, 1)
          if (!selectOLineInfo) return exit()
          const { start, end } = selectOLineInfo
          oLine = new McDbLine(start, end)
        }
        oLine = oLine.clone() as McDbEntity
        line = line.clone() as McDbEntity
        if (!oLine || !line) return exit()
        // ‍  处理同一多段线
// ‍ Handling the same polyline

        // ‍  始终只处理直线
// ‍ Always only handle straight lines

        if (oLine instanceof McDbLine && line instanceof McDbLine) {
          // ‍  判断是否是同一条选段
// ‍ Determine if it is the same paragraph selection

          if (oLine.startPoint.isEqualTo(line.startPoint) && oLine.endPoint.isEqualTo(line.endPoint)) {
            showWarning("\n" + t("图元无法用自身倒角"))
            return
          }
          const _intersectPoints = oLine.IntersectWith(line, McDb.Intersect.kOnBothOperands)
          // ‍  两条线段不相交
// ‍ Two line segments do not intersect

          const isEmpty = _intersectPoints.isEmpty()
  
          if (!isEmpty) {
            const _intersectPoint = _intersectPoints.at(0)
            // ‍  交点正好是选中线段的一个点且半径为0 则不处理
// ‍ If the intersection point is exactly one point of the selected line segment and the radius is 0, it will not be processed

            if ((line.startPoint.isEqualTo(_intersectPoint) || line.endPoint.isEqualTo(_intersectPoint)
              || oLine.startPoint.isEqualTo(_intersectPoint) || oLine.endPoint.isEqualTo(_intersectPoint)) && radius === 0) {
              return {
                apply: () => { }
              }
            }
          }
          // ‍  得到延伸直线的交点
// ‍ Obtain the intersection point of the extended straight line

          const interSectPoints = line.IntersectWith(oLine, McDb.Intersect.kExtendBoth)
          // ‍  为空则两直线平行
// ‍ If it is empty, two straight lines are parallel

          if (interSectPoints.isEmpty()) {
            showWarning("\n" + t("两直线平行"))
            return
          }
          const intersectPoint = interSectPoints.at(0)
          // ‍  处理 倒角距离大于拉伸线段后的长度(交点到线段开始点或者结束点最长的距离) 就无法补全闭合
// ‍ If the chamfer distance is greater than the length of the stretched line segment (the longest distance from the intersection point to the starting or ending point of the line segment), the closure cannot be completed

          const isChamferTooLarge = (isStart: boolean, isOStart: boolean, start: McGePoint3d, end: McGePoint3d, oStart: McGePoint3d, oEnd: McGePoint3d, chamferDist: number) => {
            let is = false
            if (isEmpty) {
              is = (Math.max(start.distanceTo(intersectPoint), end.distanceTo(intersectPoint)) < chamferDist && chamferDist > 0)
                || (Math.max(oStart.distanceTo(intersectPoint), oEnd.distanceTo(intersectPoint)) < chamferDist && chamferDist > 0)
            } else {
              is = (isStart ? start.distanceTo(intersectPoint) : end.distanceTo(intersectPoint)) < chamferDist && chamferDist > 0
                || (isOStart ? oStart.distanceTo(intersectPoint) : oEnd.distanceTo(intersectPoint)) < chamferDist && chamferDist > 0
            }
            if (is) {
              showWarning("\n" + t("倒角距离太大"))
            }
            return is
          }
          // ‍  通过判断交点到线段开始点结束点的距离 来确定拉伸线段的开始点还是结束点
// ‍ Determine the starting or ending point of the stretched line segment by measuring the distance from the intersection point to the starting and ending points of the line segment

          apply = (line = lineEnt, oLine = oLineEnt, isSame = line.getHandle() === oLine.getHandle()) => {
            if (line instanceof McDbLine && oLine instanceof McDbLine) {
              // ‍  计算点所选中的线段位置
// ‍ Calculate the position of the selected line segment for the point

              let isStart = isSegmentStartCloserToPoint(line.startPoint, line.endPoint, intersectPoint, pt1)
              let isOStart = isSegmentStartCloserToPoint(oLine.startPoint, oLine.endPoint, intersectPoint, opt)
              const roundJoinInfo = createLineSegmentRoundJoin(radius, line, oLine, intersectPoint, isStart, isOStart, isPruning)
              if(!roundJoinInfo) {
                showWarning("\n" + t("直线平行"))
                return
              }
              const { arc, chamferDist } = roundJoinInfo
              if (isChamferTooLarge(isStart, isOStart, line.startPoint, line.endPoint, oLine.startPoint, oLine.endPoint, chamferDist)) return
              arc && draw(arc)
              return true
            }
            // ‍  处理多段线
// ‍ Handling polylines

            const processPolylineChamferClosure = (
              line: McDbPolyline,
              oLine: McDbEntity,
              pt: McGePoint3d,
              opt: McGePoint3d,
              selectLineInfo: ReturnType<typeof selectLineSegmentFromPolylineByPoint>,
              selectOLineInfo?: ReturnType<typeof selectLineSegmentFromPolylineByPoint>,
            ) => {
              // ‍  得到要处理的多段线点数
// ‍ Obtain the number of polylines to be processed

              const num = line.numVerts()
              if (!isSame) {
                // ‍  多段线倒角则无法闭合
// ‍ Multi segment chamfer cannot be closed

                line.isClosed = false
              }
              // ‍  没有多段线选中线段的信息不处理
// ‍ Information on selected segments without polylines is not processed

              if (!selectLineInfo) return
              const { start, end, endIndex, startIndex, isClosed } = selectLineInfo

              interface PointInfo {
                point: McGePoint3d
                bulge?: number
                startWidth?: number
                endWidth?: number
              }
              const points: PointInfo[] = []
              const getPointInfo = (pl: McDbPolyline, index: number) => {
                const bulge = pl.getBulgeAt(index)
                const point = pl.getPointAt(index).val
 
                const { val1: startWidth, val2: endWidth } = pl.getWidthsAt(index)
                return {
                  point,
                  bulge,
                  startWidth,
                  endWidth
                }
              }
              const isStart = isSegmentStartCloserToPoint(start.clone(), end.clone(), intersectPoint, pt)
              if (oLine instanceof McDbLine) {
                if (isSame) {
                  showWarning("\n" + t("同一条直线无法倒角"))
                  return
                }
                const isOStart = isSegmentStartCloserToPoint(oLine.startPoint.clone(), oLine.endPoint.clone(), intersectPoint, opt)
                const _oline = oLine.clone() as McDbLine
                const roundJoinInfo = createLineSegmentRoundJoin(radius, new McDbLine(start.clone(), end.clone()), _oline, intersectPoint, isStart, isOStart, isPruning)
                if(!roundJoinInfo) {
                  showWarning("\n" + t("直线平行"))
                  return
                }
                const { chamferDist, bulge, segmentLine, arc } = roundJoinInfo
                if (isChamferTooLarge(isStart, isOStart, start, end, oLine.startPoint, oLine.endPoint, chamferDist)) {
                  return
                }

                if (isStart) {
                  const num = isClosed ? line.numVerts() : endIndex
                  for (let index = 0; index < num; index++) {
                    points.push(getPointInfo(line, index))
                  }
                  if (segmentLine) {
                    if (isPruning) {
                      points.push({ point: segmentLine.startPoint, bulge })
                      points.push({ point: segmentLine.endPoint })
                    } else {
                      draw(arc)
                    }
                  } else {
                    points.push({ point: intersectPoint })
                  }

                  if (isOStart) {
                    points.push({ point: _oline.startPoint.clone() })
                  } else {
                    points.push({ point: _oline.endPoint.clone() })
                  }
                } else {
                  const num = line.numVerts()
                  if (isClosed) {
                    points.push(getPointInfo(line, 0))
                  } else {
                    for (let index = endIndex; index < num; index++) {
                      points.push(getPointInfo(line, index))
                    }
                  }
                  if (segmentLine) {
                    if (isPruning) {
                      points.unshift({ point: segmentLine.startPoint })
                      points.unshift({ point: segmentLine.endPoint, bulge: -bulge })
                    } else {
                      draw(segmentLine)
                    }
                  } else {
                    points.unshift({ point: intersectPoint })
                  }
                  if (isOStart) {
                    points.unshift({ point: oLine.startPoint.clone()})
                  } else {
                    points.unshift({ point: oLine.endPoint.clone() })
                  }
                }
              } else if (oLine instanceof McDbPolyline && selectOLineInfo) {
                const { start: oStart, end: oEnd, startIndex: oStratIndex, endIndex: oEndIndex, isClosed: isOClosed } = selectOLineInfo
                const isOStart = isSegmentStartCloserToPoint(oStart, oEnd, intersectPoint, opt)
                const roundJoinInfo = createLineSegmentRoundJoin(radius, new McDbLine(start, end), new McDbLine(oStart, oEnd), intersectPoint, isStart, isOStart, isPruning)
                if(!roundJoinInfo) {
                  showWarning("\n" + t("直线平行"))
                  return
                }
                const { arc, segmentLine, bulge, chamferDist } = roundJoinInfo
                if (isChamferTooLarge(isStart, isOStart, start, end, oStart, oEnd, chamferDist)) {
                  return
                }
                // ‍  同一条多段线处理
// ‍ Processing the same polyline

                if (isSame) {
                  // console.log(isStart, isOStart)
                  const num = line.numVerts()
                  const oNum = oLine.numVerts()
                  // ‍  多段线首尾倒角处理
// ‍ Chamfering treatment at the beginning and end of polylines

                  const isEndToEnd = (startIndex === 0 || startIndex === num - (isClosed ? 1 : 2)) && (oStratIndex === 0 || oStratIndex === oNum - (isOClosed ? 1 : 2)) && num > ((isClosed || isOClosed) ? 2 : 4)
                  const difference = oStratIndex - startIndex
                  if (isEndToEnd) {
                    if (segmentLine) {
                      if (isPruning) {
                        if (startIndex === 0 || oStratIndex === 0) {
                          if (startIndex === 0) {
                            console.log("start1")
                            line.setPointAt(0, segmentLine.startPoint)
                            if (isClosed || isOClosed) {
                              line.addVertexAt(segmentLine.endPoint, -bulge)
                            } else {
                              line.setPointAt(num - 1, segmentLine.endPoint)
                              line.setBulgeAt(num - 1, bulge)
                            }
                          } else {
                            line.setPointAt(0, segmentLine.endPoint)
                            if (isClosed || isOClosed) {
                              line.addVertexAt(segmentLine.startPoint, bulge)
                            } else {
                              line.setPointAt(num - 1, segmentLine.startPoint)
                              line.setBulgeAt(num - 1, bulge)
                            }
                          }
                          line.isClosed = true
                        } else if (isPruning) {
                          line.setPointAt(num - 1, isClosed ? segmentLine.endPoint : segmentLine.startPoint)
                          line.setBulgeAt(num -1, isClosed ? -bulge : bulge)
                          line.addVertexAt(isClosed ? segmentLine.startPoint : segmentLine.endPoint)
                        }
                      } else {
                        draw(arc)
                      }
                    } else if (isPruning) {
                      line.setPointAt(0, intersectPoint)
                      line.removeVertexAt(num - 1)
                      line.isClosed = true
                    }
                    return true
                  }
                  else if (Math.abs(difference) > 2) {
                    showWarning("\n " + t("多段线中的直线必须是连续的或被一条线段断开") + "。")
                    return
                  }
                  else {
                    oLine = oLine.clone() as McDbPolyline
                  }
                }
                if (!(oLine instanceof McDbPolyline)) return
                if (isStart) {
                  for (let index = 0; index <= startIndex; index++) {
                    points.push(getPointInfo(line, index))
                  }
                  if (segmentLine) {
                    if (isPruning) {
                      points.push({ point: segmentLine.startPoint, bulge})
                      points.push({ point: segmentLine.endPoint })
                    } else {
                      draw(arc)
                    }
                  } else {
                    points.push({ point: intersectPoint })
                  }
  
                  if (isOStart) {
                    for (let index = oStratIndex; index >= 0; index--) {
                      points.push(getPointInfo(oLine, index))
                    }
                  } else {
                    if (isOClosed) {
                      points.push(getPointInfo(oLine, 0))
                    } else {
                      const oNum = oLine.numVerts()
                      for (let index = oEndIndex; index < oNum; index++) {
                        points.push(getPointInfo(oLine, index))
                      }
                    }
                  }
                } else {
                  const num = line.numVerts()
                  if (isClosed) {
                    points.push(getPointInfo(line, 0))
                  } else {
                    for (let index = endIndex; index < num; index++) {
                      points.push(getPointInfo(line, index))
                    }
                  }
                  if (segmentLine) {
                    if (isPruning) {
                      points.unshift({ point: segmentLine.startPoint })
                      points.unshift({ point: segmentLine.endPoint, bulge: -bulge })
                    } else {
                      draw(arc)
                    }
                  } else {
                    points.unshift({ point: intersectPoint })
                  }
                  if (isOStart) {
  
                    for (let index = oStratIndex; index >= 0; index--) {
                      points.unshift(getPointInfo(oLine, index))
                    }
                  } else {
  
                    if (isOClosed) {
                      points.unshift(getPointInfo(oLine, 0))
                    } else {
                      const oNum = oLine.numVerts()
                      for (let index = oEndIndex; index < oNum; index++) {
                        points.unshift(getPointInfo(oLine, index))
                      }
                    }
                  }
                }
              } else {
                return false
              }
              if (isPruning) {
                for (let index = 0; index < num; index++) {
                  line.removeVertexAt(0)
                }
                points.forEach(({ point, bulge, startWidth, endWidth }) => {
                  line.addVertexAt(point, bulge, startWidth, endWidth)
                })
                oLine.erase()
              }
              return true
            }
            if (line instanceof McDbPolyline && selectLineInfo) {
              return processPolylineChamferClosure(line, oLine, pt1, opt, selectLineInfo, selectOLineInfo)
            }
            else if (oLine instanceof McDbPolyline && selectOLineInfo) {
              return processPolylineChamferClosure(oLine, line, opt, pt1, selectOLineInfo, selectLineInfo)
            } else {
              return false
            }
          }
          return {
            apply,
            line1: line,
            line2: oLine
          }
        }
      }
      selEntity2.setUserDraw((pt, pw) => {
        let line = lineEnt.clone() as McDbEntity
        const findObjId = MxCADUtility.findEntAtPoint(pt.x, pt.y, pt.z, -1, filter)
        if (!findObjId) return exit()
        if (!findObjId.isValid()) return exit()
        const _oline = findObjId.getMcDbEntity()
        if (!_oline) return exit()
        let oLine = _oline?.clone() as McDbEntity
        if (!oLine) return exit()
        // ‍  处理倒角成功
// ‍ Successfully processed chamfer

        const { line1, line2, apply } = calculateAndApplyFilletBetweenTwoLines(line, oLine, pt, (ent) => {
          console.log(121)
          pw.drawMcDbEntity(ent)
        }) || {}
        const is = apply && apply(line, oLine, lineEnt.getHandle() === _oline.getHandle())
        if (line1 && line2 && is) {
          // ‍  动态绘制
// ‍ Dynamic drawing

          line.drawOrder = lineEnt.drawOrder + _oline.drawOrder + 102
          line1.drawOrder = lineEnt.drawOrder + _oline.drawOrder + 101
          line2.drawOrder = lineEnt.drawOrder + _oline.drawOrder + 101

          const color = new THREE.Color(Number(lineEnt.trueColor.getColorValue(lineEnt.layerId)))
          const darkColor = color.clone()
          if(isPruning) {
            darkenColor(darkColor, 0.5)
            pw.setColor(darkColor)
          }
          pw.drawMcDbEntity(line1)
          pw.drawMcDbEntity(line2)
          pw.setColor(color)  
          pw.drawMcDbEntity(line)
        }
      })
      while(true) {
        selEntity2.setMessage(t("选择第二条直线"));
        selEntity2.setKeyWords(`[${t("半径")}(R)]`)
        let id2 = await selEntity2.go();
        if(selEntity2.isKeyWordPicked("R")) {
          if (typeof await getRadius() !== "number") return
          continue;
        }
        if(!id2) return exit()
        if (!id2.isValid())return exit()
        const oLine = id2.getMcDbEntity()
        if (!oLine) return exit()
        const line = lineEnt
        let pt2 = selEntity2.pickPoint();
        // ‍  按住shift 选择直线以应用角点
// ‍ Press and hold Shift to select a line and apply corner points

        const { line1, line2, apply } = calculateAndApplyFilletBetweenTwoLines(line, oLine, pt2) || {}
  
        if (line1 && line2 && areLinesCollinear(line1, line2)) {
          MxFun.acutPrintf(t("共线直线不能为倒圆角角") + "。")
          return exit()
        }
        if (apply) {
          const is = apply()
          if (isMultiple && typeof is === "undefined") {
            continue;
          } else {
            break;
          }
        } else {
          MxCpp.App.MxCADAssist.MxFillet(objId.id, id2.id, pt1.x, pt1.y, pt2.x, pt2.y, radius, isPruning);
          if (isMultiple) {
            continue;
          } else {
            break;
          }
        }
      }
      exit()
      if (isMultiple) {
        continue;
      } else {
        break;
      }
    }
}

addCommand("m_mx_fillet", m_mx_fillet)
