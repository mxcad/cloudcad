import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { McDbCurve, McDbEntity, McDbObject, McGePoint3d, McObjectId, MxCADResbuf, MxCADUiPrDist, MxCADUiPrKeyWord, MxCADUiPrPoint, MxCADUtility, MxCpp } from "mxcad";
import { MrxDbgUiPrPoint, MrxDbgUiPrBaseReturn, DynamicInputType, MxType } from "mxdraw"
// ‍  偏移距离
// ‍ Offset distance

let dist: number | null
// ‍  是否删除原对象
// ‍ Do you want to delete the original object

let isDel = false
// ‍  设置为源图层
// ‍ Set as source layer

let isSourceLayer = true
async function m_mx_offset() {
  let filter = new MxCADResbuf();
  filter.AddMcDbEntityTypes("LINE,CIRCLE,LWPOLYLINE,ARC");
  const getPoint = new MxCADUiPrPoint();
  getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
  getPoint.setOffsetInputPostion(true)
  // ‍  是否可以偏移多个
// ‍ Can multiple offsets be made

  let isMultiple = false
  /** 执行偏
/**Execution bias

   * 移对象
*Move object

   *  @param isPassingPointDraw 通过点偏移
*@ paramisPassingDointDraw uses point offset

   *  */
  const callOffsetObj = async (isPassingPointDraw = false) => {
    getEntWhile: while (true) {
      let mxGetPoint!: MrxDbgUiPrPoint
      let basePoint!: McGePoint3d
      let retIds!: McObjectId[]
      const currentSelectIds = MxCADUtility.getCurrentSelect()
      if (currentSelectIds.length > 0 && isPassingPointDraw) {
        retIds = currentSelectIds
      } else {
        retIds = await MxCADUtility.selectEnt("\n" + t("选择偏移对象"), filter, false, (getPoint) => {
          getPoint.setKeyWords(`[${t("退出")}(E)/${t("放弃")}(U)]`)
          mxGetPoint = getPoint
        }, (pt) => {
          basePoint = pt
        });
      }
      if (mxGetPoint) {
        if (mxGetPoint.isKeyWordPicked("E")) {
          return
        }
        if (mxGetPoint.isKeyWordPicked("U")) {
          continue;
        }
        if (mxGetPoint.getStatus() === MrxDbgUiPrBaseReturn.kCancel) {
          return
        }
      }
      if (retIds.length == 0) {
        continue;
      };
      // ‍  偏移对象...
// ‍ Offset Object

      while (true) {
        getPoint.setDynamicInputType(DynamicInputType.kXYCoordInput);
        getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
        getPoint.setOffsetInputPostion(false)
        if (isPassingPointDraw) {
          getPoint.setMessage("\n" + t("指定通过点") + (isMultiple ? " <" + t("下一个对象") + ">" : ""));
        } else {
          getPoint.setMessage("\n"+ t("指定要偏移那一侧上的点"));
        }
        getPoint.setKeyWords(isMultiple ? `[${t("退出")}(E)/${t("放弃")}(U)]` : `[${t("退出")}(E)/${t("多个")}(M)/${t("放弃")}(U)]`)
        getPoint.disableAllTrace();
        getPoint.setUserDraw((pt, pw) => {
          const objs = retIds.map(id => id.clone())
          let curve = objs[0] as McDbCurve
          if (!curve) return;
          let _dist = dist

          if (isPassingPointDraw) {
            const closestPointParam = curve.getClosestPointTo(pt, true)
            if (!closestPointParam.ret) return
            basePoint = closestPointParam.val
            _dist = pt.distanceTo(basePoint)
          }
          if (!_dist) return
          let aryObj = curve.offsetCurves(_dist, pt);
          if (aryObj.empty()) return;

          aryObj.forEach((obj) => {
            if (obj instanceof McDbEntity) {
              pw.drawMcDbEntity(obj);
            }
          });
        })
        let pt = await getPoint.go();
        if (getPoint.isKeyWordPicked("E")) {
          return;
        }
        if (getPoint.isKeyWordPicked("M")) {
          isMultiple = true
          continue;
        }
        if (getPoint.isKeyWordPicked("U")) {
          continue getEntWhile;
        }
        if (!pt) {
          return;
        }
        let curve = retIds[0].getMcDbCurve()
        if (!curve) {
          return;
        }
        if (isPassingPointDraw) {
          const closestPointParam = curve.getClosestPointTo(pt, true)
          if (!closestPointParam.ret) return
          dist = pt.distanceTo(closestPointParam.val)
        }
        if (!dist) return
        let aryObj = curve.offsetCurves(dist, pt);
        if (aryObj.empty()) return;
        aryObj.forEach((obj: McDbObject) => {
          if (obj instanceof McDbEntity) {
            if (isSourceLayer && curve?.layer) {
              obj.layer = curve.layer
            }
            if (!isSourceLayer) {
              obj.layer = MxCpp.getCurrentMxCAD().getDatabase().getCurrentlyLayerName()
            }
            MxCpp.getCurrentMxCAD().drawEntity(obj);
          }
        });
        if (!isMultiple) {
          if (isDel) {
            retIds[0].erase(true)
          }
          break;
        }
      }
    }
  }
  while (true) {
    const getDist = new MxCADUiPrDist();
    getDist.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getDist.setOffsetInputPostion(true)
    getDist.setMessage(`\n${t("指定偏移距离")}<${(dist || 0).toFixed(3)}>`);
    getDist.setKeyWords(`[${t("通过点")}(T)/删除(E)/图层(L))]`)
    const _dist = await getDist.go();

    if (getDist.isKeyWordPicked("T") || getDist.getStatus() === MrxDbgUiPrBaseReturn.kNone) {
      await callOffsetObj(true)
      return
    }
    if (getDist.isKeyWordPicked("E")) {
      const getKey = new MxCADUiPrKeyWord()
      getKey.setMessage(`${t("要在偏移后删除源对象吗")}?<${isDel ? t("是") : t("否")}>`)
      getKey.setKeyWords("[是(Y)/否(N)]")

      const key = await getKey.go()
      if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kCancel) {
        return
      }
      if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kNone) {
        continue;
      }
      if (key?.toLocaleLowerCase() === "y") {
        isDel = true
        continue;
      }
      if (key?.toLocaleLowerCase() === "n") {
        isDel = false
        continue;
      }
    }
    if (getDist.isKeyWordPicked("L")) {
      const getKey = new MxCADUiPrKeyWord()
      getKey.setMessage(`${t("输入偏移对象的图层选项")}<${isSourceLayer ? t("源") : t("当前")}>`)
      getKey.setKeyWords("[当前(C)/源(S)]")
      const key = await getKey.go()
      if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kCancel) {
        return
      }
      if (getKey.getStatus() === MrxDbgUiPrBaseReturn.kNone) {
        isSourceLayer = true
        continue;
      }
      if (key?.toLocaleLowerCase() === "c") {
        isSourceLayer = false
        continue;
      }
      if (key?.toLocaleUpperCase() === "s") {
        isSourceLayer = true
        continue;
      }
    }

    if (_dist) {
      dist = _dist
    }
    if (!dist) return
    await callOffsetObj()
    break;
  }
}

addCommand("m_mx_offset", m_mx_offset)