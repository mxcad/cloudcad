import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { MxCpp } from "mxcad";
import {  MrxDbgUiPrPoint, MxType, MxFun, MxDb2LineAngularDimension, McEdGetPointWorldDrawObject } from "mxdraw"
// ‍  测量角度
// ‍ Measure angle

function m_mx_measuring_angle() {
    // ‍  动态点对象 存储顶点数组
// ‍ Dynamic point object stores vertex array

    const point = new MrxDbgUiPrPoint()
    point.setOffsetInputPostion(true)
    point.setInputToucheType(MxType.InputToucheType.kGetEnd);
    // ‍  绘制控件
// ‍ Draw Control

    const mxDraw = MxFun.getCurrentDraw()
  
    const angleDim = new MxDb2LineAngularDimension()
  
    angleDim.color = MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor();
    // ‍  开启连续点击
// ‍ Enable continuous clicking

    const worldDraw = new McEdGetPointWorldDrawObject()
    worldDraw.setColor(MxCpp.getCurrentMxCAD().getCurrentDatabaseDrawColor());
    point.setMessage("\n" + t("指定第一点") + ":");
    point.go((status) => {
      if (status !== 0) {
        return
      }
      point.setMessage("\n" + t("指定第二个角度点") + ":");
      angleDim.point1 = point.value()
      worldDraw.setDraw((currentPoint, pWorldDraw) => {
        angleDim.point2 = currentPoint
        pWorldDraw.drawLine(angleDim.point1, currentPoint)
      })
      point.setUserDraw(worldDraw)
      point.go((status) => {
        point.setMessage("\n" + t("指定最后一个点") + ":");
        if (status !== 0) {
          return
        }
        angleDim.point2 = point.value()
        worldDraw.setDraw((currentPoint, pWorldDraw) => {
          angleDim.point3 = currentPoint
          worldDraw.drawCustomEntity(angleDim);
        })
        point.go((status) => {
          if (status !== 0) {
            return
          }
          mxDraw.addMxEntity(angleDim)
        })
      })
    })
  }

addCommand("m_mx_measuring_angle", m_mx_measuring_angle)