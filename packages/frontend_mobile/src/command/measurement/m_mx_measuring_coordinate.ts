import { MrxDbgUiPrPoint, MxDbCoord, MxFun, MxType } from "mxdraw"
import { MxCpp } from "mxcad"
import { addCommand } from "@/plugins/mxcad/command";
import { t } from "@/languages";
function m_mx_measuring_coordinate() {
    // ‍  让用户在图上点取第一点.
// ‍ Ask the user to click on the first point on the graph

    const getPoint = new MrxDbgUiPrPoint();
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getPoint.setOffsetInputPostion(true)
    getPoint.setMessage("\n" + t("指定坐标点") + ":");
    getPoint.go((status) => {
      if (status != 0) {
        return;
      }
  
      const pt1 = getPoint.value();
  
      let mxCoord = new MxDbCoord();
      mxCoord.point1 = pt1;
      mxCoord.point2 = pt1.clone();
      mxCoord.color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();
      
      getPoint.setBasePt(pt1);
      getPoint.setUseBasePt(true);
  
      getPoint.setUserDraw((curPoint, pWorldDraw) => {
        mxCoord.point2 = curPoint;
        pWorldDraw.drawCustomEntity(mxCoord);
      });
  
      getPoint.setMessage("\n" + t("指定标注点") + ":");
  
      getPoint.go((status) => {
        if (status != 0) {
          return;
        }
        mxCoord.point2 = getPoint.value();
        MxFun.addToCurrentSpace(mxCoord);
      });
    });

}

addCommand("m_mx_measuring_coordinate", m_mx_measuring_coordinate)