import { ref, computed, watch, defineComponent } from "vue";


import { uiConfig } from "@/config/uiConfig";
import { t } from "@/languages";

export const useToolbarData = () => {
  const data = uiConfig.toolbarData as MxToolbarItem[];
  const index = ref(-1);
  const activeIndex = ref(-1)
  const isChild = computed(() => !!data[index.value]?.list);

  const title = computed(() =>
    data[index.value]?.listTitle
      ? data[index.value].listTitle
      : data[index.value]?.name
      ? data[index.value].name + t("工具")
      : ""
  );
  const list = computed(() => {
    if (isChild.value) {
      const _list = data[index.value].list;
      if (_list) return _list;
    }
    return data;
  });
  const setIndex = (i: number) => {
    index.value = i;
  };
  const setActiveIndex = (i:number)=> activeIndex.value = i
  const onClick = (i: number) => {
    if (isChild.value) return setActiveIndex(i);
    setIndex(i);
  };

  const onReturnToMainToolbar = () => {
    setIndex(-1);
    setActiveIndex(-1)
  };

  return {
    list,
    title,
    onClick,
    onReturnToMainToolbar,
    isChild,
    activeIndex
  };
};
