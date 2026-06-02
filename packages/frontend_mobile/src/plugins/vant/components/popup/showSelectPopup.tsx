import {
  Popup,
  PopupProps,
  Picker,
  PickerProps,
  PickerColumn,
  PickerCancelEventParams,
} from "vant";
import { Ref, createVNode, h, reactive, ref, render } from "vue";
const teleport = document.createElement("div");
document.body.appendChild(teleport);
const showPicker = ref(false);
const values = ref<PickerColumn[number]["value"][]>([]);
const columns = ref<PickerColumn>([]);
let selectPopup: any = null;
type Props = {
  popup?: Partial<PopupProps>;
  picker?: Partial<PickerProps>;
};
const selectProps: Props = reactive({
  popup: {},
  picker: {},
});

/***

 * 显示selectPopup弹出层
*Display the selectPopup pop-up layer


 * @param list 选择列表参数
*@ param list Select list parameters


 * @param onConfirm 确定事件
*@ paramonConfirm confirms the event


 * @param val 当前选择值
*@ param val current selection value

 * @param 组件Popup 和Picker 的参数
*Parameters of Popup and Picker components in @ param


 * */

export const showSelectPopup = (
  list: PickerColumn,
  onConfirm?: (e: PickerCancelEventParams, ...args: any[]) => any,
  val?: Ref<PickerColumn[number]["value"]>,
  props?: {
    popup?: Partial<PopupProps>;
    picker?: Partial<PickerProps>;
  }
) => {
  columns.value = list;
  showPicker.value = true;
  if (val?.value) values.value = [val.value];
  if (props) {
    selectProps.picker = props.picker;
    selectProps.popup = props.popup;
  }
  const cancel = () => {
    showPicker.value = false;
  }
  if (!selectPopup) {
    selectPopup = createVNode(
      h(() => (
        <Popup
          v-model:show={showPicker.value}
          round
          position="bottom"
          teleport={teleport}
          {...selectProps.popup}
        >
          <Picker
            columns={columns.value}
            v-model={values.value}
            onCancel={cancel}
            onConfirm={(e: PickerCancelEventParams) => {
              onConfirm && onConfirm(e);
              cancel()
            }}
            {...selectProps.picker}
          />
        </Popup>
      ))
    );
    render(selectPopup, teleport);
  }
};
