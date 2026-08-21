import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { IsZero, McDb, McDbArc, McDbLine, McDbPolyline, McGePoint3d, McGePoint3dArray, McGeVector3d, McObjectId, MxCADUiPrAngle, MxCADUiPrDist, MxCADUiPrPoint, MxCADUtility, MxCpp, _ML_String } from "mxcad";
import { MxType, MxFun, MrxDbgUiPrBaseReturn } from "mxdraw"
export function CMxDrawPolylineDragArcDraw_CalcArcBulge(firstPoint: McGePoint3d, nextPoint: McGePoint3d, vecArcTangent: McGeVector3d): number {
    if (firstPoint.isEqualTo(nextPoint))
        return 0.0;
    let midPt = firstPoint.c().addvec(nextPoint.c().sub(firstPoint).mult(0.5));

    let vecMid = nextPoint.c().sub(firstPoint);
    vecMid.rotateBy(Math.PI / 2.0, McGeVector3d.kZAxis);

    let tmpMidLine = new McDbLine(midPt, midPt.c().addvec(vecMid));

    let vecVertical: McGeVector3d = vecArcTangent.c();
    vecVertical.rotateBy(Math.PI / 2.0, McGeVector3d.kZAxis);

    let tmpVerticalLine = new McDbLine(firstPoint, firstPoint.c().addvec(vecVertical));

    let aryPoint: McGePoint3dArray = tmpMidLine.IntersectWith(tmpVerticalLine, McDb.Intersect.kExtendBoth);
    if (aryPoint.isEmpty())
        return 0.0;

    let arcCenPoint = aryPoint.at(0);

    let dR = arcCenPoint.distanceTo(firstPoint);

    vecMid.normalize();
    vecMid.mult(dR);

    let arcMidPt1 = arcCenPoint.c().addvec(vecMid);
    let arcMidPt2 = arcCenPoint.c().subvec(vecMid);
    let vecArcDir1 = arcMidPt1.c().sub(firstPoint);
    let vecArcDir2 = arcMidPt2.c().sub(firstPoint);
    let arcMidPt = arcMidPt1;
    if (vecArcDir1.angleTo1(vecArcTangent) > vecArcDir2.angleTo1(vecArcTangent)) {
        arcMidPt = arcMidPt2;
    }
    return MxCADUtility.calcBulge(firstPoint, arcMidPt, nextPoint).val;
}

/**  ‍ 绘多义线 */
/** ‍ Draw polylines*/

