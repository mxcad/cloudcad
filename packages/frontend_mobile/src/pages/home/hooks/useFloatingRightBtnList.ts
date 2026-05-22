
import { ComputedRef, Ref, computed, onMounted, ref } from "vue"

export const useFloatingRightBtnList = ()=> {
    const getDrawIcon = (name: string)=> {
        return "./mxcustomui/draw/" + name
    }
    const filledIcons = Array(7).fill(void 0).map((_, index)=> {
        return {
            icon: getDrawIcon(`mx_pat${index}.png`),
            actionIcon: getDrawIcon(`mx_pat${index}sel.png`),
            btnIcon: getDrawIcon(`mx_tc-${index}.png`),
        }
    })
    const lineStyleIcons = Array(5).fill(void 0).map((_, index)=> {
        return {
            icon: getDrawIcon(`mx_line${index + 1}.png`),
            actionIcon: getDrawIcon(`mx_line${index + 1}sel.png`),
            btnIcon: getDrawIcon(`mx_xx-${index + 1}.png`),
        }
    })
    const lineWidthIcons = Array(5).fill(void 0).map((_, index)=> {
        return {
            icon: getDrawIcon(`mx_linew${index + 1}.png`),
            actionIcon: getDrawIcon(`mx_linew${index + 1}sel.png`),
            btnIcon: getDrawIcon(`mx_xw-${index + 1}.png`),
        }
    })
    const filledIndex = ref(0)
    const lineStyleIndex = ref(0)
    const lineWidthIndex = ref(0)
    const fillBtnIcon = computed(()=> {
        return filledIcons[filledIndex.value].btnIcon
    })
    const lineStyleIcon = computed(()=> {
        return lineStyleIcons[lineStyleIndex.value].btnIcon
    })
    const lineWidthIcon = computed(()=> {
        return lineWidthIcons[lineWidthIndex.value].btnIcon
    })
    interface BtnInfo {
        icon: ComputedRef<string> | string;
        icons: {
            icon: string;
            actionIcon: string;
            btnIcon: string;
        }[];
        index: Ref<number>;
    }
    const floatingRightBtnArr: BtnInfo[] = [{
        icon: fillBtnIcon,
        icons: filledIcons,
        index: filledIndex,
    }, {
        icon: lineStyleIcon,
        icons: lineStyleIcons,
        index: lineStyleIndex,
    }, {
        icon: lineWidthIcon,
        icons: lineWidthIcons,
        index: lineWidthIndex,
    }]
    const onClickBtn = (info: BtnInfo)=> {
        (actionBtn.value as unknown as BtnInfo) = info
    } 
    const actionBtn = ref<BtnInfo | null>(null)
  
    document.addEventListener('click', () => {
        actionBtn.value = null
    })
    return {
        floatingRightBtnArr,
        actionBtn,
        onClickBtn
    }
}