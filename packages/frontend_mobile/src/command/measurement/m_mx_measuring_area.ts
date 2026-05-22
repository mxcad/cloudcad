import { t } from "@/languages"
import { addCommand } from "@/plugins/mxcad/command"
import { MxCpp } from "mxcad"
import { MrxDbgUiPrPoint, MxDbArea, McEdGetPointWorldDrawObject, MxFun, MxType } from "mxdraw"

 function m_mx_measuring_area() {
    const getPoint = new MrxDbgUiPrPoint()
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    getPoint.setMessage("\n" + t("指定第一点") + ":")
    getPoint.go(status => {
      if (status != 0) {
        return
      }
      const pt1 = getPoint.value()
      let area = new MxDbArea()
      area.addPoint(pt1)
      area.color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();
      const worldDrawComment = new McEdGetPointWorldDrawObject()
      worldDrawComment.setDraw((currentPoint: THREE.Vector3, pWorldDraw) => {
        let tmp: MxDbArea = area.clone() as MxDbArea
        tmp.addPoint(currentPoint)
        worldDrawComment.drawCustomEntity(tmp)
      })
      getPoint.setUserDraw(worldDrawComment)
      getPoint.setMessage("\n" + t("指定下一点") + ":")
      getPoint.goWhile(
        status => {
          if (status == 0) {
            const pt2 = getPoint.value()
            area.addPoint(pt2)
          }
        },
        status => {
          area.isFill = true
          area.fillOpacity = 0.2
          area.fillColor = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor()
          MxFun.getCurrentDraw().addMxEntity(area)
        }
      )
    })
}

function m_mx_measuring_area_line() {
  const getPoint = new MrxDbgUiPrPoint()
  getPoint.setOffsetInputPostion(true)
  getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
  getPoint.setMessage("\n" + t("指定第一点") + ":")
  getPoint.go(status => {
    if (status != 0) {
      return
    }
    const pt1 = getPoint.value()
    let area = new MxDbArea()
    area.addPoint(pt1)
    area.color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();
    const worldDrawComment = new McEdGetPointWorldDrawObject()
    worldDrawComment.setDraw((currentPoint: THREE.Vector3, pWorldDraw) => {
      let tmp: MxDbArea = area.clone() as MxDbArea
      tmp.addPoint(currentPoint)
      worldDrawComment.drawCustomEntity(tmp)
    })
    getPoint.setUserDraw(worldDrawComment)
    getPoint.setMessage("\n" + t("指定下一点") + ":")
    getPoint.goWhile(
      status => {
        if (status == 0) {
          const pt2 = getPoint.value()
          area.addPoint(pt2)
        }
      },
      status => {
        MxFun.getCurrentDraw().addMxEntity(area)
      }
    )
  })
}

addCommand("m_mx_measuring_area", m_mx_measuring_area)
addCommand("m_mx_measuring_area_line", m_mx_measuring_area_line)
