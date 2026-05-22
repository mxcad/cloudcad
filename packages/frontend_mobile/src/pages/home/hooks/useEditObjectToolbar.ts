import { callCommand } from "@/plugins/mxcad/command"
import { McObject, MxCADUtility, MxCpp } from "mxcad"
import { ref, nextTick, onMounted } from "vue"
import { t } from "@/languages"
export const useEditObjectToolbar = () => {
    // ‍  对象编辑操作
// ‍ Object editing operation

    const objectEditingToolbarItems = [
        {
            name: t("删除"),
            icon: "shanchu",
            cmd: "Mx_Erase",
            isClosed: true
        },
        {
            name: t("复制"),
            icon: "fuzhi",
            cmd: "m_mx_copy"
        },
        {
            name: t("移动"),
            icon: "pianyi",
            cmd: "m_mx_move"
        },
        {
            name: t("旋转"),
            icon: "xuanzhuan",
            cmd: "m_mx_rotate"
        },
        {
            name: t("镜像"),
            icon: "jingxiang",
            cmd: "m_mx_mirror"
        },
        {
            name: t("颜色"),
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
    const initEditObjectToolbar = (mxcad: McObject)=> {
        let isSelect = false
        mxcad.on("selectChange", (ids) => {
            if (ids.length > 0) {
                isShowObjectEditingToolbar.value = true
                isSelect = true
                setTimeout(() => { isSelect = false })
            } else {
                isShowObjectEditingToolbar.value = false
            }
        })
    
        mxcad.on("init_mxcad", () => {
            const canvas = mxcad.getMxDrawObject().getCanvas()
            canvas.addEventListener("touchstart", () => {
                const ids = MxCADUtility.getCurrentSelect()
                if (!isSelect && (ids.length == 0 || ids[0].isErase())) {
                    isShowObjectEditingToolbar.value = false
                }
            })
        })
    } 
    return {
        isShowObjectEditingToolbar,
        objectEditingToolbarItems,
        onObjectEditingBtnTap,
        initEditObjectToolbar
    }
}