import { MxCADResbuf, MxCADSelectionSet, MxCADUtility, McGeLongArray, MxCpp, McObjectId, McDbObject, McDbPolyline, McDbCurve, McDb, MxCADUiPrKeyWord, McDbEntity, McGePoint3d } from "mxcad";
import { MrxDbgUiPrBaseReturn, MrxDbgUiPrPoint } from "mxdraw"
import { getHurdleSelectionPoints } from "./m_mx_trim";
import { addCommand } from "@/plugins/mxcad/command";
import { t } from "@/languages";
async function m_mx_extend() {
    let filter = new MxCADResbuf();
    let isByWindow = false
    let getPoint!: MrxDbgUiPrPoint
    let ss!: MxCADSelectionSet
    let isExtend = false
    filter.AddMcDbEntityTypes("LINE,LWPOLYLINE,ARC");
    let aryId = MxCADUtility.getCurrentSelect(filter);
    if (aryId.length === 0) {
      aryId = await MxCADUtility.userSelect(t("选择对象") + t("或") + "<" + t("全部选择") + ">", filter, (_ss, _getPoint) => {
        getPoint = _getPoint
        ss = _ss
      });
      if (getPoint.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
      if (getPoint.getStatus() === MrxDbgUiPrBaseReturn.kNone) {
        if (aryId.length === 0) {
          ss.allSelect(filter)
          ss.forEach((val) => {
            aryId.push(val);
          })
        }
      }
      if (aryId.length === 0) {
        return;
      }
    }
    let aryIdLong = new McGeLongArray;
    aryIdLong.copyFormAryId(aryId);

    let mxcadExtendAssert = new MxCpp.mxcadassemblyimp.MxDrawExtendAssist()
    if (!mxcadExtendAssert.Init(aryIdLong.imp)) return;
    // ‍  缓存
// ‍ Cache

    let cachings: [McObjectId[], (McDbObject | null)[]][] = []

    while (true) {
      let ss = new MxCADSelectionSet();
      ss.isWhileSelect = false;
      ss.isSelectHighlight = false;
      let getPoint!: MrxDbgUiPrPoint
      if (!await ss.userSelect(t("选择要延伸的对象"), filter, (_getPoint) => {
        getPoint = _getPoint
        getPoint.setKeyWords(`[${t("栏选")}(F)/${t("窗交")}(C)/${t("边")}(E)${cachings.length > 0 ? "/" + t("放弃") + "(U)" : ""}]`)
      })) {
        break;
      }
      if (getPoint.isKeyWordPicked("F")) {
        const points = await getHurdleSelectionPoints()
        if (!points) break;
        const pl = new McDbPolyline()
        points.forEach((point) => {
          pl.addVertexAt(point)
        })
        cachings.push([aryId, aryId.map((id) => id.clone())])
        aryId.forEach((objId) => {
          const ent = objId.getMcDbEntity()
          if (!(ent instanceof McDbCurve)) return;
          const intersectPoints = ent.IntersectWith(pl, McDb.Intersect.kOnBothOperands)
          if (intersectPoints.isEmpty()) return
          intersectPoints.forEach((point) => {
            aryIdLong.copyFormAryId([objId]);
            mxcadExtendAssert.DoExtend(aryIdLong.imp, point.x, point.y, point.x, point.y);
          })
        })
        continue;
      }
      if (getPoint.isKeyWordPicked("C")) {
        isByWindow = true
        continue;
      }
      if (getPoint.isKeyWordPicked("E")) {
        const getKey = new MxCADUiPrKeyWord()
        getKey.setMessage(`${t("指定隐含边延伸模式")}<${isExtend ? t("延伸") : t("不延伸")}>`)
        getKey.setKeyWords(`[${t("延伸")}(E)/${t("不延伸")}(N)]`)
        await getKey.go()
        const key = getKey.keyWordPicked()
        if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kCancel) return
        if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kNone) continue;
        if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kKeyWord) {
          if (key === "E") {
            isExtend = true
            continue;
          }
          if (key === "N") {
            isExtend = false
            continue;
          }
        }
      }
      if (getPoint.isKeyWordPicked("U")) {
        const [ids, ents] = cachings.pop() || []

        ids?.forEach((id) => {
          id.erase()
        })
        const mxcad = MxCpp.getCurrentMxCAD()
        ents?.forEach((ent) => {
          if (ent instanceof McDbEntity) mxcad.drawEntity(ent)
        })
        continue;
      }

      let ids = ss.getIds();
      if (ids.length == 0) {
        continue;
      }

      let selPoint = ss.getSelectPoint();
      if (isByWindow) {
        const { pt1, pt2 } = selPoint
        const pl = new McDbPolyline()
        pl.addVertexAt(pt1)
        pl.addVertexAt(new McGePoint3d(pt1.x, pt2.y))
        pl.addVertexAt(pt2)
        pl.addVertexAt(new McGePoint3d(pt2.x, pt1.y))
        pl.isClosed = true
        cachings.push([aryId, aryId.map((id) => id.clone())])
        aryId.forEach((objId) => {
          const ent = objId.getMcDbEntity()
          if (!(ent instanceof McDbCurve)) return
          const intersectPoints = ent.IntersectWith(pl, McDb.Intersect.kOnBothOperands)
          if (intersectPoints.isEmpty()) return
          intersectPoints.forEach((point) => {
            aryIdLong.copyFormAryId([objId]);
            mxcadExtendAssert.DoExtend(aryIdLong.imp, point.x, point.y, point.x, point.y);
          })
        })
        continue;
      }
      cachings.push([ids, aryId.map((id) => id.clone())])
      aryIdLong.copyFormAryId(ids);
      mxcadExtendAssert.DoExtend(aryIdLong.imp, selPoint.pt1.x, selPoint.pt1.y, selPoint.pt2.x, selPoint.pt2.y);
    }

    mxcadExtendAssert.UnInit();
  }
addCommand("m_mx_extend", m_mx_extend)