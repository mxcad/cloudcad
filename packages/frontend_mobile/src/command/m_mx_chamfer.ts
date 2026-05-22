import {
  McDb,
  McDbEntity,
  McDbLine,
  McDbPolyline,
  McGePoint3d,
  McObjectId,
  MxCADResbuf,
  MxCADUiPrAngle,
  MxCADUiPrDist,
  MxCADUiPrEntity,
  MxCADUiPrKeyWord,
  MxCADUtility,
  MxCpp,
} from "mxcad";
import {
  MxFun,
  DynamicInputType,
  DetailedResult,
  MrxDbgUiPrBaseReturn,
  MxType,
} from "mxdraw";
import {
  selectLineSegmentFromPolylineByPoint,
  isSegmentStartCloserToPoint,
  createChamferedLinesFromSegments,
  darkenColor,
  areLinesCollinear,
  copyAttribute,
} from "./m_mx_fillet";
import { addCommand } from "@/plugins/mxcad/command";
import { t } from "@/languages";

async function m_mx_chamfer() {
  /** 倒角距离 */

  let chamferDist = Number(localStorage.getItem("mx_chamfer_dist"));
  let chamferDist1 = Number(localStorage.getItem("mx_chamfer_dist1"));
  if (typeof chamferDist !== "number") chamferDist = 0;
  if (typeof chamferDist1 !== "number") chamferDist1 = 0;
  /**第一根直线的倒角长度和角度 */
  let chamferLength = 0;
  let chamferAngle = 0;
  /** 是否根据角度倒角 */
  let isAngleChamfer = false;
  /** 是否修剪 */
  let isPruning = true;
  /** 是否多个 */
  let isMultiple = false;

  MxFun.acutPrintf(
    `\n(${isPruning ? t("修剪") : t("不修剪")}${t("模式")}) ${t("当前")}${
      isAngleChamfer
        ? t("倒角长度") +
          "= " +
          chamferDist.toFixed(4) +
          ", " +
          t("角度") +
          "= " +
          Math.trunc(chamferAngle / (Math.PI / 180))
        : t("倒角距离") +
          "1" +
          "= " +
          chamferDist.toFixed(4) +
          ", " +
          t("距离") +
          "2" +
          "= " +
          chamferDist1.toFixed(4)
    }\n`
  );

  // ‍  指定距离
  // ‍ Specify distance

  const getChamferDists = async () => {
    const getDist = new MxCADUiPrDist();
    getDist.setOffsetInputPostion(true);
    getDist.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getDist.setDynamicInputType(DynamicInputType.kXYCoordInput);
    getDist.setMessage(`${t("指定第一个倒角距离")}<${chamferDist.toFixed(4)}>`);
    getDist.setKeyWords("");
    const dist = await getDist.go();

    if (typeof dist !== "number") return;
    chamferDist = dist;

    getDist.setMessage(
      `${t("指定第二个倒角距离")}<${chamferDist1.toFixed(4)}>`
    );
    getDist.setKeyWords("");
    const dist1 = await getDist.go();
    if (typeof dist1 !== "number") return;
    chamferDist1 = dist1;
    localStorage.setItem("mx_chamfer_dist", chamferDist.toString());
    localStorage.setItem("mx_chamfer_dist1", chamferDist1.toString());
    isAngleChamfer = false;
    return [chamferDist, chamferDist1];
  };
  const getChamferAngle = async () => {
    const getDist = new MxCADUiPrDist();
    getDist.setOffsetInputPostion(true);
    getDist.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getDist.setMessage(
      `${t("指定第一条直线的倒角长度")}<${chamferLength.toFixed(4)}>`
    );
    getDist.setKeyWords("");
    getDist.clearLastInputPoint();
    const length = await getDist.go();
    if (typeof length !== "number") return;
    chamferLength = length;
    const getAngle = new MxCADUiPrAngle();
    getAngle.setMessage(
      `${t("指定第一条直线的倒角角度")}<${Math.trunc(
        chamferAngle / (Math.PI / 180)
      )}>`
    );
    getAngle.setKeyWords("");
    getDist.clearLastInputPoint();
    const angle = await getAngle.go();
    if (typeof angle !== "number") return;
    if (getAngle.getDetailedResult() === DetailedResult.kCoordIn) {
      chamferAngle = angle * (Math.PI / 180);
    } else {
      chamferAngle = angle;
    }
    isAngleChamfer = true;
    return [chamferLength, chamferAngle];
  };
  /** 根据第一条直线长度和倒角角度计算第二条直线倒角长度
/**Calculate the chamfer length of the second line based on the length of the first line and the chamfer angle
/**Calculate the chamfer length of the second line based on the length of the first line and the chamfer angle

/**Calculate the chamfer length of the second line based on the length of the first line and the chamfer angle

/**Calculate the chamfer length of the second line based on the length of the first line and the chamfer angle


/**Calculate the chamfer length of the second line based on the length of the first line and the chamfer angle
/**Calculate the chamfer length of the second line based on the length of the first line and the chamfer angle


/**Calculate the chamfer length of the second line based on the length of the first line and the chamfer angle

     */
  const calculateChamferDist2 = (
    line1: McDbLine,
    line2: McDbLine,
    dist: number,
    angle: number
  ) => {
    const startPoint = line1.startPoint.clone();
    const midPoint = line2.startPoint.clone();
    const endPoint = line2.endPoint.clone();
    const point = midPoint
      .clone()
      .addvec(midPoint.sub(startPoint).normalize().mult(-dist));
    const vet = point.sub(midPoint).rotateBy(-angle).mult(-dist);
    const point1 = point.clone().addvec(vet);
    const rayLine = new McDbLine(point, point1);
    const rayLine1 = new McDbLine(
      midPoint,
      endPoint.clone().addvec(midPoint.sub(endPoint).normalize().mult(-dist))
    );
    const intersectPoints = rayLine.IntersectWith(
      rayLine1,
      McDb.Intersect.kExtendBoth
    );
    if (intersectPoints.isEmpty()) {
      return;
    }
    const intersectPoint = intersectPoints.at(0);
    return intersectPoint.distanceTo(midPoint);
  };
  while (true) {
    const getEnt = new MxCADUiPrEntity();
    getEnt.setDynamicInputType(DynamicInputType.kNoInput);
    const filter = new MxCADResbuf();
    filter.AddMcDbEntityTypes("LINE,LWPOLYLINE");
    getEnt.setFilter(filter);
    getEnt.setMessage(t("选择一条直线"));
    getEnt.setKeyWords(
      `[${t("放弃")}(U)/${t("多段线")}(P)/${t("距离")}(D)/${t("角度")}(A)/${t(
        "修剪"
      )}(T)/${t("方式")}(E)/${t("多个")}(M)]`
    );
    const objId = await getEnt.go();

    if (getEnt.isKeyWordPicked("U")) {
      continue;
    }
    if (getEnt.isKeyWordPicked("P")) {
      while (true) {
        const getEnt = new MxCADUiPrEntity();
        getEnt.setDynamicInputType(DynamicInputType.kNoInput);
        const filter = new MxCADResbuf();
        filter.AddMcDbEntityTypes("LWPOLYLINE");
        getEnt.setMessage(t("选择二维多段线"));
        getEnt.setKeyWords(`[${t("距离")}(D)/${t("角度")}(A)/${t("方法")}(M)]`);

        const createNewEnts = (objId: McObjectId) => {
          const ent = objId.getMcDbEntity();
          if (!(ent instanceof McDbPolyline)) return;
          const length = ent.numVerts();
          if (length < 3) {
            return MxFun.acutPrintf(t("没有线可以形成倒角") + "\n");
          }
          let dist1 = chamferDist;
          let dist2 = chamferDist1;
          if (isAngleChamfer) {
            const startPoint = ent.getPointAt(0).val;
            const midPoint = ent.getPointAt(1).val;
            const endPoint = ent.getPointAt(2).val;
            dist1 = chamferLength;
            const val = calculateChamferDist2(
              new McDbLine(startPoint, midPoint),
              new McDbLine(midPoint, endPoint),
              chamferLength,
              chamferAngle
            );
            if (typeof val !== "number") {
              return MxFun.acutPrintf("\n" + t("n倒角角度无效") + "。");
            }
            dist2 = val;
          }
          const pl = new McDbPolyline();
          pl.isClosed = ent.isClosed;
          let linePoints: McGePoint3d[] = [];
          const getChamferPoints = (
            point: McGePoint3d,
            nextPoint: McGePoint3d,
            isReverse = false
          ) => {
            const vet = point
              .sub(nextPoint)
              .normalize()
              .mult(isReverse ? -dist2 : -dist1);
            const pt1 = point.clone().addvec(vet);
            const vet1 = nextPoint
              .sub(point)
              .normalize()
              .mult(isReverse ? -dist1 : -dist2);
            const pt2 = nextPoint.clone().addvec(vet1);
            return [pt1, pt2] as [McGePoint3d, McGePoint3d];
          };
          const addChamferLine = (
            point: McGePoint3d,
            nextPoint: McGePoint3d,
            isReverse = false
          ) => {
            const [pt1, pt2] = getChamferPoints(point, nextPoint, isReverse);
            if (isPruning) {
              pl.addVertexAt(pt1);
              pl.addVertexAt(pt2);
            } else {
              linePoints.push(pt1, pt2);
            }
          };
          for (let index = 0; index < length; index++) {
            const point = ent.getPointAt(index).val;
            const nextPoint = ent.getPointAt(index + 1).val;
            if (ent.isClosed) {
              if (index !== length - 1) {
                addChamferLine(point, nextPoint);
              }
            } else {
              if (index === 0) {
                pl.addVertexAt(point);
                const vet1 = nextPoint.sub(point).normalize().mult(-dist1);
                const pt = nextPoint.clone().addvec(vet1);
                pl.addVertexAt(nextPoint.clone().addvec(vet1));
                linePoints.unshift(pt);
              } else if (index === length - 2) {
                const vet1 = point.sub(nextPoint).normalize().mult(-dist2);
                const pt = point.clone().addvec(vet1);
                pl.addVertexAt(pt);
                pl.addVertexAt(nextPoint);
                linePoints.push(pt);
              } else {
                if (index !== length - 1) {
                  addChamferLine(point, nextPoint, true);
                }
              }
            }
          }
          if (ent.isClosed) {
            addChamferLine(
              ent.getPointAt(length - 1).val,
              ent.getPointAt(0).val
            );
          }
          if (isPruning) {
            copyAttribute(pl, ent);
            return pl;
          } else {
            let line: McGePoint3d[] = [];
            const lines: McDbLine[] = [];
            if (ent.isClosed) {
              linePoints.unshift(linePoints[linePoints.length - 1]);
            }
            linePoints.forEach((point) => {
              line.push(point);
              if (line.length === 2) {
                const mcLine = new McDbLine(line[0], line[1]);
                copyAttribute(mcLine, ent);
                lines.push(mcLine);
                line = [];
              }
            });
            return lines;
          }
        };
        const objId = await getEnt.go();
        if (getEnt.isKeyWordPicked("D")) {
          if (!(await getChamferDists())) return;
          continue;
        }
        if (getEnt.isKeyWordPicked("A")) {
          if (!(await getChamferAngle())) return;
          continue;
        }
        if (getEnt.isKeyWordPicked("M")) {
          isMultiple = true;
          continue;
        }
        if (getEnt.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return;
        if (!objId) continue;
        if (!objId.isValid()) continue;
        const val = createNewEnts(objId);
        if (!val) {
          if (isMultiple) {
            continue;
          } else {
            return;
          }
        }
        const ent = objId.getMcDbEntity();
        if (!ent) {
          if (isMultiple) {
            continue;
          } else {
            return;
          }
        }
        if (val instanceof McDbPolyline) {
          if (!(ent instanceof McDbPolyline)) return;
          const num = ent.numVerts();
          for (let index = 0; index < num; index++) {
            ent.removeVertexAt(0);
          }
          const vNum = val.numVerts();
          for (let index = 0; index < vNum; index++) {
            const { val1, val2 } = val.getWidthsAt(index);
            ent.addVertexAt(
              val.getPointAt(index).val,
              val.getBulgeAt(index),
              val1,
              val2
            );
          }
        } else {
          val.forEach((line) => {
            MxCpp.getCurrentMxCAD().drawEntity(line);
          });
          ent.visible = true;
        }
        if (isMultiple) {
          continue;
        } else {
          return;
        }
      }
    }
    if (getEnt.isKeyWordPicked("D")) {
      if (!(await getChamferDists())) return;
      continue;
    }
    if (getEnt.isKeyWordPicked("A")) {
      if (!(await getChamferAngle())) return;
      continue;
    }
    if (getEnt.isKeyWordPicked("T")) {
      const getKey = new MxCADUiPrKeyWord();
      getKey.setMessage(
        `${t("输入修剪模式选项")}<${isPruning ? t("修剪") : t("不修剪")}>`
      );
      getKey.setKeyWords(`[${t("修剪")}(T)/${t("不修剪")}(N)]`);
      const key = await getKey.go();
      if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kCancel) {
        return;
      }
      if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kNone) {
        continue;
      }
      if (!key) return;
      if (key.toLocaleLowerCase() === "t") {
        isPruning = true;
        continue;
      }
      if (key.toLocaleLowerCase() === "n") {
        isPruning = false;
        continue;
      }
    }
    if (getEnt.isKeyWordPicked("E")) {
      const getKey = new MxCADUiPrKeyWord();
      getKey.setMessage(
        `${t("输入剪切方法")}<${isAngleChamfer ? t("角度") : t("距离")}>`
      );
      getKey.setKeyWords(`[${t("距离")}(D)/${t("角度")}(A)]`);
      const key = await getKey.go();
      if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kCancel) {
        return;
      }
      if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kNone) {
        continue;
      }
      if (typeof key !== "string") return;
      if (key.toLocaleLowerCase() === "d") {
        isAngleChamfer = false;
        continue;
      }
      if (key.toLocaleLowerCase() === "a") {
        isAngleChamfer = true;
        continue;
      }
    }
    if (getEnt.isKeyWordPicked("M")) {
      isMultiple = true;
      continue;
    }

    if (getEnt.getStatus() === MrxDbgUiPrBaseReturn.kCancel) {
      return;
    }
    if (!objId) continue;
    if (!objId.isValid()) continue;
    const pt1 = getEnt.pickPoint();
    const lineEnt = objId.getMcDbEntity();
    if (!lineEnt) continue;
    const filter1 = new MxCADResbuf();
    filter1.AddMcDbEntityTypes("LINE,LWPOLYLINE");
    if (lineEnt instanceof McDbLine) {
      lineEnt.highlight(true);
    }
    let selectLineInfo:
      | ReturnType<typeof selectLineSegmentFromPolylineByPoint>
      | undefined;
    if (lineEnt instanceof McDbPolyline) {
      selectLineInfo = selectLineSegmentFromPolylineByPoint(
        lineEnt,
        pt1,
        MxFun.viewCoordLong2Cad(2)
      );
      if (!selectLineInfo) {
        continue;
      }
    }

    /**  ‍ 触发自动补全因为倒角距离过长无法闭合的提示记录 */
    /** ‍ Trigger auto completion for prompt record that cannot be closed due to excessive chamfer distance*/

    let isChamferLengthWarningShow = false;
    const showWarning = (text: string) => {
      // ‍  避免重复一直提示
      // ‍ Avoid repeating and constantly prompting

      if (isChamferLengthWarningShow) {
        MxFun.acutPrintf(text);
        isChamferLengthWarningShow = false;
      }
    };
    // ‍  退出操作
    // ‍ Exit operation

    const exit = () => {
      // ‍  重新允许提示倒角距离警告
      // ‍ Allow the warning of chamfer distance to be prompted again

      isChamferLengthWarningShow = true;
      lineEnt.highlight(false);
    };
    // ‍  处理倒角
    // ‍ Processing chamfers

    const calculateAndApplyChamferBetweenTwoLines = (
      line: McDbEntity,
      oLine: McDbEntity,
      opt: McGePoint3d,
      chamferDist: number,
      chamferDist1: number,
      draw = (line: McDbEntity) => {
        MxCpp.getCurrentMxCAD().drawEntity(line);
      }
    ) => {
      const lineEnt = line;
      const oLineEnt = oLine;
      // ‍  应用倒角函数 传入选中的图元将直接应用倒角修改图元本身, 如果为传入，则默认采用处理倒角时传入的图元
      // ‍ Applying the chamfer function to the selected element will directly apply the chamfer to modify the element itself. If it is passed in, the element passed in during chamfer processing will be used by default

      let apply!: (
        ent1?: McDbEntity,
        ent2?: McDbEntity,
        isSame?: boolean
      ) => boolean | undefined | void;
      // ‍  多义线找出选中的直线
      // ‍ Find the selected straight line with multiple meanings

      if (line instanceof McDbPolyline && selectLineInfo) {
        const { start, end } = selectLineInfo;
        line = new McDbLine(start, end);
      }
      let selectOLineInfo!: ReturnType<
        typeof selectLineSegmentFromPolylineByPoint
      >;
      if (oLine instanceof McDbPolyline) {
        selectOLineInfo = selectLineSegmentFromPolylineByPoint(oLine, opt, 1);
        if (!selectOLineInfo) return exit();
        const { start, end } = selectOLineInfo;
        oLine = new McDbLine(start, end);
      }
      oLine = oLine.clone() as McDbEntity;
      line = line.clone() as McDbEntity;
      if (!oLine || !line) return exit();
      // ‍  处理同一多段线
      // ‍ Handling the same polyline

      // ‍  始终只处理直线
      // ‍ Always only handle straight lines

      if (oLine instanceof McDbLine && line instanceof McDbLine) {
        // ‍  判断是否是同一条选段
        // ‍ Determine if it is the same paragraph selection

        if (
          oLine.startPoint.isEqualTo(line.startPoint) &&
          oLine.endPoint.isEqualTo(line.endPoint)
        ) {
          showWarning("\n" + t("图元无法用自身倒角"));
          return;
        }
        const _intersectPoints = oLine.IntersectWith(
          line,
          McDb.Intersect.kOnBothOperands
        );
        // ‍  两条线段不相交
        // ‍ Two line segments do not intersect

        const isEmpty = _intersectPoints.isEmpty();

        if (!isEmpty) {
          const _intersectPoint = _intersectPoints.at(0);
          // ‍  交点正好是选中线段的一个点且倒角距离为0 则不处理
          // ‍ If the intersection point is exactly one point of the selected line segment and the chamfer distance is 0, it will not be processed

          if (
            (line.startPoint.isEqualTo(_intersectPoint) ||
              line.endPoint.isEqualTo(_intersectPoint) ||
              oLine.startPoint.isEqualTo(_intersectPoint) ||
              oLine.endPoint.isEqualTo(_intersectPoint)) &&
            chamferDist === 0 &&
            chamferDist1 === 0
          ) {
            return {
              apply: () => {},
            };
          }
        }
        // ‍  得到延伸直线的交点
        // ‍ Obtain the intersection point of the extended straight line

        const interSectPoints = line.IntersectWith(
          oLine,
          McDb.Intersect.kExtendBoth
        );
        // ‍  为空则两直线平行
        // ‍ If it is empty, two straight lines are parallel

        if (interSectPoints.isEmpty()) {
          showWarning("\n" + t("两直线平行"));
          return;
        }
        const intersectPoint = interSectPoints.at(0);
        // ‍  处理 倒角距离大于拉伸线段后的长度(交点到线段开始点或者结束点最长的距离) 就无法补全闭合
        // ‍ If the chamfer distance is greater than the length of the stretched line segment (the longest distance from the intersection point to the starting or ending point of the line segment), the closure cannot be completed

        const isChamferTooLarge = (
          isStart: boolean,
          isOStart: boolean,
          start: McGePoint3d,
          end: McGePoint3d,
          oStart: McGePoint3d,
          oEnd: McGePoint3d
        ) => {
          let is = false;
          if (isEmpty) {
            is =
              (Math.max(
                start.distanceTo(intersectPoint),
                end.distanceTo(intersectPoint)
              ) < chamferDist &&
                chamferDist > 0) ||
              (Math.max(
                oStart.distanceTo(intersectPoint),
                oEnd.distanceTo(intersectPoint)
              ) < chamferDist1 &&
                chamferDist1 > 0);
          } else {
            is =
              ((isStart
                ? start.distanceTo(intersectPoint)
                : end.distanceTo(intersectPoint)) < chamferDist &&
                chamferDist > 0) ||
              ((isOStart
                ? oStart.distanceTo(intersectPoint)
                : oEnd.distanceTo(intersectPoint)) < chamferDist1 &&
                chamferDist1 > 0);
          }
          if (is) {
            showWarning("\n" + t("倒角距离太大"));
          }
          return is;
        };
        // ‍  通过判断交点到线段开始点结束点的距离 来确定拉伸线段的开始点还是结束点
        // ‍ Determine the starting or ending point of the stretched line segment by measuring the distance from the intersection point to the starting and ending points of the line segment

        apply = (
          line = lineEnt,
          oLine = oLineEnt,
          isSame = line.getHandle() === oLine.getHandle()
        ) => {
          if (line instanceof McDbLine && oLine instanceof McDbLine) {
            // ‍  计算点所选中的线段位置
            // ‍ Calculate the position of the selected line segment for the point

            let isStart = isSegmentStartCloserToPoint(
              line.startPoint,
              line.endPoint,
              intersectPoint,
              pt1
            );
            let isOStart = isSegmentStartCloserToPoint(
              oLine.startPoint,
              oLine.endPoint,
              intersectPoint,
              opt
            );
            if (
              isChamferTooLarge(
                isStart,
                isOStart,
                line.startPoint,
                line.endPoint,
                oLine.startPoint,
                oLine.endPoint
              )
            )
              return;
            const segmentLine = createChamferedLinesFromSegments(
              line,
              oLine,
              intersectPoint,
              isStart,
              isOStart,
              chamferDist,
              chamferDist1,
              isPruning
            );
            segmentLine && draw(segmentLine);
            return true;
          }
          // ‍  处理多段线
          // ‍ Handling polylines

          const processPolylineChamferClosure = (
            line: McDbPolyline,
            oLine: McDbEntity,
            pt: McGePoint3d,
            opt: McGePoint3d,
            selectLineInfo: ReturnType<
              typeof selectLineSegmentFromPolylineByPoint
            >,
            selectOLineInfo?: ReturnType<
              typeof selectLineSegmentFromPolylineByPoint
            >
          ) => {
            // ‍  得到要处理的多段线点数
            // ‍ Obtain the number of polylines to be processed

            const num = line.numVerts();
            if (!isSame) {
              // ‍  多段线倒角则无法闭合
              // ‍ Multi segment chamfer cannot be closed

              line.isClosed = false;
            }
            // ‍  没有多段线选中线段的信息不处理
            // ‍ Information on selected segments without polylines is not processed

            if (!selectLineInfo) return;
            const { start, end, endIndex, startIndex, isClosed } =
              selectLineInfo;

            interface PointInfo {
              point: McGePoint3d;
              bulge?: number;
              startWidth?: number;
              endWidth?: number;
            }
            const points: PointInfo[] = [];
            const getPointInfo = (pl: McDbPolyline, index: number) => {
              const bulge = pl.getBulgeAt(index);
              const point = pl.getPointAt(index).val;

              const { val1: startWidth, val2: endWidth } =
                pl.getWidthsAt(index);
              return {
                point,
                bulge,
                startWidth,
                endWidth,
              };
            };
            const isStart = isSegmentStartCloserToPoint(
              start.clone(),
              end.clone(),
              intersectPoint,
              pt
            );
            if (oLine instanceof McDbLine) {
              if (isSame) {
                showWarning("\n" + t("同一条直线无法倒角"));
                return;
              }
              const isOStart = isSegmentStartCloserToPoint(
                oLine.startPoint.clone(),
                oLine.endPoint.clone(),
                intersectPoint,
                opt
              );
              if (
                isChamferTooLarge(
                  isStart,
                  isOStart,
                  start,
                  end,
                  oLine.startPoint,
                  oLine.endPoint
                )
              ) {
                return;
              }
              const _oline = oLine.clone() as McDbLine;
              const segmentLine = createChamferedLinesFromSegments(
                new McDbLine(start.clone(), end.clone()),
                _oline,
                intersectPoint,
                isStart,
                isOStart,
                chamferDist,
                chamferDist1,
                isPruning
              );
              if (isStart) {
                const num = isClosed ? line.numVerts() : endIndex;
                for (let index = 0; index < num; index++) {
                  points.push(getPointInfo(line, index));
                }
                if (segmentLine) {
                  if (isPruning) {
                    points.push({ point: segmentLine.startPoint });
                    points.push({ point: segmentLine.endPoint });
                  } else {
                    draw(segmentLine);
                  }
                } else {
                  points.push({ point: intersectPoint });
                }

                if (isOStart) {
                  points.push({ point: _oline.startPoint.clone() });
                } else {
                  points.push({ point: _oline.endPoint.clone() });
                }
              } else {
                const num = line.numVerts();
                if (isClosed) {
                  points.push(getPointInfo(line, 0));
                } else {
                  for (let index = endIndex; index < num; index++) {
                    points.push(getPointInfo(line, index));
                  }
                }
                if (segmentLine) {
                  if (isPruning) {
                    points.unshift({ point: segmentLine.startPoint });
                    points.unshift({ point: segmentLine.endPoint });
                  } else {
                    draw(segmentLine);
                  }
                } else {
                  points.unshift({ point: intersectPoint });
                }
                if (isOStart) {
                  points.unshift({ point: oLine.startPoint.clone() });
                } else {
                  points.unshift({ point: oLine.endPoint.clone() });
                }
              }
            } else if (oLine instanceof McDbPolyline && selectOLineInfo) {
              const {
                start: oStart,
                end: oEnd,
                startIndex: oStratIndex,
                endIndex: oEndIndex,
                isClosed: isOClosed,
              } = selectOLineInfo;
              const isOStart = isSegmentStartCloserToPoint(
                oStart,
                oEnd,
                intersectPoint,
                opt
              );
              if (
                isChamferTooLarge(isStart, isOStart, start, end, oStart, oEnd)
              ) {
                return;
              }
              const segmentLine = createChamferedLinesFromSegments(
                new McDbLine(start, end),
                new McDbLine(oStart, oEnd),
                intersectPoint,
                isStart,
                isOStart,
                chamferDist,
                chamferDist1,
                isPruning
              );
              // ‍  同一条多段线处理
              // ‍ Processing the same polyline

              if (isSame) {
                const num = line.numVerts();
                const oNum = oLine.numVerts();
                // ‍  多段线首尾倒角处理
                // ‍ Chamfering treatment at the beginning and end of polylines

                const isEndToEnd =
                  (startIndex === 0 ||
                    startIndex === num - (isClosed ? 1 : 2)) &&
                  (oStratIndex === 0 ||
                    oStratIndex === oNum - (isOClosed ? 1 : 2)) &&
                  num > (isClosed || isOClosed ? 2 : 4);
                const difference = oStratIndex - startIndex;
                if (isEndToEnd) {
                  if (segmentLine) {
                    if (isPruning) {
                      if (startIndex === 0 || oStratIndex === 0) {
                        if (startIndex === 0) {
                          line.setPointAt(0, segmentLine.startPoint);
                          if (isClosed || isOClosed) {
                            line.addVertexAt(segmentLine.endPoint);
                          } else {
                            line.setPointAt(num - 1, segmentLine.endPoint);
                          }
                        } else {
                          line.setPointAt(0, segmentLine.endPoint);
                          if (isClosed || isOClosed) {
                            line.addVertexAt(segmentLine.startPoint);
                          } else {
                            line.setPointAt(num - 1, segmentLine.startPoint);
                          }
                        }
                        line.isClosed = true;
                      } else if (isPruning) {
                        line.setPointAt(
                          num - 1,
                          isClosed
                            ? segmentLine.endPoint
                            : segmentLine.startPoint
                        );
                        line.addVertexAt(
                          isClosed
                            ? segmentLine.startPoint
                            : segmentLine.endPoint
                        );
                      }
                    } else {
                      draw(segmentLine);
                    }
                  } else if (isPruning) {
                    line.setPointAt(0, intersectPoint);
                    line.removeVertexAt(num - 1);
                    line.isClosed = true;
                  }
                  return true;
                } else if (Math.abs(difference) > 2) {
                  showWarning(
                    "\n" +
                      t("多段线中的直线必须是连续的或被一条线段断开") +
                      "。"
                  );
                  return;
                } else {
                  oLine = oLine.clone() as McDbPolyline;
                }
              }
              if (!(oLine instanceof McDbPolyline)) return;
              if (isStart) {
                for (let index = 0; index <= startIndex; index++) {
                  points.push(getPointInfo(line, index));
                }
                if (segmentLine) {
                  if (isPruning) {
                    points.push({ point: segmentLine.startPoint });
                    points.push({ point: segmentLine.endPoint });
                  } else {
                    draw(segmentLine);
                  }
                } else {
                  points.push({ point: intersectPoint });
                }

                if (isOStart) {
                  for (let index = oStratIndex; index >= 0; index--) {
                    points.push(getPointInfo(oLine, index));
                  }
                } else {
                  if (isOClosed) {
                    points.push(getPointInfo(oLine, 0));
                  } else {
                    const oNum = oLine.numVerts();
                    for (let index = oEndIndex; index < oNum; index++) {
                      points.push(getPointInfo(oLine, index));
                    }
                  }
                }
              } else {
                const num = line.numVerts();
                if (isClosed) {
                  points.push(getPointInfo(line, 0));
                } else {
                  for (let index = endIndex; index < num; index++) {
                    points.push(getPointInfo(line, index));
                  }
                }
                if (segmentLine) {
                  if (isPruning) {
                    points.unshift({ point: segmentLine.startPoint });
                    points.unshift({ point: segmentLine.endPoint });
                  } else {
                    draw(segmentLine);
                  }
                } else {
                  points.unshift({ point: intersectPoint });
                }
                if (isOStart) {
                  for (let index = oStratIndex; index >= 0; index--) {
                    points.unshift(getPointInfo(oLine, index));
                  }
                } else {
                  if (isOClosed) {
                    points.unshift(getPointInfo(oLine, 0));
                  } else {
                    const oNum = oLine.numVerts();
                    for (let index = oEndIndex; index < oNum; index++) {
                      points.unshift(getPointInfo(oLine, index));
                    }
                  }
                }
              }
            } else {
              return false;
            }
            if (isPruning) {
              for (let index = 0; index < num; index++) {
                line.removeVertexAt(0);
              }
              points.forEach(({ point, bulge, startWidth, endWidth }) => {
                line.addVertexAt(point, bulge, startWidth, endWidth);
              });
              oLine.erase();
            }
            return true;
          };
          if (line instanceof McDbPolyline && selectLineInfo) {
            return processPolylineChamferClosure(
              line,
              oLine,
              pt1,
              opt,
              selectLineInfo,
              selectOLineInfo
            );
          } else if (oLine instanceof McDbPolyline && selectOLineInfo) {
            return processPolylineChamferClosure(
              oLine,
              line,
              opt,
              pt1,
              selectOLineInfo,
              selectLineInfo
            );
          } else {
            return false;
          }
        };
        return {
          apply,
          line1: line,
          line2: oLine,
        };
      }
    };
    getEnt.setUserDraw((pt, pw) => {
      let line = lineEnt.clone() as McDbEntity;
      const findObjId = MxCADUtility.findEntAtPoint(
        pt.x,
        pt.y,
        pt.z,
        -1,
        filter1
      );
      if (!findObjId) return exit();
      if (!findObjId.isValid()) return exit();
      const _oline = findObjId.getMcDbEntity();
      if (!_oline) return exit();
      let oLine = _oline?.clone() as McDbEntity;
      if (!oLine) return exit();
      // ‍  处理倒角成功
      // ‍ Successfully processed chamfer

      const { line1, line2, apply } =
        calculateAndApplyChamferBetweenTwoLines(
          line,
          oLine,
          pt,
          chamferDist,
          chamferDist1,
          (ent) => {
            pw.drawMcDbEntity(ent);
          }
        ) || {};
      const is =
        apply && apply(line, oLine, lineEnt.getHandle() === _oline.getHandle());
      if (line1 && line2 && is) {
        // ‍  动态绘制
        // ‍ Dynamic drawing

        line.drawOrder = lineEnt.drawOrder + _oline.drawOrder + 102;
        line1.drawOrder = lineEnt.drawOrder + _oline.drawOrder + 101;
        line2.drawOrder = lineEnt.drawOrder + _oline.drawOrder + 101;

        const color = new THREE.Color(
          Number(lineEnt.trueColor.getColorValue(lineEnt.layerId))
        );
        const darkColor = color.clone();
        if (isPruning) {
          darkenColor(darkColor, 0.5);
          pw.setColor(darkColor);
        }
        pw.drawMcDbEntity(line1);
        pw.drawMcDbEntity(line2);
        pw.setColor(color);
        pw.drawMcDbEntity(line);
      }
    });
    // ‍  选择第二条线
    // ‍ Select the second line

    while (true) {
      getEnt.setMessage(t("选择第二条直线"));
      getEnt.setKeyWords(`[${t("距离")}(D)/${t("角度")}(A)/${t("方法")}(M)]`);
      const oLineId = await getEnt.go();
      if (getEnt.isKeyWordPicked("D")) {
        if (!(await getChamferDists())) return;
        continue;
      }
      if (getEnt.isKeyWordPicked("A")) {
        if (!(await getChamferAngle())) return;
        continue;
      }
      if (getEnt.isKeyWordPicked("M")) {
        isMultiple = true;
        continue;
      }
      if (getEnt.getStatus() === MrxDbgUiPrBaseReturn.kCancel) {
        return;
      }
      if (!oLineId) return exit();
      if (!oLineId.isValid()) return exit();
      const oLine = oLineId.getMcDbEntity();
      if (!oLine) return exit();
      const line = lineEnt;
      const pt2 = getEnt.pickPoint();

      const _line = line.clone() as McDbLine;
      if (!_line) {
        if (isMultiple) {
          continue;
        } else {
          return exit();
        }
      }
      const _oLine = line.clone() as McDbLine;
      if (!_oLine) {
        if (isMultiple) {
          continue;
        } else {
          return exit();
        }
      }
      const iPoints = _line.IntersectWith(
        _oLine,
        McDb.Intersect.kOnBothOperands
      );
      if (iPoints.isEmpty()) {
        if (isMultiple) {
          continue;
        } else {
          return exit();
        }
      }
      let dist1 = chamferDist;
      let dist2 = chamferDist1;
      if (isAngleChamfer) {
        const iPoint = iPoints.at(0);
        const val = calculateChamferDist2(
          new McDbLine(pt1, iPoint),
          new McDbLine(iPoint, pt2),
          chamferLength,
          chamferAngle
        );
        if (typeof val !== "number") {
          MxFun.acutPrintf("\n" + t("n倒角角度无效") + "。");
          if (isMultiple) {
            continue;
          } else {
            return exit();
          }
        }
        dist1 = chamferLength;
        dist2 = val;
      }
      // ‍  按住shift 选择直线以应用角点
      // ‍ Press and hold Shift to select a line and apply corner points

      const { line1, line2, apply } =
        calculateAndApplyChamferBetweenTwoLines(
          line,
          oLine,
          pt2,
          dist1,
          dist2
        ) || {};

      if (line1 && line2 && areLinesCollinear(line1, line2)) {
        MxFun.acutPrintf(t("共线直线不能为倒角") + "。");
        return exit();
      }
      if (apply) {
        const is = apply();
        if (isMultiple && typeof is === "undefined") {
          continue;
        } else {
          break;
        }
      } else {
        MxCpp.App.MxCADAssist.MxChamfer(
          objId.id,
          oLineId.id,
          pt1.x,
          pt1.y,
          pt2.x,
          pt2.y,
          dist1,
          dist2,
          isPruning
        );
        if (isMultiple) {
          continue;
        } else {
          break;
        }
      }
    }
    // ‍  结束第一条线的高亮选中
    // ‍ End the highlight selection of the first line

    if (lineEnt instanceof McDbLine) lineEnt.highlight(false);
    if (isMultiple) {
      continue;
    } else {
      exit();
      break;
    }
  }
}
addCommand("m_mx_chamfer", m_mx_chamfer);
