///////////////////////////////////////////////////////////////////////////////
// ‍ 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// ‍ Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.

// ‍ 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// ‍ The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement

// ‍ 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// ‍ This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials

//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////


import { addCommand } from "@/plugins/mxcad/command";
import { interval } from "@/utils/interval";
import { McDbPolyline, MxCADUiPrPoint, MxCpp } from "mxcad";
import { DynamicInputType, MxFun, MxType } from "mxdraw"

async function m_mx_et_pencil() {
  const min = MxFun.viewCoordLong2Cad(20)
  const getPoint = new MxCADUiPrPoint()
  getPoint.setOffsetInputPostion(true)
  getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd)
  getPoint.setDisableDynInput(true)
  getPoint.setDynamicInputType(DynamicInputType.kNoInput)
  let start = await getPoint.go()
  if(!start) return
  const pl = new McDbPolyline()

  let dist = 0
  let end = start
  const cancel = interval(20, () => {
    if (dist < min) return
    pl.addVertexAt(end)
    start = end
    dist = 0
  })
  getPoint.setUserDraw((pt, pw)=> {
    if(!start) return
    end = pt
    dist = start.distanceTo(pt)
    pw.drawMcDbEntity(pl.clone())
    pw.drawLine(start.toVector3(), pt.toVector3())
  })
  const pt = await getPoint.go()
  if (!pt) return cancel()
  cancel()
  pl.addVertexAt(pt)
  const mxcad = MxCpp.getCurrentMxCAD()
  mxcad.drawEntity(pl)
}

addCommand("m_mx_et_pencil", m_mx_et_pencil)
