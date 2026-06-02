import { t } from "@/languages";
import { addCommand } from "@/plugins/mxcad/command";
import { onClickOutside } from "@vueuse/core";
import {
  McDbMText,
  McDbText,
  McGePoint3d,
  MxCADResbuf,
  MxCADSelectionSet,
  MxCpp,
} from "mxcad";
import { MxThreeJS, MxFun } from "mxdraw";
import {
  showConfirmDialog,
  Field,
  showToast,
  FloatingPanel,
  CellGroup,
  Cell,
} from "vant";
import { createVNode, defineComponent, h, ref, render, watch } from "vue";

const el = ref<InstanceType<typeof FloatingPanel>>();
const anchors = new Array(4).fill(0).map((_, index) => {
  if (index === 0) return 100;
  return Math.round(0.1 * index * window.innerHeight);
});
const height = ref(anchors[3]);
const filterTextInfos = ref<
  {
    text: string;
    index: number;
  }[]
>([]);
let textRectBox: THREE.Line;
let filterTexts: (McDbText | McDbMText)[] = [];
const createRectBox = (
  minPt: McGePoint3d,
  maxPt: McGePoint3d,
  color: string | number | THREE.Color = 0xff0000
) => {
  const v1 = minPt.toVector3();
  const v2 = maxPt.toVector3();
  const v3 = new THREE.Vector3(v1.x, v2.y);
  const v4 = new THREE.Vector3(v2.x, v1.y);
  return MxThreeJS.createLines([v1, v3, v2, v4, v1], color);
};
const onClick = (index: number) => {
  const mxcad = MxCpp.App.getCurrentMxCAD();
  textRectBox && mxcad.getMxDrawObject().removeObject(textRectBox);
  const text = filterTexts[index];
  const { minPt, maxPt } = text.getBoundingBox();
  const ent = createRectBox(minPt.clone(), maxPt.clone());
  textRectBox = ent;
  mxcad.getMxDrawObject().addObject(textRectBox);
  const offset =
    (text instanceof McDbText ? text.height : text.textHeight) * 10;
  minPt.x -= offset;
  minPt.y -= offset;
  maxPt.x += offset;
  maxPt.y += offset;
  mxcad.zoomW(minPt, maxPt);
  updateDisplay();
  setTimeout(() => {
    mxcad.getMxDrawObject().removeObject(ent);
    updateDisplay();
  }, 1000);
};

const showFindTextList = () => {
  const FindTextList = defineComponent({
    name: "FindTextList",
    setup(props, context) {
      // ‍  返回用于渲染的数据或组件
// ‍ Return data or components used for rendering

      return () => (
        <FloatingPanel
          ref={el}
          v-model:height={height.value}
          anchors={anchors}
          content-draggable={false}
          style="--van-floating-panel-background: #3C3C3C"
        >
          <CellGroup>
            {filterTextInfos.value.map((item) => (
              <Cell
                style="--van-cell-background: #3c3c3c;--van-cell-text-color: #fff"
                onClick={() => onClick(item.index)}
                title={item.text}
                size="large"
              />
            ))}
          </CellGroup>
        </FloatingPanel>
      );
    },
  });
  const vNode = createVNode(h(() => <FindTextList></FindTextList>));
  
  render(vNode, document.body)
  setTimeout(() => {
    cancel && cancel();
    cancel = onClickOutside(el.value?.$el, () => {
      vNode.el && vNode.el.remove()
      cancel();
    });
  }, 500);
};

const updateDisplay = () => MxFun.updateDisplay();
let selectRectBox!: THREE.Line;
let cancel!: () => void;
export async function m_mx_find_text() {
  const mxcad = MxCpp.App.getCurrentMxCAD();
  selectRectBox && mxcad.mxdraw.removeObject(selectRectBox);
  const searchText = ref("");

  const res = await showConfirmDialog({
    title: t("请输入要查找的文字"),
    message: () => (
      <div>
        <Field
          v-model={searchText.value}
          label={t("内容")}
          placeholder={t("请输入搜索的文字")}
          border
          clearable
          clickable
          autofocus
        ></Field>
      </div>
    ),
  });

  if (res === "cancel") return
  if (searchText.value === "") {
    showToast(t("内容不能为空"));
    return;
  }

  let select: MxCADSelectionSet;

  const selectRegion = async (isNewSelect = false) => {
    const filter = new MxCADResbuf();
    filter.AddMcDbEntityTypes("TEXT,MTEXT");
    const isSelect = isNewSelect || !select;
    if (isSelect) select = new MxCADSelectionSet();
    select.allSelect(filter);
    return select;
  };
  const getTexts = async () => {
    const select = await selectRegion();
    const texts: (McDbText | McDbMText)[] = [];
    select.forEach((objId) => {
      const text = objId.getMcDbEntity() as McDbText | McDbMText;
      texts.push(text);
    });
    return texts;
  };

  const search = async () => {
    if (searchText.value === "") return;
    const mxcad = MxCpp.App.getCurrentMxCAD();
    textRectBox && mxcad.getMxDrawObject().removeObject(textRectBox);
    const texts = await getTexts();
    const regexp = new RegExp(searchText.value, "g");
    filterTexts = texts.filter((enter) => {
      if (enter instanceof McDbMText) {
        return regexp.test(enter.contents);
      }
      if (enter instanceof McDbText) {
        return regexp.test(enter.textString);
      }
      return false;
    });
    const arr: {
      text: string;
      index: number;
    }[] = [];
    filterTexts.forEach((text, index) => {
      if (text instanceof McDbMText) {
        arr.push({
          text: text.contents,
          index,
        });
      }
      if (text instanceof McDbText) {
        arr.push({
          text: text.textString,
          index,
        });
      }
    });
    filterTextInfos.value = arr;
    if (filterTextInfos.value.length <= 0) return showToast(t("未找到匹配的文字"));
    showFindTextList()
  };
  search();
}

addCommand("m_mx_find_text", m_mx_find_text);
