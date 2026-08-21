
import { McCmColor, McDb, McDb2LineAngularDimension, McDbArc, McDbCircle, McDbEntity, McDbLine, McDbPolyline, McGePoint3d, McGeVector3d, McObjectId, MxCADResbuf, MxCADUiPrAngle, MxCADUiPrDist, MxCADUiPrEntity, MxCADUiPrPoint, MxCADUiPrString, MxCADUtility, MxCpp, _ML_String } from "mxcad";
import { MrxDbgUiPrBaseReturn, DetailedResult, McEdGetPointWorldDrawObject, MxFun, MxType } from "mxdraw"
import { calculateDistanceFromPointToLine } from "../m_mx_fillet";
import { addCommand } from "@/plugins/mxcad/command";
import { showConfirmDialog, Field, showToast } from "vant";
import { ref } from "vue";
import { t } from "@/languages";

async function m_mx_dimangular() {
    const mxcad = MxCpp.getCurrentMxCAD()
    // mxcad.addDimStyle("MyDimStyle2", "41,0.18,141,0.09,40,200", "77,1,271,3", "", "");
    // mxcad.drawDimStyle = "MyDimStyle2"
    const getEnt = new MxCADUiPrEntity()
    getEnt.setOffsetInputPostion(true)
    getEnt.setInputToucheType(MxType.InputToucheType.kGetEnd);
    let dAngleVertexX!: number,
        dAngleVertexY!: number,
        dFirstEndPointX!: number,
        dFirstEndPointY!: number,
        dSecondEndPointX!: number,
        dSecondEndPointY!: number;
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
        getEnt.setMessage(t("选择圆弧、圆、直线"))
        getEnt.setKeyWords("[" + t("指定顶点") + "(A)]")
        getEnt.setUserDraw(movePtFun)
        getEnt.setFilter(filter)
        const objId = await getEnt.go()
        const ent = objId.getMcDbEntity()
        if (oldEnt) oldEnt.highlight(false)

        if (getEnt.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
        if (getEnt.isKeyWordPicked("A")) {
            // ‍  指定顶点
// ‍ Specify vertex

            const getPoint = new MxCADUiPrPoint()
            getPoint.setOffsetInputPostion(true)
            getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
            getPoint.clearLastInputPoint()
            getPoint.setMessage(t("指定角顶点"))
            const pt = await getPoint.go()
            if (!pt) return
            getPoint.setBasePt(pt)
            getPoint.setMessage(t("指定角的第一个端点"))
            const pt1 = await getPoint.go()
            if (!pt1) return
            getPoint.setMessage(t("指定角的第二个端点"))
            const pt2 = await getPoint.go()
            if (!pt2) return
            dAngleVertexX = pt.x
            dAngleVertexY = pt.y
            dFirstEndPointX = pt1.x
            dFirstEndPointY = pt1.y
            dSecondEndPointX = pt2.x
            dSecondEndPointY = pt2.y
            break;
        }

        else if (ent instanceof McDbArc) {
            const start = ent.getStartPoint().val
            const radius = ent.radius
            const vet = McGeVector3d.kXAxis.clone().rotateBy(ent.endAngle).mult(radius)
            const center = ent.center
            const end = center.clone().addvec(vet)
            if (!start || !end) return
            dFirstEndPointX = start.x
            dFirstEndPointY = start.y
            dSecondEndPointX = end.x
            dSecondEndPointY = end.y
            dAngleVertexX = center.x
            dAngleVertexY = center.y
            break;
        }
        else if (ent instanceof McDbCircle) {
            const center = ent.center
            dAngleVertexX = center.x
            dAngleVertexY = center.y
            dFirstEndPointX = movePt.x
            dFirstEndPointY = movePt.y

            const getPoint = new MxCADUiPrPoint()
            getPoint.setMessage(t("指定角的第二个端点"))
            const pt = await getPoint.go()
            if (!pt) return
            const end = ent.getClosestPointTo(pt, false).val
            dSecondEndPointX = end.x
            dSecondEndPointY = end.y
            break;
        }
        else if (ent instanceof McDbLine || ent instanceof McDbPolyline) {
            const getEnt = new MxCADUiPrEntity()
            getEnt.setOffsetInputPostion(true)
            getEnt.setInputToucheType(MxType.InputToucheType.kGetEnd);
            const filter = new MxCADResbuf()
            filter.AddMcDbEntityTypes("LINE,LWPOLYLINE")
            getEnt.setFilter(filter)
            let movePt1!: McGePoint3d
            oldEnt = null
            getEnt.setUserDraw((pt, pw) => {
                movePtFun(pt, pw)
                movePt1 = pt
            })
            const start = ent.getClosestPointTo(movePt, false).val
            let line1!: McDbLine
            dFirstEndPointX = start.x
            dFirstEndPointY = start.y
            if (ent instanceof McDbLine) {
                line1 = ent
                line1.highlight(true)
            } else {
                for (let index = 0; index < ent.numVerts(); index++) {
                    const pt = ent.getPointAt(index).val
                    if (ent.getBulgeAt(index) !== 0) continue;
                    const nextPt = ent.getPointAt(index + 1).val
                    const start = ent.getClosestPointTo(movePt, false).val
                    if (nextPt && calculateDistanceFromPointToLine(start, pt, nextPt) === 0) {
                        line1 = new McDbLine(pt, nextPt)
                    }
                }
                ent.highlight(false)
            }
            if (!line1) return
            while (true) {
                getEnt.setMessage(t("选择第二条直线"))
                const objId = await getEnt.go()
                if (getEnt.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return line1.highlight(false)
                if (!objId) continue;
                if (!objId.isValid()) continue;
                let ent2 = objId.getMcDbEntity()
                let line2!: McDbLine
                if (ent2 instanceof McDbPolyline) {
                    const num = ent2.numVerts()
                    for (let index = 0; index < num; index++) {
                        const pt = ent2.getPointAt(index).val
                        const nextPt = ent2.getPointAt(index + 1).val
                        const start = ent2.getClosestPointTo(movePt1, false).val
                        if (nextPt && calculateDistanceFromPointToLine(start, pt, nextPt) === 0) {
                            line2 = new McDbLine(pt, nextPt)
                        }
                    }
                    ent2.highlight(false)
                } else if (ent2 instanceof McDbLine) {
                    line2 = ent2
                }
                else {
                    MxFun.acutPrintf("\n" + t("所选对象不是直线"))
                    continue;
                }
                if (!line2) return line1.highlight(false)
                line1.highlight(false)
                line2.highlight(false)
                const intersects = (line1.clone() as McDbLine)?.IntersectWith((line2.clone() as McDbLine), McDb.Intersect.kExtendBoth)
                console.log(12)
                if (intersects.isEmpty()) {
                    continue;
                }
                const pt = intersects.at(0)
                const end = line2.getClosestPointTo(movePt1, false).val
                dSecondEndPointX = end.x
                dSecondEndPointY = end.y
                dAngleVertexX = pt.x
                dAngleVertexY = pt.y
                break;
            }
            break;
        }

    }

    const getPoint = new MxCADUiPrPoint()
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getPoint.clearLastInputPoint()

    let id!: McObjectId
    let text: string | undefined
    let textAngle: number | undefined

    if ([dAngleVertexX, dAngleVertexY, dFirstEndPointX, dFirstEndPointY, dSecondEndPointX, dSecondEndPointY].some((val) => typeof val !== "number")) return

    let idDimStyle = MxCpp.getCurrentDatabase().getCurrentlyDimStyleId();
    while (true) {
        getPoint.setMessage(t("指定标注弧线位置"))
        getPoint.setKeyWords(`[${t("文字")}(T)/${t("角度")}(A)/${t("象限点")}(Q)]`)
        getPoint.setUserDraw((currentPoint, pw) => {
            let dimension = new McDb2LineAngularDimension();
            dimension.dimensionStyle = idDimStyle;
            dimension.compute(dAngleVertexX, dAngleVertexY, dFirstEndPointX, dFirstEndPointY, dSecondEndPointX, dSecondEndPointY, currentPoint.x, currentPoint.y);
            if (text) {
                dimension.dimensionText = text
            }
            if (textAngle) {
                dimension.textRotation = textAngle
            }
            pw.drawMcDbEntity(dimension,true);
        })
        const point = await getPoint.go()

        if (getPoint.isKeyWordPicked("T")) {
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

        if (getPoint.isKeyWordPicked("A")) {
            const getAngle = new MxCADUiPrAngle()
            getAngle.setOffsetInputPostion(true)
            getAngle.setInputToucheType(MxType.InputToucheType.kGetEnd);
            getAngle.clearLastInputPoint()
            getAngle.setMessage(t("指定标注文字的角度"))
            const val = await getAngle.go()
            if (!val) return
            if (getAngle.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
            if (getAngle.getDetailedResult() === DetailedResult.kCoordIn) {
                textAngle = val * (Math.PI / 180)
            } else {
                textAngle = val
            }
            continue;
        }

        if (getPoint.isKeyWordPicked("Q")) {

        }

        if (!point) return

        mxcad.drawUseDefaultProperties = true;
        id = mxcad.drawDimAngular(dAngleVertexX, dAngleVertexY, dFirstEndPointX, dFirstEndPointY, dSecondEndPointX, dSecondEndPointY, point.x, point.y)

        const dimension = id.getMcDbDimension()
        if (!dimension) return
        if (text) {
            dimension.dimensionText = text
        }
        if (textAngle) {
            dimension.textRotation = textAngle
        }

        return
    }
}

addCommand("m_mx_dimangular", m_mx_dimangular)
