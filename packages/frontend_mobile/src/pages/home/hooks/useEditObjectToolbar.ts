import { callCommand } from "@/plugins/mxcad/command"
import { McObject, McObjectId, MxCADUtility, MxCpp } from "mxcad"
import { ref, nextTick, onMounted } from "vue"
import type { MxToolbarItem } from "@/types/mx-toolbar-item"
export const useEditObjectToolbar = () => {
    // ‍  对象编辑操作
// ‍ Object editing operation

    const objectEditingToolbarItems = [
        {
            name: "删除",
            icon: "shanchu",
            cmd: "Mx_Erase",
            isClosed: true
        },
        {
            name: "复制",
            icon: "fuzhi",
            cmd: "m_mx_copy"
        },
        {
            name: "移动",
            icon: "pianyi",
            cmd: "m_mx_move"
        },
        {
            name: "旋转",
            icon: "xuanzhuan",
            cmd: "m_mx_rotate"
        },
        {
            name: "镜像",
            icon: "jingxiang",
            cmd: "m_mx_mirror"
        },
        {
            name: "颜色",
            icon: "yanse",
            cmd: "Mx_SetObjectColor",
        }
    ]
    const isShowObjectEditingToolbar = ref(false)
    const onObjectEditingBtnTap = async (e: MouseEvent, item: MxToolbarItem, index: number) => {
        if (item.isClosed) {
            isShowObjectEditingToolbar.value = false
            await nextTick()
        }
        item.cmd && callCommand(item.cmd)
    }
    const initEditObjectToolbar = (mxcad: McObject): (() => void) => {
        let isSelect = false
        const onSelectChange = (ids: McObjectId[]) => {
            if (ids.length > 0) {
                isShowObjectEditingToolbar.value = true
                isSelect = true
                setTimeout(() => { isSelect = false })
            } else {
                isShowObjectEditingToolbar.value = false
            }
        }

        const onInitMxcad = () => {
            const canvas = mxcad.getMxDrawObject().getCanvas()
            canvas.addEventListener("touchstart", () => {
                const ids = MxCADUtility.getCurrentSelect()
                if (!isSelect && (ids.length == 0 || ids[0].isErase())) {
                    isShowObjectEditingToolbar.value = false
                }
            })
        }

        mxcad.on("selectChange", onSelectChange)
        mxcad.on("init_mxcad", onInitMxcad)
        // 引擎是单例（createMxCAD 幂等），组件重挂载时监听器会在同一引擎上累积，
        // 返回清理函数供 onBeforeUnmount 解绑，避免 selectChange 重复触发
        return () => {
            mxcad.off("selectChange", onSelectChange)
            mxcad.off("init_mxcad", onInitMxcad)
        }
    }
    return {
        isShowObjectEditingToolbar,
        objectEditingToolbarItems,
        onObjectEditingBtnTap,
        initEditObjectToolbar
    }
}