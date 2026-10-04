import iro from '@jaames/iro'
import { ref, watch } from 'vue'

const isShowColorPicker = ref(false)
const { ColorPicker } = iro

let colorPicker: iro.ColorPicker | null = null
let _select = ".colorPicker"

const initColorPicker = () => {
    if (colorPicker) return
    const width = Math.min(window.innerWidth, window.innerHeight) * 0.6
    colorPicker = new (ColorPicker as any)(_select, {
        width,
        color: "rgb(255, 0, 0)",
        borderWidth: 1,
        borderColor: "#fff",
    })
    const el = colorPicker!.el
    const circle = el.getElementsByClassName("IroWheel")[0] as HTMLElement

    // 点在色轮圆外即关闭。触摸与鼠标都要覆盖：桌面浏览器/平板外接鼠标下
    // touchstart 不触发，缺鼠标分支时色轮打开后无法关闭（UI 卡死）
    const isOutsideWheel = (clientX: number, clientY: number) => {
        const centerX = circle.offsetWidth / 2;
        const centerY = circle.offsetHeight / 2;
        const dx = clientX - (circle.getBoundingClientRect().left + centerX);
        const dy = clientY - (circle.getBoundingClientRect().top + centerY);
        const radius = circle.offsetWidth / 2;
        return Math.sqrt(dx * dx + dy * dy) > radius
    }
    const isOnSlider = (target: EventTarget | null) => {
        let el = target as HTMLElement
        if (el.tagName === "svg") {
            el = el.parentElement as HTMLElement
        }
        return typeof el.className === "string" && ["IroSliderGradient", "IroSlider"].some((className) => el.className.includes(className))
    }
    document.addEventListener("touchstart", (event) => {
        if (isOnSlider(event.target)) return
        if (isOutsideWheel(event.changedTouches[0].clientX, event.changedTouches[0].clientY)) {
            event.stopPropagation()
            isShowColorPicker.value = false
        }
    })
    document.addEventListener("mousedown", (event) => {
        if (!isShowColorPicker.value) return
        if (isOnSlider(event.target)) return
        if (isOutsideWheel(event.clientX, event.clientY)) {
            isShowColorPicker.value = false
        }
    })
}

const getColorPicker = () => {
    initColorPicker()
    return colorPicker
}

const openColorPicker = (onColor?: (color: iro.Color) => void, color?: iro.Color) => {
    return new Promise<void>((res)=> {
        initColorPicker()
        if (!colorPicker) return res()
        if (color) colorPicker.color.rgb = color.rgb
        if (onColor) {
            colorPicker.on("color:change", onColor)
        }
        isShowColorPicker.value = true
        const clean = watch(isShowColorPicker, (val) => {
            if (!val) {
                if (onColor) colorPicker!.off("color:change", onColor)
                clean()
                res()
            }
        })
    })
    
}
export const useColorPicker = (select: string = ".colorPicker") => {
    _select = select
    return {
        getColorPicker,
        isShowColorPicker,
        openColorPicker
    }
}