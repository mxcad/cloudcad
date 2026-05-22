import {
  Field,
  FieldProps,
  PickerColumn,
  PickerCancelEventParams,
  showConfirmDialog,
} from "vant";
import { Ref, ref } from "vue";
import { showSelectPopup } from "@/plugins/vant/components/popup/showSelectPopup";
import { t } from "@/languages";


const useSelectInputJSX = (
  columns: PickerColumn,
  fieldValue: Ref<string>,
  {
    FieldProps = {},
  }: {
    FieldProps?: Partial<FieldProps>;
  } = {}
) => {
  const onConfirm = ({ selectedOptions }: PickerCancelEventParams) => {
    if (selectedOptions[0])
      fieldValue.value = selectedOptions[0].text as string;
  };
  const onClick = ()=> {
    showSelectPopup(columns, onConfirm, fieldValue)
  }
  return (
      <Field
        v-model={fieldValue.value}
        onClick={onClick}
        right-icon="arrow-down"
        {...FieldProps}
      />
  );
};

const precisionColumns = [
  { text: "0.01", value: "0.01" },
  { text: "0.02", value: "0.02" },
  { text: "0.05", value: "0.05" },
  { text: "0.1", value: "0.1" },
];
const precisionValue = ref("0.01");


const scaleColumns = [
  { text: "1:1", value: "1:1" },
  { text: "1:2", value: "1:2" },
  { text: "1:5", value: "1:5" },
  { text: "1:10", value: "1:10" },
];
const scaleValue = ref("1:10");


// ‍  标注样式弹框
// ‍ Annotation style pop-up box

export const useAnnotationStyleDialog = () => {
  showConfirmDialog({
    title: t("标注样式"),
    message: () => {
      return (
        <div>
          {useSelectInputJSX(
            precisionColumns,
            precisionValue,
            {
              FieldProps: {
                label: "当前标注精度:",
              },
            }
          )}
          {useSelectInputJSX(scaleColumns, scaleValue, {
            FieldProps: {
              label: t("当前标注比例") + ":",
            },
          })}
          <Field label={t("标注颜色") + ":"} type="color" />
          <Field label={t("文字颜色") + ":"} type="color" />
        </div>
      );
    },
  })
    .then(() => {
      // on confirm
    })
    .catch(() => {
      // on cancel
    });
};