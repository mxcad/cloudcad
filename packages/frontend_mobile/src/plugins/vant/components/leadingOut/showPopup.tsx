
import { h, reactive, Ref, UnwrapNestedRefs } from "vue"
import LeadingOutPopup from "./LeadingOutPopup.vue"
import { usePopup, PopupConfig } from "@/plugins/vant/components/popup/usePopup"
import { PickerColumn } from "vant";
export interface FromType {
    fileName: string;
    list: {
        label: string;
        input: {
            value: Ref<PickerColumn[number]["value"]>,
            list:  PickerColumn[]
        }
    }[]
}
const config:UnwrapNestedRefs<PopupConfig> = reactive({
    props: {
        show: false,
        style: {
            "border-radius": "var(--van-radius-lg)"
        }
    },
    slots: {
        default:()=> h(LeadingOutPopup)
    }
})

const popup = usePopup(config)
export const showPopup = (title?: string, from?: FromType)=> {
    // if(options) popup.setProps
    popup.show()
}