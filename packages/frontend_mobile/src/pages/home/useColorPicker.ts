import iro from '@jaames/iro'
import { onMounted, ref, watch } from 'vue'

const isShowColorPicker = ref(false)
const { ColorPicker } = iro

let colorPicker!: iro.ColorPicker
const getColorPicker = () => {
    return colorPicker
}

const openColorPicker = (onColor?: (color: iro.Color) => void, color?: iro.Color) => {
    return new Promise<void>((res)=> {
        if (!colorPicker) return res()
        if (color) colorPicker.color.rgb = color.rgb
        if (onColor) {
            colorPicker.on("color:change", onColor)
        }
        isShowColorPicker.value = true
        const clean = watch(isShowColorPicker, (val) => {
            if (!val) {
                if (onColor) colorPicker.off("color:change", onColor)
                clean()
                res()
            }
        })
    })
    
}
export const useColorPicker = (select: string = ".colorPicker") => {
    onMounted(() => {
        if (!colorPicker) {
            const width = Math.min(window.innerWidth, window.innerHeight) * 0.6
            colorPicker = new (ColorPicker as any)(select, {
                width,
                color: "rgb(255, 0, 0)",
                borderWidth: 1,
                borderColor: "#fff",
            })
            const el = colorPicker.el
            const circle = el.getElementsByClassName("IroWheel")[0] as HTMLElement
            document.addEventListener("touchstart", (event) => {
                let target = event.target as HTMLElement

                if (target.tagName === "svg") {
                    target = target.parentElement as HTMLElement
                }
                if (typeof target.className === "string" && ["IroSliderGradient", "IroSlider"].some((className) => target.className.includes(className))) return
                // ‍  获取圆形中心点坐标
// ‍ Obtain the coordinates of the center point of a circle

                const centerX = circle.offsetWidth / 2;
                const centerY = circle.offsetHeight / 2;

                // ‍  触摸事件使用changedTouches来获取第一个触点的位置
// ‍ Touch events use changedTouches to obtain the position of the first touch point

                const touch = event.changedTouches[0];
                const dx = touch.clientX - (circle.getBoundingClientRect().left + centerX);
                const dy = touch.clientY - (circle.getBoundingClientRect().top + centerY);

                // ‍  判断点击是否在圆内
// ‍ Determine whether the click is within the circle

                const radius = circle.offsetWidth / 2;
                if (Math.sqrt(dx * dx + dy * dy) > radius) {
                    event.stopPropagation()
                    isShowColorPicker.value = false
                }
            })
        }
    })
    return {
        getColorPicker,
        isShowColorPicker,
        openColorPicker
    }
}