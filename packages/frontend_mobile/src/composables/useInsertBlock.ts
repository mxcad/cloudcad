///////////////////////////////////////////////////////////////////////////////
// 移动端插入图块完整逻辑 — 对应 PC 端 useInsertDialog.ts
// 适配说明:
//   useMessage() → showToast (vant)
//   useLoading() → showLoadingToast / closeToast (vant)
//   usePopup().open() → showConfirmDialog (vant)
//   browserCacheRef → useStorage (@vueuse/core)
//   browserCacheReactive → useStorage (@vueuse/core)
//   openLeaderBlockTextsDialog → 暂跳过，直接使用默认属性值
//   移除 Electron 分支、isFullscreen 逻辑
///////////////////////////////////////////////////////////////////////////////

import { ref, watch, reactive } from 'vue'
import { useStorage } from '@vueuse/core'
import { showToast, showLoadingToast, closeToast, showConfirmDialog } from 'vant'
import { MxType } from 'mxdraw'
import {
  MxCpp,
  McDbBlockReference,
  MxCADUiPrPoint,
  McGePoint3d,
  McGeLongArray,
  McDbAttribute,
  McDbAttributeDefinition,
} from 'mxcad'
import type { McObjectId, McDbBlockTableRecord } from 'mxcad'
import { t } from '@/languages'
import { showFilePicker, FilePickerResult } from '@/composables/useNativeFilePicker'
import { buildPublicMxwebUrl } from '@/services/publicFileService'

export interface BlockInfoItem {
  name: string
  filePath?: string
  hash?: string
  id?: string
  isBlockLibrary?: boolean
}

/** 从当前图纸获取所有非系统块名 */
export function getBlockNames(): string[] {
  const mxcad = MxCpp.getCurrentMxCAD()
  if (!mxcad) return []
  const blockTable = mxcad.getDatabase().getBlockTable()
  const blockTableRecords = blockTable
    .getAllRecordId()
    .map((objId: McObjectId) => objId.getMcDbBlockTableRecord())
  const names: string[] = []
  blockTableRecords.forEach((block) => {
    if (block?.name && !block.name.startsWith('*')) names.push(block.name)
  })
  return names
}

function angleTo(x1: number, y1: number, x2: number, y2: number) {
  const x = x1 - x2
  const y = y1 - y2
  let angle_temp = 0
  if (x === 0) {
    angle_temp = Math.PI / 2
  } else {
    angle_temp = Math.atan(Math.abs(y / x))
  }
  if (x < 0 && y >= 0) {
    angle_temp = Math.PI - angle_temp
  } else if (x < 0 && y < 0) {
    angle_temp = Math.PI + angle_temp
  } else if (x >= 0 && y < 0) {
    angle_temp = Math.PI * 2.0 - angle_temp
  }
  return angle_temp + Math.PI
}

// 模块级共享状态（跨组件访问，供命令注册文件使用）
export const currentItem = ref<BlockInfoItem>()
export const isBlockLibrary = ref(false)