export async function m_mx_polyline() {
    const getPoint: MxCADUiPrPoint = new MxCADUiPrPoint();
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd)
    getPoint.setMessage("\n" + t("指定起点:"));
    let firstPoint = await getPoint.go();
    if (firstPoint === null) return;
    let vecData: any[] = [];
    let s_dWidth = 0;
    let data: any = {};
    data.dStartWidth = s_dWidth;
    data.dEndWidth = s_dWidth;
    data.pt = firstPoint;
    data.dBulge = 0;
    vecData.push(data);
    let isClose = false;
    let isDrawLine = true;
    let isAutoClose = false;
    let dStartWidth = s_dWidth;
    let dEndWidth = s_dWidth;
    let vecTmpObjectId: McObjectId[] = [];
    let mxcad = MxCpp.getCurrentMxCAD();
    MxFun.acutPrintf(`\n ${t("当前线宽为")} {0}`, s_dWidth + "");
    let isCtrl = false
    const onKeydown = (e: KeyboardEvent) => {
        if (e.key === "Control") isCtrl = true
    }
    const onkeyup = () => isCtrl = false
    window.addEventListener("keydown", onKeydown)
    window.addEventListener("keyup", onkeyup)
    while (true) {
        if (isDrawLine) {
            // ‍  绘直线.
// ‍ Draw a straight line

            let sPrompt = _ML_String("ID_ARX_PL2", t("指定下一个点") + ":");
            let sKeyWord = `[${t("圆弧")}(A)/${t("宽度")}(W)/${t("长度")}(L)/${t("半宽")}(H)]`;
            if (vecData.length >= 3) {
                if (isAutoClose) {
                    sKeyWord = `[${t("回退")}(U)/${t("圆弧")}(A)/${t("宽度")}(W)/${t("长度")}(L)/${t("半宽")}(H)]`;
                }
                else {
                    sKeyWord = `[${t("回退")}(U)/${t("圆弧")}(A)/${t("宽度")}(W)/${t("长度")}(L)/${t("半宽")}(H)/${t("闭合")}(C)]`;
                }
            }
            else if (vecData.length >= 2) {
                sKeyWord = `[${t("回退")}(U)/${t("圆弧")}(A)/${t("宽度")}(W)/${t("半宽")}(H)/${t("长度")}(L)]`;
            }

            const getNextPoint: MxCADUiPrPoint = new MxCADUiPrPoint();
            getNextPoint.setOffsetInputPostion(true)
            getNextPoint.setInputToucheType(MxType.InputToucheType.kGetEnd)
            getNextPoint.setMessage(sPrompt);
            getNextPoint.setKeyWords(sKeyWord);
            let drawData = vecData[vecData.length - 1];
            getNextPoint.setUserDraw((currendPoint, pWorldDraw) => {
                let pl = new McDbPolyline();
                pl.addVertexAt(drawData.pt, drawData.dBulge, drawData.dStartWidth, drawData.dEndWidth);
                pl.addVertexAt(currendPoint);
                pWorldDraw.drawMcDbEntity(pl);
                //pWorldDraw.drawMcDbEntity(new McDbLine(currendPoint, firstPoint as any));
            });

            let ptNext = await getNextPoint.go();
            if (ptNext !== null) {
                // ‍  成功得到一个点。
// ‍ Successfully obtained a point.

                let nextData: any = {};
                nextData.dStartWidth = dStartWidth;
                nextData.dEndWidth = dEndWidth;
                nextData.pt = ptNext;
                nextData.dBulge = 0;
                vecData.push(nextData);
                if (vecData.length >= 2) {
                    let pPolyline = new McDbPolyline;
                    pPolyline.addVertexAt(vecData[vecData.length - 2].pt,
                        0.0, vecData[vecData.length - 2].dStartWidth, vecData[vecData.length - 2].dEndWidth);
                    pPolyline.addVertexAt(vecData[vecData.length - 1].pt);
                    vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                }
            }
            else if (getNextPoint.getStatus() == MrxDbgUiPrBaseReturn.kKeyWord) {
                if (getNextPoint.isKeyWordPicked("A")) {
                    isDrawLine = false;
                }
                else if (getNextPoint.isKeyWordPicked("W")) {
                    let getWidth = new MxCADUiPrDist();
                    getWidth.setOffsetInputPostion(true)
                    getWidth.setInputToucheType(MxType.InputToucheType.kGetEnd)
                    getWidth.setMessage(_ML_String("ID_ARX_PLGETSTARTWIDTH", t("指定起点宽度")));
                    let dWVal = await getWidth.go();
                    if (dWVal === null) break;
                    dStartWidth = getWidth.value();

                    getWidth.setMessage(_ML_String("ID_ARX_PLGETVERITXWIDTH", t("指定端点宽度")));
                    dWVal = await getWidth.go();
                    if (dWVal === null) break;
                    dEndWidth = getWidth.value();
                    s_dWidth = dEndWidth;
                    vecData[vecData.length - 1].dStartWidth = dStartWidth;
                    vecData[vecData.length - 1].dEndWidth = dEndWidth;
                    dStartWidth = dEndWidth;
                }
                else if (getNextPoint.isKeyWordPicked("H")) {
                    let getWidth = new MxCADUiPrDist();
                    getWidth.setOffsetInputPostion(true)
                    getWidth.setInputToucheType(MxType.InputToucheType.kGetEnd)
                    getWidth.setMessage(_ML_String("ID_ARX_PLGETSTARTWIDTH", t("指定起点半宽")));
                    let dWVal = await getWidth.go();
                    if (dWVal === null) break;
                    dStartWidth = getWidth.value() * 2;

                    getWidth.setMessage(_ML_String("ID_ARX_PLGETVERITXWIDTH", t("指定端点半宽")));
                    dWVal = await getWidth.go();
                    if (dWVal === null) break;
                    dEndWidth = getWidth.value() * 2;
                    s_dWidth = dEndWidth;
                    vecData[vecData.length - 1].dStartWidth = dStartWidth;
                    vecData[vecData.length - 1].dEndWidth = dEndWidth;
                    dStartWidth = dEndWidth;
                }
                else if (getNextPoint.isKeyWordPicked("C")) {
                    isClose = true;
                    break;
                }
                else if (getNextPoint.isKeyWordPicked("U")) {
                    // ‍  回退操作.
// ‍ Rollback operation

                    if (vecData.length > 1) {
                        vecData.pop();
                        vecTmpObjectId[vecTmpObjectId.length - 1].erase();
                        vecTmpObjectId.pop();
                        if (vecData.length > 0) {
                            getNextPoint.setLastInputPoint(vecData[vecData.length - 1].pt);
                        }
                    }
                }
                else if (getNextPoint.isKeyWordPicked("L")) {
                    let vet = McGeVector3d.kXAxis
                    let pt!: McGePoint3d
                    getNextPoint.setMessage(t("指定直线长度"))
                    getNextPoint.setKeyWords("")
                    const _pt = await getNextPoint.go()
                    if (!_pt) return
                    const endPoint = vecData[vecData.length - 1].pt
                    const length = _pt.distanceTo(endPoint)
                    const nextPoint = vecData[vecData.length - 2]?.pt
                    if (nextPoint) {
                        vet = nextPoint.sub(endPoint)
                    }
                    pt = endPoint.clone().addvec(vet.normalize().mult(-length))

                    let nextData: any = {};
                    nextData.dStartWidth = dStartWidth;
                    nextData.dEndWidth = dEndWidth;
                    nextData.pt = pt;
                    nextData.dBulge = 0;
                    vecData.push(nextData);
                    getNextPoint.setLastInputPoint(pt)
                    if (vecData.length >= 2) {
                        let pPolyline = new McDbPolyline;
                        pPolyline.addVertexAt(vecData[vecData.length - 2].pt,
                            0.0, vecData[vecData.length - 2].dStartWidth, vecData[vecData.length - 2].dEndWidth);
                        pPolyline.addVertexAt(vecData[vecData.length - 1].pt);
                        vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                    }
                }
            }
            else {
                break;
            }
        }
        else {
            // ‍  绘圆弧.
// ‍ Draw an arc

            let sPrompt = _ML_String("NO1_ID_ARX_PL5", `${t("指定圆弧的端点")}(${t("按住")} Ctrl ${t("键")}${t("切换方向")})`);
            let sKeyWord = `[${t("角度")}(A)/${t("第二个点")}(S)/${t("圆心")}(CE)/${t("方向")}(D)/${t("直线")}(L)/${t("半径")}(R)/${t("宽度")}(W)/${t("半宽")}(H)]`;
            if (vecData.length >= 3) {
                if (isAutoClose) {
                    sKeyWord = `[${t("角度")}(A)/${t("第二个点")}(S)/${t("圆心")}(CE)/${t("方向")}(D)/${t("回退")}(U)/${t("直线")}(L)/${t("半径")}(R)/${t("宽度")}(W)/${t("半宽")}(H)]`;
                }
                else {
                    sKeyWord = `[${t("角度")}(A)/${t("第二个点")}(S)/${t("圆心")}(CE)/${t("方向")}(D)/${t("回退")}(U)/${t("直线")}(L)/${t("半径")}(R)/${t("宽度")}(W)/${t("半宽")}(H)/${t("闭合")}(C)]`;
                }

            }
            else if (vecData.length >= 2) {
                sKeyWord = `[${t("角度")}(A)/${t("第二个点")}(S)/${t("圆心")}(CE)/${t("方向")}(D)/${t("回退")}(U)/${t("直线")}(L)/${t("半径")}(R)/${t("宽度")}(W)/${t("半宽")}(H)]`;
            }

            const getNextPoint: MxCADUiPrPoint = new MxCADUiPrPoint();
            getNextPoint.setOffsetInputPostion(true)
            getNextPoint.setInputToucheType(MxType.InputToucheType.kGetEnd)
            getNextPoint.setMessage(sPrompt);
            getNextPoint.setKeyWords(sKeyWord);

            // ‍  计算圆弧的切向量.
// ‍ Calculate the tangent vector of a circular arc

            let vecArcTangent: McGeVector3d = new McGeVector3d();
            if (vecData.length < 2) {
                // ‍  开端的圆弧切向量取水平方向.
// ‍ The tangent vector of the starting arc is taken in the horizontal direction

                vecArcTangent.copy(McGeVector3d.kXAxis);
            }
            else {
                let iSzie = vecData.length;
                let pt1: McGePoint3d = vecData[iSzie - 2].pt;
                let dBluge = vecData[iSzie - 2].dBulge;
                let pt2: McGePoint3d = vecData[iSzie - 1].pt;
                if (IsZero(dBluge)) {
                    // ‍  前一段是个直线.
// ‍ The previous paragraph was a straight line

                    vecArcTangent = new McGePoint3d(pt2.x, pt2.y, 0.0).sub(new McGePoint3d(pt1.x, pt1.y, 0.0));
                }
                else {
                    let tmpPl: McDbPolyline = new McDbPolyline;
                    tmpPl.addVertexAt(pt1, dBluge);
                    tmpPl.addVertexAt(pt2);
                    let tmpVec = tmpPl.getFirstDeriv(new McGePoint3d(pt2.x, pt2.y, 0.0));
                    if (tmpVec.ret) {
                        vecArcTangent = tmpVec.val;
                    }
                    else {
                        vecArcTangent.copy(McGeVector3d.kXAxis);
                    }
                }
            }

            let userDrawFristData = vecData[vecData.length - 1];

            getNextPoint.setUserDraw((currendPoint, pWorldDraw) => {
                let dBulge = CMxDrawPolylineDragArcDraw_CalcArcBulge(userDrawFristData.pt, currendPoint, isCtrl ? vecArcTangent.clone().negate() : vecArcTangent);
                let pl = new McDbPolyline();
                pl.addVertexAt(userDrawFristData.pt,
                    dBulge, userDrawFristData.dStartWidth, userDrawFristData.dEndWidth);
                pl.addVertexAt(currendPoint);
                pWorldDraw.drawMcDbEntity(pl);
            });

            let ptNext = await getNextPoint.go();
            if (ptNext !== null) {
                let nextData: any = {};
                nextData.dStartWidth = dStartWidth;
                nextData.dEndWidth = dEndWidth;
                nextData.dBulge = 0;
                nextData.pt = ptNext;
                vecData[vecData.length - 1].dBulge = CMxDrawPolylineDragArcDraw_CalcArcBulge(userDrawFristData.pt, nextData.pt, isCtrl ? vecArcTangent.clone().negate() : vecArcTangent);
                vecData.push(nextData);

                let iSize = vecData.length;
                if (iSize >= 2) {
                    let pPolyline = new McDbPolyline();
                    pPolyline.addVertexAt(vecData[iSize - 2].pt,
                        vecData[iSize - 2].dBulge, vecData[iSize - 2].dStartWidth, vecData[iSize - 2].dEndWidth);
                    pPolyline.addVertexAt(vecData[iSize - 1].pt);
                    vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                }
            }
            else if (getNextPoint.getStatus() == MrxDbgUiPrBaseReturn.kKeyWord) {
                if (getNextPoint.isKeyWordPicked("A")) {
                    const getAngle = new MxCADUiPrAngle()
                    getAngle.setOffsetInputPostion(true)
                    getAngle.setInputToucheType(MxType.InputToucheType.kGetEnd)
                    getAngle.setBasePt(userDrawFristData.pt)
                    getAngle.setMessage(_ML_String("ID_ARX_PLGET_I_ANGLE", t("指定夹角")))
                    const angle = await getAngle.go()
                    if (angle === null) break;
                    getNextPoint.setMessage(`${t("指定圆弧的端点")}(${t("按住")} Ctrl ${t("键")}${t("切换方向")})`)
                    getNextPoint.setKeyWords(`[${t("圆心")}(CE)/${t("半径")}(R)]`)
                    getNextPoint.setLastInputPoint(userDrawFristData.pt)
                    const startPoint = vecData[vecData.length - 1].pt
                    const getBulge = (pt: McGePoint3d) => {
                        // ‍  夹角的一半就是均分的直角三角形的一个角
// ‍ Half of the angle is one of the angles of an evenly distributed right angled triangle

                        const angleA = (Math.PI / 2) - (angle / 2)
                        // ‍  得到中点
// ‍ Obtain the midpoint

                        const midPt = new McGePoint3d((pt.x + startPoint.x) / 2, (pt.y + startPoint.y) / 2)
                        // ‍  得到直角三角行对边
// ‍ Obtain the opposite side of a right angled triangle row

                        const oppositeSide = midPt.distanceTo(startPoint)
                        // ‍  得到直角三角形斜边
// ‍ Obtain the hypotenuse of a right angled triangle

                        const radius = oppositeSide / Math.sin(angleA)
                        // ‍  得到直角三角形邻边
// ‍ Obtain the adjacent sides of a right angled triangle

                        const adjacentEdge = oppositeSide / Math.tan(angleA)
                        // ‍  中点 旋转90度 再加上半径减去直角三角形邻边 得到圆弧中点
// ‍ Rotate the midpoint 90 degrees and subtract the radius from the adjacent edges of the right angled triangle to obtain the midpoint of the arc

                        const vet = midPt.sub(startPoint).rotateBy(Math.PI / 2).normalize().mult(isCtrl ? -radius - adjacentEdge : radius - adjacentEdge)
                        const midPoint = midPt.addvec(vet)
                        return MxCADUtility.calcBulge(startPoint, midPoint, pt).val
                    }
                    getNextPoint.setUserDraw((currendPoint, pWorldDraw) => {
                        const dBulge = getBulge(currendPoint)
                        let pl = new McDbPolyline();
                        pl.addVertexAt(userDrawFristData.pt,
                            dBulge, userDrawFristData.dStartWidth, userDrawFristData.dEndWidth);
                        pl.addVertexAt(currendPoint);
                        pWorldDraw.drawMcDbEntity(pl)
                    })
                    const pt = await getNextPoint.go()
                    if (getNextPoint.isKeyWordPicked("CE")) {
                        getNextPoint.setMessage(t("指定圆弧的圆心"))
                        getNextPoint.setKeyWords("")
                        getNextPoint.setBasePt(startPoint)
                        getNextPoint.setUserDraw((pt, pw) => {
                            const radius = pt.distanceTo(startPoint)
                            // ‍  圆心向 与开始点方向旋转圆心夹角得到圆心到结束点的方向
// ‍ Rotate the angle between the center of the circle and the starting point to obtain the direction from the center to the ending point

                            const endPoint = pt.addvec(pt.sub(startPoint).rotateBy(angle).normalize().mult(radius))
                            const dBulge = getBulge(endPoint)
                            let pl = new McDbPolyline();
                            pl.addVertexAt(userDrawFristData.pt,
                                dBulge, userDrawFristData.dStartWidth, userDrawFristData.dEndWidth);
                            pl.addVertexAt(endPoint);
                            pw.drawMcDbEntity(pl)
                        })
                        const center = await getNextPoint.go()
                        if (!center) break;
                        const radius = center.distanceTo(startPoint)
                        const endPoint = center.addvec(center.sub(startPoint).rotateBy(angle).normalize().mult(radius))
                        let nextData: any = {};
                        nextData.dStartWidth = dStartWidth;
                        nextData.dEndWidth = dEndWidth;
                        nextData.dBulge = 0;
                        nextData.pt = endPoint;
                        vecData[vecData.length - 1].dBulge = getBulge(endPoint)
                        vecData.push(nextData);
                        let iSize = vecData.length;
                        if (iSize >= 2) {
                            let pPolyline = new McDbPolyline();
                            pPolyline.addVertexAt(vecData[iSize - 2].pt,
                                vecData[iSize - 2].dBulge, vecData[iSize - 2].dStartWidth, vecData[iSize - 2].dEndWidth);
                            pPolyline.addVertexAt(vecData[iSize - 1].pt);
                            vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                        }
                        getNextPoint.setLastInputPoint(endPoint)
                        continue
                    }
                    if (getNextPoint.isKeyWordPicked("R")) {
                        const getDist = new MxCADUiPrDist()
                        getDist.setOffsetInputPostion(true)
                        getDist.setInputToucheType(MxType.InputToucheType.kGetEnd)
                        getDist.setMessage(t("指定圆弧半径"))
                        getDist.setKeyWords("")
                        const radius = await getDist.go()
                        if (typeof radius !== "number") break;
                        // ‍  得到直角三角形对边
// ‍ Obtain the opposite sides of a right angled triangle

                        const oppositeSide = radius * Math.sin(angle / 2)
                        getNextPoint.setBasePt(startPoint)
                        getNextPoint.setMessage(`${t("指定圆弧的弦方向")}(${t("按住")}Ctrl${t("键")}${t("切换方向")})`)
                        getNextPoint.setKeyWords("")
                        getNextPoint.setUserDraw((pt, pw) => {
                            // ‍  开始点平移到两个直角对边就是结束点
// ‍ The starting point is shifted to the opposite side of two right angles, which is the ending point

                            const endPoint = startPoint.clone().addvec(pt.sub(startPoint).normalize().mult(oppositeSide * 2))
                            const dBulge = getBulge(endPoint)
                            let pl = new McDbPolyline();
                            pl.addVertexAt(userDrawFristData.pt,
                                dBulge, userDrawFristData.dStartWidth, userDrawFristData.dEndWidth);
                            pl.addVertexAt(endPoint);
                            pw.drawMcDbEntity(pl)
                        })
                        const pt = await getNextPoint.go()
                        if (!pt) break;
                        const endPoint = startPoint.clone().addvec(pt.sub(startPoint).normalize().mult(oppositeSide * 2))
                        let nextData: any = {};
                        nextData.dStartWidth = dStartWidth;
                        nextData.dEndWidth = dEndWidth;
                        nextData.dBulge = 0;
                        nextData.pt = endPoint;
                        vecData[vecData.length - 1].dBulge = getBulge(endPoint)
                        vecData.push(nextData);
                        let iSize = vecData.length;
                        if (iSize >= 2) {
                            let pPolyline = new McDbPolyline();
                            pPolyline.addVertexAt(vecData[iSize - 2].pt,
                                vecData[iSize - 2].dBulge, vecData[iSize - 2].dStartWidth, vecData[iSize - 2].dEndWidth);
                            pPolyline.addVertexAt(vecData[iSize - 1].pt);
                            vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                        }
                        continue;
                    }
                    if (!pt) break;
                    let nextData: any = {};
                    nextData.dStartWidth = dStartWidth;
                    nextData.dEndWidth = dEndWidth;
                    nextData.dBulge = 0;
                    nextData.pt = pt;
                    vecData[vecData.length - 1].dBulge = getBulge(pt)
                    vecData.push(nextData);
                    let iSize = vecData.length;
                    if (iSize >= 2) {
                        let pPolyline = new McDbPolyline();
                        pPolyline.addVertexAt(vecData[iSize - 2].pt,
                            vecData[iSize - 2].dBulge, vecData[iSize - 2].dStartWidth, vecData[iSize - 2].dEndWidth);
                        pPolyline.addVertexAt(vecData[iSize - 1].pt);
                        vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                    }
                }
                if (getNextPoint.isKeyWordPicked("CE")) {
                    getNextPoint.setMessage(t("指定圆弧的圆心"))
                    getNextPoint.setKeyWords("")
                    getNextPoint.setUserDraw(() => { })
                    const center = await getNextPoint.go()

                    if (!center) return
                    const startPoint = userDrawFristData.pt
                    const radius = center.distanceTo(startPoint)
                    getNextPoint.setLastInputPoint(startPoint)
                    getNextPoint.setMessage(`${t("指定圆弧的端点")}(${t("按住")} Ctrl ${t("键")}${t("切换方向")})`)
                    getNextPoint.setKeyWords(`[${t("角度")}(A)/${t("长度")}(L)]`)
                    getNextPoint.clearLastInputPoint()
                    getNextPoint.setUserDraw((pt, pw) => {
                        pw.drawLine(pt.toVector3(), center.toVector3())
                        const endPoint = center.clone().addvec(pt.sub(center).normalize().mult(radius))
                        const angle = center.sub(startPoint).angleTo2(center.sub(endPoint), McGeVector3d.kZAxis)
                        const midPt = new McGePoint3d((startPoint.x + endPoint.x) / 2, (startPoint.y + endPoint.y) / 2)
                        const vet = center.sub(midPt).normalize().mult(-radius)
                        const midPoint = center.clone().addvec((isCtrl ? angle < Math.PI : angle > Math.PI) ? vet.negate() : vet)
                        const dBulge = MxCADUtility.calcBulge(startPoint, midPoint, endPoint).val
                        let pl = new McDbPolyline();
                        pl.addVertexAt(userDrawFristData.pt,
                            dBulge, userDrawFristData.dStartWidth, userDrawFristData.dEndWidth);
                        pl.addVertexAt(endPoint);
                        pw.drawMcDbEntity(pl);
                    })
                    const pt = await getNextPoint.go()

                    if (getNextPoint.isKeyWordPicked("A")) {
                        const getAngle = new MxCADUiPrAngle()
                        getAngle.setOffsetInputPostion(true)
                        getAngle.setInputToucheType(MxType.InputToucheType.kGetEnd)
                        getAngle.setBasePt(center)
                        getAngle.setMessage(_ML_String("ID_ARX_PLGET_I_ANGLE", `${t("指定夹角")}(${t("按住")} Ctrl ${t("键")}${t("切换方向")}`))
                        getAngle.setKeyWords("")
                        getAngle.setUserDraw((pt, pw) => {
                            const angle = McGeVector3d.kXAxis.clone().angleTo2(pt.sub(center), McGeVector3d.kZAxis)
                            const angleA = isCtrl ? Math.PI * 2 - angle / 2 : angle / 2
                            const mVet = startPoint.sub(center).rotateBy(angleA).normalize().mult(radius)
                            const eVet = startPoint.sub(center).rotateBy(angle).normalize().mult(radius)
                            const midPoint = center.clone().addvec(mVet)
                            const endPoint = center.clone().addvec(eVet)
                            const dBulge = MxCADUtility.calcBulge(startPoint, midPoint, endPoint).val
                            let pl = new McDbPolyline();
                            pl.addVertexAt(userDrawFristData.pt,
                                dBulge, userDrawFristData.dStartWidth, userDrawFristData.dEndWidth);
                            pl.addVertexAt(endPoint);
                            pw.drawMcDbEntity(pl);
                        })
                        const angle = await getAngle.go()
                        if (angle === null) break;
                        const angleA = isCtrl ? Math.PI * 2 - angle / 2 : angle / 2
                        const mVet = startPoint.sub(center).rotateBy(angleA).normalize().mult(radius)
                        const eVet = startPoint.sub(center).rotateBy(angle).normalize().mult(radius)
                        const midPoint = center.clone().addvec(mVet)
                        const endPoint = center.clone().addvec(eVet)
                        const dBulge = MxCADUtility.calcBulge(startPoint, midPoint, endPoint).val
                        let nextData: any = {};
                        nextData.dStartWidth = dStartWidth;
                        nextData.dEndWidth = dEndWidth;
                        nextData.dBulge = 0;
                        nextData.pt = endPoint;
                        vecData[vecData.length - 1].dBulge = dBulge
                        vecData.push(nextData);
                        let iSize = vecData.length;
                        if (iSize >= 2) {
                            let pPolyline = new McDbPolyline();
                            pPolyline.addVertexAt(vecData[iSize - 2].pt,
                                vecData[iSize - 2].dBulge, vecData[iSize - 2].dStartWidth, vecData[iSize - 2].dEndWidth);
                            pPolyline.addVertexAt(vecData[iSize - 1].pt);
                            vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                        }
                        continue;
                    }
                    if (getNextPoint.isKeyWordPicked("L")) {
                        const getDist = new MxCADUiPrDist()
                        getDist.setOffsetInputPostion(true)
                        getDist.setInputToucheType(MxType.InputToucheType.kGetEnd)
                        getDist.setMessage(`${t("指定弦长")}(${t("按住")} Ctrl ${t("键")}${t("切换方向")})`)
                        getDist.setKeyWords("")
                        getDist.setBasePt(startPoint)
                        getDist.setUserDraw((pt, pw) => {
                            const dist = pt.distanceTo(startPoint)
                            if (dist > radius * 2) return
                            const includedAngle = Math.asin((dist / 2) / radius) * 2
                            const vet = startPoint.sub(center).normalize().mult(radius)
                            const midPoint = center.clone().addvec(vet.clone().rotateBy(isCtrl ? Math.PI - includedAngle / 2 : includedAngle / 2))
                            const endPoint = center.clone().addvec(vet.clone().rotateBy(includedAngle))
                            const dBulge = MxCADUtility.calcBulge(startPoint, midPoint, endPoint).val
                            let pl = new McDbPolyline();
                            pl.addVertexAt(userDrawFristData.pt,
                                dBulge, userDrawFristData.dStartWidth, userDrawFristData.dEndWidth);
                            pl.addVertexAt(endPoint);
                            pw.drawMcDbEntity(pl);
                        })
                        const dist = await getDist.go()
                        if (typeof dist !== "number") break;
                        if (dist > radius * 2) {
                            MxFun.acutPrintf(`*${t("弦长不能大于直径")} ${t("无效")}*`)
                            getNextPoint.setLastInputPoint(startPoint)
                            continue;
                        }
                        const includedAngle = Math.asin((dist / 2) / radius) * 2
                        const vet = startPoint.sub(center).normalize().mult(radius)
                        const midPoint = center.clone().addvec(vet.clone().rotateBy(isCtrl ? Math.PI - includedAngle / 2 : includedAngle / 2))
                        const endPoint = center.clone().addvec(vet.clone().rotateBy(includedAngle))
                        const dBulge = MxCADUtility.calcBulge(startPoint, midPoint, endPoint).val
                        let nextData: any = {};
                        nextData.dStartWidth = dStartWidth;
                        nextData.dEndWidth = dEndWidth;
                        nextData.dBulge = 0;
                        nextData.pt = endPoint;
                        vecData[vecData.length - 1].dBulge = dBulge
                        vecData.push(nextData);
                        let iSize = vecData.length;
                        if (iSize >= 2) {
                            let pPolyline = new McDbPolyline();
                            pPolyline.addVertexAt(vecData[iSize - 2].pt,
                                vecData[iSize - 2].dBulge, vecData[iSize - 2].dStartWidth, vecData[iSize - 2].dEndWidth);
                            pPolyline.addVertexAt(vecData[iSize - 1].pt);
                            vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                        }
                        getNextPoint.setLastInputPoint(endPoint)
                        continue;
                    }
                    if (!pt) return
                    const endPoint = center.clone().addvec(pt.sub(center).normalize().mult(radius))
                    const angle = center.sub(startPoint).angleTo2(center.sub(endPoint), McGeVector3d.kZAxis)
                    const midPt = new McGePoint3d((startPoint.x + endPoint.x) / 2, (startPoint.y + endPoint.y) / 2)
                    const vet = center.sub(midPt).normalize().mult(-radius)
                    const midPoint = center.clone().addvec((isCtrl ? angle < Math.PI : angle > Math.PI) ? vet.negate() : vet)
                    const dBulge = MxCADUtility.calcBulge(startPoint, midPoint, endPoint).val
                    let nextData: any = {};
                    nextData.dStartWidth = dStartWidth;
                    nextData.dEndWidth = dEndWidth;
                    nextData.dBulge = 0;
                    nextData.pt = endPoint;
                    vecData[vecData.length - 1].dBulge = dBulge
                    vecData.push(nextData);
                    let iSize = vecData.length;
                    if (iSize >= 2) {
                        let pPolyline = new McDbPolyline();
                        pPolyline.addVertexAt(vecData[iSize - 2].pt,
                            vecData[iSize - 2].dBulge, vecData[iSize - 2].dStartWidth, vecData[iSize - 2].dEndWidth);
                        pPolyline.addVertexAt(vecData[iSize - 1].pt);
                        vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                    }
                    getNextPoint.setLastInputPoint(endPoint)
                    continue;
                }
                if (getNextPoint.isKeyWordPicked("R")) {
                    let getRadius = new MxCADUiPrDist();
                    getRadius.setOffsetInputPostion(true)
                    getRadius.setInputToucheType(MxType.InputToucheType.kGetEnd)
                    getRadius.setMessage(_ML_String("ID_ARX_PLGETSTARTRADIUS", t("指定圆弧的半径")));
                    getRadius.setKeyWords("")
                    let dRVal = await getRadius.go();
                    if (dRVal === null) break;
                    const startPoint = userDrawFristData.pt
                    getNextPoint.setLastInputPoint(startPoint)
                    getNextPoint.setMessage(`${t("指定圆弧的端点")}(${t("按住")} Ctrl ${t("键")}${t("切换方向")})`)
                    getNextPoint.setKeyWords(`[${t("角度")}(A)]`)
                    getNextPoint.setUserDraw((pt, pw) => {
                        if (!dRVal) return
                        const dist = pt.distanceTo(startPoint)
                        if (dist > dRVal * 2) return
                        const angle = Math.acos((dist / 2) / dRVal)
                        const center = startPoint.clone().addvec(pt.sub(startPoint).rotateBy(angle).normalize().mult(dRVal))
                        const midPoint = center.clone().addvec(new McGePoint3d((startPoint.x + pt.x) / 2, (startPoint.y + pt.y) / 2).sub(center).normalize().mult(isCtrl ? -dRVal : dRVal))
                        const dBulge = MxCADUtility.calcBulge(startPoint, midPoint, pt).val
                        let pl = new McDbPolyline();
                        pl.addVertexAt(userDrawFristData.pt,
                            dBulge, userDrawFristData.dStartWidth, userDrawFristData.dEndWidth);
                        pl.addVertexAt(pt);
                        pw.drawMcDbEntity(pl);
                    })
                    const pt = await getNextPoint.go()
                    if (getNextPoint.isKeyWordPicked("A")) {
                        const getAngle = new MxCADUiPrAngle()
                        getAngle.setOffsetInputPostion(true)
                        getAngle.setInputToucheType(MxType.InputToucheType.kGetEnd)
                        getAngle.setMessage(_ML_String("ID_ARX_PLGET_I_ANGLE", t("指定夹角")))
                        getAngle.setKeyWords("")
                        getAngle.setBasePt(startPoint)
                        const angle = await getAngle.go()
                        if (typeof angle !== "number") break;
                        // ‍  弦长
// ‍ Chord length

                        const chordLength = Math.sin(angle / 2) * dRVal * 2
                        getNextPoint.setMessage(`${t("指定圆弧的弦方向")}(${t("按住")} Ctrl ${t("键")}${t("切换方向")})`)
                        getNextPoint.setKeyWords("")
                        getNextPoint.setBasePt(startPoint)
                        getNextPoint.setUserDraw((pt, pw) => {
                            if (!dRVal) return
                            const vet = pt.sub(startPoint).normalize()
                            const entPoint = startPoint.clone().addvec(vet.clone().mult(chordLength))
                            const center = entPoint.clone().addvec(vet.clone().negate().rotateBy(-(Math.PI / 2 - angle / 2)).mult(dRVal))
                            const midPoint = center.clone().addvec(center.sub(
                                new McGePoint3d((startPoint.x + entPoint.x) / 2, (startPoint.y + entPoint.y) / 2))
                                .normalize().mult(isCtrl ? dRVal : -dRVal)
                            )
                            const dBulge = MxCADUtility.calcBulge(startPoint, midPoint, entPoint).val
                            let pl = new McDbPolyline();
                            pl.addVertexAt(userDrawFristData.pt,
                                dBulge, userDrawFristData.dStartWidth, userDrawFristData.dEndWidth);
                            pl.addVertexAt(entPoint);
                            pw.drawMcDbEntity(pl);
                        })
                        const pt = await getNextPoint.go()
                        if (!pt) break;
                        const vet = pt.sub(startPoint).normalize()
                        const entPoint = startPoint.clone().addvec(vet.clone().mult(chordLength))
                        const center = entPoint.clone().addvec(vet.clone().negate().rotateBy(-(Math.PI / 2 - angle / 2)).mult(dRVal))
                        const midPoint = center.clone().addvec(center.sub(
                            new McGePoint3d((startPoint.x + entPoint.x) / 2, (startPoint.y + entPoint.y) / 2))
                            .normalize().mult(isCtrl ? dRVal : -dRVal)
                        )
                        const dBulge = MxCADUtility.calcBulge(startPoint, midPoint, entPoint).val
                        let nextData: any = {};
                        nextData.dStartWidth = dStartWidth;
                        nextData.dEndWidth = dEndWidth;
                        nextData.dBulge = 0;
                        nextData.pt = entPoint;
                        vecData[vecData.length - 1].dBulge = dBulge
                        vecData.push(nextData);
                        let iSize = vecData.length;
                        if (iSize >= 2) {
                            let pPolyline = new McDbPolyline();
                            pPolyline.addVertexAt(vecData[iSize - 2].pt,
                                vecData[iSize - 2].dBulge, vecData[iSize - 2].dStartWidth, vecData[iSize - 2].dEndWidth);
                            pPolyline.addVertexAt(vecData[iSize - 1].pt);
                            vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                        }
                        continue;
                    }
                    if (!pt) break;
                    const dist = pt.distanceTo(startPoint)
                    if (dist > dRVal * 2) {
                        MxFun.acutPrintf(`${t("指定圆弧的端点")} *${t("无效")}*`)
                        continue;
                    }
                    const angle = Math.acos((dist / 2) / dRVal)
                    const center = startPoint.clone().addvec(pt.sub(startPoint).rotateBy(angle).normalize().mult(dRVal))
                    const midPoint = center.clone().addvec(new McGePoint3d((startPoint.x + pt.x) / 2, (startPoint.y + pt.y) / 2).sub(center).normalize().mult(isCtrl ? -dRVal : dRVal))
                    const dBulge = MxCADUtility.calcBulge(startPoint, midPoint, pt).val
                    let nextData: any = {};
                    nextData.dStartWidth = dStartWidth;
                    nextData.dEndWidth = dEndWidth;
                    nextData.dBulge = 0;
                    nextData.pt = pt;
                    vecData[vecData.length - 1].dBulge = dBulge
                    vecData.push(nextData);
                    let iSize = vecData.length;
                    if (iSize >= 2) {
                        let pPolyline = new McDbPolyline();
                        pPolyline.addVertexAt(vecData[iSize - 2].pt,
                            vecData[iSize - 2].dBulge, vecData[iSize - 2].dStartWidth, vecData[iSize - 2].dEndWidth);
                        pPolyline.addVertexAt(vecData[iSize - 1].pt);
                        vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                    }
                    continue;
                }
                if (getNextPoint.isKeyWordPicked("H")) {
                    let getWidth = new MxCADUiPrDist();
                    getWidth.setOffsetInputPostion(true)
                    getWidth.setInputToucheType(MxType.InputToucheType.kGetEnd)
                    getWidth.setMessage(_ML_String("ID_ARX_PLGETSTARTWIDTH", t("指定起点半宽")));
                    let dWVal = await getWidth.go();
                    if (dWVal === null) break;
                    dStartWidth = getWidth.value() * 2;

                    getWidth.setMessage(_ML_String("ID_ARX_PLGETVERITXWIDTH", t("指定端点半宽")));
                    dWVal = await getWidth.go();
                    if (dWVal === null) break;
                    dEndWidth = getWidth.value() * 2;
                    s_dWidth = dEndWidth;
                    vecData[vecData.length - 1].dStartWidth = dStartWidth;
                    vecData[vecData.length - 1].dEndWidth = dEndWidth;
                    dStartWidth = dEndWidth;
                    continue;
                }
                if (getNextPoint.isKeyWordPicked("D")) {

                    getNextPoint.setMessage(t("指定圆弧起点切向"))
                    getNextPoint.setKeyWords("")

                    getNextPoint.setLastInputPoint(userDrawFristData.pt)
                    getNextPoint.setUserDraw((pt, pw) => {
                        pw.drawLine(pt.toVector3(), userDrawFristData.pt.toVector3())
                    })
                    const val = await getNextPoint.go()
                    if (!val) break;
                    const vecArcTangent = val.sub(userDrawFristData.pt)
                    getNextPoint.setLastInputPoint(userDrawFristData.pt)
                    getNextPoint.setBasePt(userDrawFristData.pt)
                    getNextPoint.setMessage(`${t("指定圆弧的端点")}(${t("按住")} Ctrl ${t("键")}${t("切换方向")})`)
                    getNextPoint.setKeyWords("")
                    getNextPoint.setUserDraw((pt, pw) => {
                        let dBulge = CMxDrawPolylineDragArcDraw_CalcArcBulge(userDrawFristData.pt, pt, isCtrl ? vecArcTangent.clone().negate() : vecArcTangent);
                        let pl = new McDbPolyline();
                        pl.addVertexAt(userDrawFristData.pt,
                            dBulge, userDrawFristData.dStartWidth, userDrawFristData.dEndWidth);
                        pl.addVertexAt(pt);
                        pw.drawMcDbEntity(pl);
                    })
                    const pt = await getNextPoint.go()
                    let nextData: any = {};
                    nextData.dStartWidth = dStartWidth;
                    nextData.dEndWidth = dEndWidth;
                    nextData.dBulge = 0;
                    nextData.pt = pt;
                    vecData[vecData.length - 1].dBulge = CMxDrawPolylineDragArcDraw_CalcArcBulge(userDrawFristData.pt, nextData.pt, isCtrl ? vecArcTangent.clone().negate() : vecArcTangent);
                    vecData.push(nextData);

                    let iSize = vecData.length;
                    if (iSize >= 2) {
                        let pPolyline = new McDbPolyline();
                        pPolyline.addVertexAt(vecData[iSize - 2].pt,
                            vecData[iSize - 2].dBulge, vecData[iSize - 2].dStartWidth, vecData[iSize - 2].dEndWidth);
                        pPolyline.addVertexAt(vecData[iSize - 1].pt);
                        vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                    }
                    continue;
                }
                if (getNextPoint.isKeyWordPicked("L")) {
                    isDrawLine = true;
                }
                else if (getNextPoint.isKeyWordPicked("S")) {
                    // ‍  三点画圆弧
// ‍ Three point drawing arc

                    // ‍  取第二个点。
// ‍ Take the second point.

                    let pt1 = new McGePoint3d(vecData[vecData.length - 1].pt.x, vecData[vecData.length - 1].pt.y, 0.0);

                    let getSecondPoint = new MxCADUiPrPoint();
                    getSecondPoint.setOffsetInputPostion(true)
                    getSecondPoint.setInputToucheType(MxType.InputToucheType.kGetEnd)
                    getSecondPoint.setMessage(_ML_String("NO1_ID_SPECIFY_ARC2", t("指定圆弧的第二个点")));
                    getSecondPoint.setBasePt(pt1);
                    let pt2: any = await getSecondPoint.go();
                    if (pt2 === null) {
                        break;
                    }

                    let getThirdPoint = new MxCADUiPrPoint();
                    getThirdPoint.setOffsetInputPostion(true)
                    getThirdPoint.setInputToucheType(MxType.InputToucheType.kGetEnd)
                    getThirdPoint.setMessage(_ML_String("ID_CIRCULAR_ENDPOINT", `${t("指定圆弧的端点")}(${t("按住")} Ctrl ${t("键")}${t("切换方向")})`));

                    getThirdPoint.setUserDraw((currendPoint, pWorldDraw) => {
                        let arc = new McDbArc();
                        arc.computeArc(pt1.x, pt1.y, pt2.x, pt2.y, currendPoint.x, currendPoint.y);
                        pWorldDraw.drawMcDbEntity(arc);
                    });


                    let nextPoint = await getThirdPoint.go();
                    if (nextPoint !== null) {
                        let retBulge = MxCADUtility.calcBulge(pt1, pt2, nextPoint);
                        if (retBulge.ret) {
                            let nextData: any = {};
                            nextData.dStartWidth = dStartWidth;
                            nextData.dEndWidth = dEndWidth;
                            nextData.pt = nextPoint;
                            nextData.dBluge = 0;
                            vecData[vecData.length - 1].dBulge = retBulge.val;
                            vecData.push(nextData);
                            let iSize = vecData.length;
                            if (iSize >= 2) {
                                let pPolyline = new McDbPolyline;
                                pPolyline.addVertexAt(vecData[iSize - 2].pt,
                                    vecData[iSize - 2].dBulge, vecData[iSize - 2].dStartWidth, vecData[iSize - 2].dEndWidth);
                                pPolyline.addVertexAt(vecData[iSize - 1].pt);
                                vecTmpObjectId.push(mxcad.drawEntity(pPolyline));
                            }
                        }
                        else {
                            MxFun.acutPrintf(_ML_String("ID_ENDPOINT_INVALID1", `\n ${t("端点")} *${t("无效")}*`));
                        }
                    }
                    else {
                        break;
                    }
                }

                else if (getNextPoint.isKeyWordPicked("W")) {
                    let getWidth = new MxCADUiPrDist();
                    getWidth.setOffsetInputPostion(true)
                    getWidth.setInputToucheType(MxType.InputToucheType.kGetEnd)
                    getWidth.setMessage(_ML_String("ID_ARX_PLGETSTARTWIDTH", t("指定起点宽度")));
                    let dWVal = await getWidth.go();
                    if (dWVal === null) break;
                    dStartWidth = getWidth.value();

                    getWidth.setMessage(_ML_String("ID_ARX_PLGETVERITXWIDTH", t("指定端点宽度")));
                    dWVal = await getWidth.go();
                    if (dWVal === null) break;
                    dEndWidth = getWidth.value();

                    s_dWidth = dEndWidth;

                    vecData[vecData.length - 1].dStartWidth = dStartWidth;
                    vecData[vecData.length - 1].dEndWidth = dEndWidth;
                    dStartWidth = dEndWidth;

                }
                else if (getNextPoint.isKeyWordPicked("C")) {
                    vecData[vecData.length - 1].dBulge = CMxDrawPolylineDragArcDraw_CalcArcBulge(userDrawFristData.pt, firstPoint, isCtrl ? vecArcTangent.clone().negate() : vecArcTangent);

                    isClose = true;
                    break;
                }
                else if (getNextPoint.isKeyWordPicked("U")) {
                    // ‍  回退操作.
// ‍ Rollback operation

                    if (vecData.length > 1) {
                        vecData.pop();

                        vecTmpObjectId[vecTmpObjectId.length - 1].erase();
                        vecTmpObjectId.pop();

                        if (vecData.length > 0) {
                            getNextPoint.setLastInputPoint(vecData[vecData.length - 1].pt);
                        }
                    }
                }
            }
            else {
                break;
            }
        }
    }

    if (isAutoClose)
        isClose = true;

    // ‍  删除临时对象.
// ‍ Delete temporary objects

    for (let i = 0; i < vecTmpObjectId.length; i++) {
        vecTmpObjectId[i].erase();
    }

    // ‍  创建新的Polyline.
// ‍ Create a new Polyline

    if (vecData.length > 1) {
        let pNew = new McDbPolyline();
        for (let i = 0; i < vecData.length; i++) {
            pNew.addVertexAt(vecData[i].pt,
                vecData[i].dBulge, vecData[i].dStartWidth,
                vecData[i].dEndWidth);
        }
        pNew.isClosed = isClose;
        mxcad.drawEntity(pNew)
    }
    window.removeEventListener("keydown", onKeydown)
    window.removeEventListener("keyup", onkeyup)

}

addCommand("m_mx_polyline", m_mx_polyline)