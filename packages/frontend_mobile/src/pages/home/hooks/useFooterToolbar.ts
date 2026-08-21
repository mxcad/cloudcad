import { callCommand } from "@/plugins/mxcad/command"
import { useToggle } from "@vueuse/core"
import { ref, nextTick } from "vue"

export const useFooterToolbar = () => {
    const left = ref(0)
    const currentItem = ref<MxToolbarItem | null>(null)

    let actionIndex = -1
    const onTap = async (e: MouseEvent, item: MxToolbarItem, index: number) => {
        const el = e.target as HTMLElement
        let rect = el.getBoundingClientRect();
        let distanceLeftFromViewport = rect.left + window.scrollX; // ‍  距离左侧
// ‍ Distance to the left

        left.value = el.clientWidth / 2 + distanceLeftFromViewport - 5
        if (window.innerWidth - left.value < 40) {
            left.value = window.innerWidth - 40
        }
        if (left.value < 20) {
            left.value = 20
        }
        currentItem.value = null

        if (index === actionIndex) {
            actionIndex = -1
        } else {
            await nextTick()
            currentItem.value = item
            actionIndex = index
        }
    }
    // ‍  历史点击按钮
// ‍ History Click Button

    const [state, toggle] = useToggle();
    const historyBtnList = ref<MxToolbarItem[]>(JSON.parse(localStorage.getItem("mx_historyBtnList") || "[]") || [])
    const onHistoryBtnClick = (item: MxToolbarItem) => {
        if (item.cmd) callCommand(item.cmd)
    }

    // ‍  点击按钮
// ‍ Click the button

    const onClick = async (_: MouseEvent, item: MxToolbarItem) => {
        console.log(item.cmd)
        if (item.cmd) callCommand(item.cmd)
        currentItem.value = null
        actionIndex = -1
        const historyIndex = historyBtnList.value.findIndex((info) => {
            if (item.cmd) {
                return info.cmd === item.cmd
            }
            if (item.name) {
                return info.name === item.name
            }
            return false
        })
        if (historyIndex >= 0) {
            const historyItem = historyBtnList.value.splice(historyIndex, 1) as any
            historyBtnList.value.unshift(historyItem[0])
        } else {
            historyBtnList.value.unshift(item)
        }
        if (historyBtnList.value.length > 6) {
            historyBtnList.value.pop()
        }
        localStorage.setItem("mx_historyBtnList", JSON.stringify(historyBtnList.value))
    }
    return {
        left,
        currentItem,
        onTap,
        onClick,
        // ‍  历史点击
// ‍ Historical clicks

        state,
        historyBtnList,
        toggle,
        onHistoryBtnClick
    }
}