export function useInsertBlock() {
  const list = ref<BlockInfoItem[]>([])

  // 持久化标志位 — 对应 PC 端 browserCacheRef / browserCacheReactive
  const isGetInsertionPoint = useStorage(
    'Mx_InsertDialog_is_get_insertion_point',
    true
  )
  const isGetProportion = useStorage(
    'Mx_InsertDialog_is_get_proportion',
    true
  )
  const isUniformProportion = useStorage(
    'Mx_InsertDialog_is_uniform_proportion',
    true
  )
  const isGetRotation = useStorage(
    'Mx_InsertDialog_is_get_rotation',
    true
  )
  const isDecomposition = useStorage(
    'Mx_InsertDialog_is_decomposition',
    false
  )
  const isAutoComputeOrigin = useStorage(
    'Mx_InsertDialog_is_auto_compute_origin',
    false
  )
  const isExtractBlock = useStorage(
    'Mx_InsertDialog_is_extract_block',
    false
  )

  // Library 模式专用标志
  const isBlockLibraryDecomposition = ref(false)
  const isBlockLibraryAutoComputeOrigin = ref(true)

  // 插入点 / 比例 / 旋转
  const insertionPoint = reactive({ x: 0, y: 0, z: 0 })
  const proportion = useStorage('Mx_InsertDialog_proportion', {
    x: 1,
    y: 1,
    z: 1,
  }, localStorage, { shallow: false })
  const rotation = ref(0)

  // ──── 初始化块列表 ────
  const init = () => {
    list.value = getBlockNames()
      .filter((name) => !name.startsWith('*'))
      .map((name) => ({ name, id: name }))
  }

  // ──── 浏览文件（独立模式）── 对齐 OpenDwg 命令的文件处理 ────
  const openFile = async () => {
    return new Promise<void>((resolve) => {
      showFilePicker((param: FilePickerResult) => {
        const name = param.name.replace(/\.[^/.]+$/, '')

        if (param.type === 'mxweb') {
          // .mxweb 直接用 blob URL
          const filePath = URL.createObjectURL(param.file.source)
          const newItem: BlockInfoItem = { name, filePath, id: filePath }
          list.value.unshift(newItem)
          currentItem.value = newItem
        } else {
          // .dwg / .dxf 已通过 showFilePicker 上传 → 用 public-file/access URL
          const filePath = buildPublicMxwebUrl(param.hash)
          const newItem: BlockInfoItem = { name, filePath, id: filePath }
          list.value.unshift(newItem)
          currentItem.value = newItem
        }

        resolve()
      })
    })
  }

  // ═══════════════════════════════════════════════════════════
  //  核心：插入图块 — 对应 PC 端 insertBlock()
  //  保持所有交互逻辑（MxCADUiPrPoint / MxCADUiPrAngle），
  //  仅替换 UI 层（useMessage → showToast, usePopup → showConfirmDialog）
  // ═══════════════════════════════════════════════════════════
  const insertBlock = async (
    beforeInteractive?: () => void
  ): Promise<boolean> => {
    let mxcad = MxCpp.App.getCurrentMxCAD()
    const { filePath, hash, name } = currentItem.value || {}
    const table = mxcad.getDatabase().getBlockTable()

    let blkrecId!: McObjectId
    if (name === '' || !name) {
      showToast(t('图块名称不能为空'))
      return false
    }
    if (name) {
      blkrecId = table.get(name)
    } else if (!filePath) {
      showToast(t('请选择正确的图块'))
      return false
    }
    let isNotBlock = !blkrecId || !blkrecId.isValid()

    // ── 加载块定义 ──
    const insert = async (
      fp: string,
      isUpdate?: boolean
    ): Promise<McObjectId> => {
      showLoadingToast({
        message: t('图块加载中') + '...',
        forbidClick: true,
        duration: 0,
      })
      const id = await mxcad.insertBlock(
        fp,
        name || hash || fp,
        true,
        undefined,
        isUpdate ? true : false,
        isUpdate ? true : false
      )
      closeToast()
      if (!id.isValid()) {
        showToast(t('图块加载失败'))
      }
      return id
    }

    if (isNotBlock) {
      if (filePath) {
        blkrecId = await insert(filePath)
        if (!blkrecId || !blkrecId.isValid()) return false
      } else {
        showToast(t('请选择正确的图块'))
        return false
      }
    } else if (filePath) {
      if (!isBlockLibrary.value) {
        // 块已存在 — 询问是否更新
        try {
          await showConfirmDialog({
            title: t('图块已存在'),
            message: t('是否更新图块'),
            confirmButtonText: t('更新'),
            cancelButtonText: t('取消'),
          })
        } catch {
          return false // 用户取消
        }
        blkrecId = await insert(filePath, true)
        if (!blkrecId || !blkrecId.isValid()) return false
      }
    }

    if (blkrecId) blkrecId.erase(false)

    // ── 提取块中块 ──
    if (isExtractBlock.value) {
      const blkRec = blkrecId.getMcDbBlockTableRecord() as McDbBlockTableRecord
      if (blkRec) {
        const entityIds = blkRec.getAllEntityId()
        if (entityIds.length === 1) {
          const entityId = entityIds[0]
          const ent = entityId.getMcDbEntity()
          if (entityId.isValid() && ent instanceof McDbBlockReference) {
            blkrecId = ent.blockTableRecordId
          }
        }
      }
    }

    // ── 自动计算原点 ──
    const effectiveAutoComputeOrigin = isBlockLibrary.value
      ? isBlockLibraryAutoComputeOrigin.value
      : isAutoComputeOrigin.value

    if (effectiveAutoComputeOrigin) {
      let blkRec = blkrecId.getMcDbBlockTableRecord() as McDbBlockTableRecord
      if (blkRec) {
        let box = blkRec.getBoundingBox()
        if (box.ret) {
          let basept = box.minPt.addvec(
            box.maxPt.sub(box.minPt).mult(0.5)
          )
          blkRec.origin = basept
        }
      }
    }

    // ── 创建块引用 + 自动缩放 ──
    let blkRef = new McDbBlockReference()
    blkRef.blockTableRecordId = blkrecId
    let box = blkRef.getBoundingBox()
    let oldScale = 0
    if (box.ret) {
      let dLen = box.maxPt.distanceTo(box.minPt)
      if (dLen > 0.00001) {
        oldScale = mxcad.getMxDrawObject().screenCoordLong2Doc(100) / dLen
        blkRef.setScale(oldScale)
      }
    }

    // 关闭弹出层（让画布可见，对应 PC 端 showDialog(false)）
    beforeInteractive?.()

    // ── 插入点交互 ──
    let getPoint = new MxCADUiPrPoint()
    // 移动端交互设置（对齐 m_mx_line.ts / m_mx_img.ts）
    getPoint.clearLastInputPoint()
    getPoint.setOffsetInputPostion(true)
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd)
    if (isGetInsertionPoint.value) {
      getPoint.setMessage('\n' + t('指定插入基点'))
      getPoint.setUserDraw((v: McGePoint3d, worldDraw: any) => {
        blkRef.position = v
        worldDraw.drawMcDbEntity(blkRef)
      })
      let pt = await getPoint.go()
      if (!pt) {
        // 用户取消 → 视为成功关闭（插入被跳过）
        return true
      }
      blkRef.position = pt
    } else {
      blkRef.position = new McGePoint3d(
        insertionPoint.x,
        insertionPoint.y,
        insertionPoint.z
      )
    }

    // ── 比例交互 ──
    if (isGetProportion.value) {
      const minPt = box.minPt
      const maxPt = box.maxPt
      let dXLen = maxPt.x - minPt.x
      let dYLen = maxPt.y - minPt.y
      let dScaleLen = (dXLen + dYLen) / 3.0
      if (dScaleLen < 0.00001) dScaleLen = 1

      getPoint.setMessage('\n' + t('输入比例因子') + '<1.00>')
      blkRef.setScale(-oldScale)
      getPoint.setUserDraw((v: McGePoint3d, worldDraw: any) => {
        const dist = v.distanceTo(blkRef.position)
        if (dist < 0.00001) return
        let dScale = dist / dScaleLen
        if (dScale > 100000) dScale = 100000
        blkRef.setScale(dScale)
        worldDraw.drawMcDbEntity(blkRef)
      })
      await getPoint.go()
    } else {
      if (isUniformProportion.value) {
        blkRef.setScale(proportion.value.x)
      } else {
        blkRef.scaleFactors = new McGePoint3d(
          proportion.value.x,
          proportion.value.y,
          proportion.value.z
        )
      }
    }

    // ── 旋转交互 ──
    if (isGetRotation.value) {
      getPoint.setBasePt(blkRef.position)
      getPoint.setUserDraw((v: McGePoint3d, worldDraw: any) => {
        blkRef.rotation = angleTo(
          blkRef.position.x,
          blkRef.position.y,
          v.x,
          v.y
        )
        worldDraw.drawMcDbEntity(blkRef)
      })
      await getPoint.go()
    } else {
      blkRef.rotation = rotation.value
    }

    // ── 绘制实体 ──
    const id = mxcad.drawEntity(blkRef)

    // ── 块属性文字 ──
    if (id.isValid()) {
      let attrs: { prompt: string; value: string }[] = []
      const blkTableRecord = blkrecId.getMcDbBlockTableRecord()
      if (blkTableRecord) {
        blkTableRecord.getAllEntityId().forEach((attrId: McObjectId) => {
          const attrDefinition = attrId.getMcDbEntity()
          if (attrDefinition instanceof McDbAttributeDefinition) {
            attrs.push({
              prompt: attrDefinition.prompt,
              value: attrDefinition.textString,
            })
          }
        })
      }
      if (attrs.length > 0) {
        // 移动端：直接使用默认属性值（PC 端此处会打开 openLeaderBlockTextsDialog）
        const entity = id.getMcDbEntity() as any
        entity.createAttribute?.()
        entity.getAllAttribute?.().forEach(
          (attrId: McObjectId, index: number) => {
            const attr = attrId.getMcDbEntity()
            if (attr instanceof McDbAttribute) {
              attr.textString = attrs[index]?.value || ''
            }
          }
        )
      }
    }

    // ── 分解 ──
    const effectiveDecomposition = isBlockLibrary.value
      ? isBlockLibraryDecomposition.value
      : isDecomposition.value

    if (effectiveDecomposition) {
      setTimeout(() => {
        let aryIdLong = new McGeLongArray()
        aryIdLong.copyFormAryId([id])
        ;(MxCpp.App as any).MxCADAssist.MxExplode(aryIdLong.imp)
        mxcad.updateDisplay()
      })
    }

    mxcad.updateDisplay()
    showToast(t('插入图块成功'))

    // ── 清理 blob URL ──
    if (filePath?.startsWith('blob:')) {
      URL.revokeObjectURL(filePath)
    }

    return true
  }

  return {
    list,
    currentItem,
    isBlockLibrary,
    isGetInsertionPoint,
    insertionPoint,
    isGetProportion,
    proportion,
    isUniformProportion,
    isGetRotation,
    rotation,
    isDecomposition,
    isAutoComputeOrigin,
    isBlockLibraryDecomposition,
    isBlockLibraryAutoComputeOrigin,
    isExtractBlock,
    init,
    openFile,
    insertBlock,
  }
}
