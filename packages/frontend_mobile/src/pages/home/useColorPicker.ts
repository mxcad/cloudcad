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
    document.addEventListener("touchstart", (event) => {
        let target = event.target as HTMLElement

        if (target.tagName === "svg") {
            target = target.parentElement as HTMLElement
        }
        if (typeof target.className === "string" && ["IroSliderGradient", "IroSlider"].some((className) => target.className.includes(className))) return

        const centerX = circle.offsetWidth / 2;
        const centerY = circle.offsetHeight / 2;

        const touch = event.changedTouches[0];
        const dx = touch.clientX - (circle.getBoundingClientRect().left + centerX);
        const dy = touch.clientY - (circle.getBoundingClientRect().top + centerY);

        const radius = circle.offsetWidth / 2;
        if (Math.sqrt(dx * dx + dy * dy) > radius) {
            event.stopPropagation()
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