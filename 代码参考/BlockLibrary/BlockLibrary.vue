<script setup lang="ts">
import MxLabel from "@/components/MxDialog/MxLabel.vue"
import { useFocus } from '@/store';
import { useBlockLibrary, BlockData, GalleryType, BlockTypes } from './hooks/useBlockLibrary';
import Block from './Block.vue';
import { MxFun, callCommand } from '@/plugins/mxcad';

import { useBlockCollect } from './hooks/useBlockCollect';
import { getBaseUrl } from '@/config/serverConfig';
import { BlockInfoItem } from '@/view/Dialogs/InsertDialog/hooks/useInsertDialog';
import { useMessage } from '@/view/Message/useMessage';
import { computed, onMounted, ref } from "vue";
import { setFileName } from "@/view/Header/hooks/useFileName";

import { t as _t } from "@/languages";
import { useLayout } from "vuetify";
import { getRootContainer } from "@/utils/getRootContainer"

const { onResize } = defineProps<{
  onResize?: (call: (width: number) => void) => void
}>()
const { isShowBlockLibrary, galleryTypes, galleryType, searchKeyword, requestBlockLibraryData, onSearch, blockTypes, secondaryBlockTypes, typeId, blockType, threeLevelClassifiedType,
  threeLevelClassifiedTypes,
  pageIndex,
  updatePageIndex,
  countPageSize,
  mode,
  updateKey,
  currentData, } = useBlockLibrary()
const { collection, collectionList,
  collectionTypes,
  collectionTypeId } = useBlockCollect()
const { setCommandFocus } = useFocus()
const onFocus = (is: boolean) => {
  setCommandFocus(!is)
}
let isDblclick = false
// @ts-ignore
let singleClickTimeout: NodeJS.Timeout | null = null;
const onClick = (block: BlockData) => {
  const baseUrl = getBaseUrl();
  if (galleryType.value === GalleryType.Drawings) {
    if (!singleClickTimeout) {
      singleClickTimeout = setTimeout(() => {
        if (!isDblclick) {
          useMessage().info(_t("请双击打开图纸"))
          isDblclick = false; // 重置状态
        }
      }, 500);
    }
  } else if (galleryType.value === GalleryType.Blocks) {
    callCommand<BlockInfoItem>("Mx_Insert", {
      // 正确的mxweb地址
      filePath: `${baseUrl}/blocks/${block.secondType}/${block.firstType}/${block.filehash}.mxweb`,
      name: block.filename,
      hash: block.filehash,
      isBlockLibrary: true
    })
  }

}

const onDblclick = async (block: BlockData) => {
  // 清除单击的定时器，直接执行双击的逻辑
  if (singleClickTimeout !== null) {
    clearTimeout(singleClickTimeout);
    singleClickTimeout = null;
  }
  const baseUrl = getBaseUrl();
  if (galleryType.value === GalleryType.Drawings) {
    MxFun.sendStringToExecute("_openMxweb", `${baseUrl}/drawings/${block.secondType}/${block.firstType}/${block.filehash}.mxweb`)
    setFileName(block.filename)
  }
}
const onCollection = async (block: BlockData) => {
  if (await collection(block)) {
    const index = collectionList.value.indexOf(block)
    collectionList.value.splice(index, 1)
    if (collectionList.value.length === 0 && collectionTypes.value) {
      collectionTypes.value = collectionTypes.value.filter(((item) => {
        return item.id !== collectionTypeId.value
      }))
      if (collectionTypes.value[0]) collectionTypeId.value = collectionTypes.value[0].id
      else collectionTypeId.value = -1
    }
  }
}
const onTypeId = (id: number) => {
  const type = secondaryBlockTypes.value.find((type) => type.id === id)
  if (!type) return
  if (blockTypes.value) blockType.value = blockTypes.value.find(({ pid }) => pid === type.pid)
}
const onBlockType = (blockType: BlockTypes[number]) => {
  if (blockType.list.some((type) => {
    return type.id === typeId.value
  })) {
    return
  } else {
    typeId.value = blockType.list[0].id
  }
}
const libraryBox = ref<HTMLDivElement>()
const isWidescreenMode = ref<boolean | undefined>(false)
const drawerWidth = ref(0)
const totalVisible = computed(() => {
  return isWidescreenMode.value ? parseInt(((drawerWidth.value - 150) / 40).toString()) : void 0
})

onResize && onResize((width) => {
  drawerWidth.value = width
  isWidescreenMode.value = width > 450
})
onMounted(() => {
  isWidescreenMode.value = libraryBox.value && libraryBox.value?.clientWidth > 450
})
const onClickControl = (e: MouseEvent) => {
  (e.target as HTMLInputElement)?.select()
}
const onModelValuePageIndex = (numStr: string) => {
  const i = Number(numStr)
  pageIndex.value = i >= countPageSize.value ? countPageSize.value : i
}
const { mainRect } = useLayout()

</script>

<template>
  <div class="mx_block_library_box" v-show="isShowBlockLibrary" ref="libraryBox">
    <div class="d-flex flex-column h-100">
      <v-radio-group v-model="galleryType">
        <v-radio v-for="type in galleryTypes" :value="type.value">
          <template v-slot:label>
            <MxLabel>{{ t(type.title) }}</MxLabel>
          </template>
        </v-radio>
      </v-radio-group>
      <div class="d-flex mt-1">
        <v-text-field v-model="searchKeyword" @update:focused="onFocus" @change="onSearch" class="w-75"
          append-inner-icon="class:iconfont sousuo"></v-text-field>
      </div>
      <div class="d-flex flex-column mt-1 mb-2">
        <template v-if="isWidescreenMode">
          <v-chip-group selected-class="text-primary" mandatory column v-model="blockType">
            <v-chip v-for="(item, index) in blockTypes" :key="index" border tile rounded="sm" size="small"
              :value="item">
              {{ t(item.pname) }}
            </v-chip>
          </v-chip-group>
          <v-sheet color="background">
            <div class="d-flex align-center">
              <v-chip-group selected-class="text-primary" mandatory v-model="typeId">
                <v-chip v-for="(item, index) in secondaryBlockTypes" :key="index" border tile rounded="sm" size="small"
                  :value="item.id">
                  {{ t(item.name) }}
                </v-chip>
              </v-chip-group>
            </div>
            <div class="d-flex align-center">
              <v-chip-group selected-class="text-primary" mandatory v-model="threeLevelClassifiedType">
                <v-chip v-for="(item, index) in threeLevelClassifiedTypes" :key="index" border tile rounded="sm"
                  size="small" :value="item">
                  {{ t(item) }}
                </v-chip>
              </v-chip-group>
            </div>
          </v-sheet>

        </template>
        <template v-else>
          <v-select :items="blockTypes" v-model="blockType" @update:model-value="onBlockType" class="mt-1"
            item-title="pname" return-object>
            <template #selection="{ item }">{{ t(item.title) }}</template>
            <template #item="{ item, props }">
              <v-list-item v-bind="props" :title="t(item.title)"></v-list-item>
            </template>
          </v-select>
          <v-select :items="secondaryBlockTypes" v-model="typeId" @update:model-value="onTypeId" item-title="name"
            class="mt-1" item-value="id">
            <template #selection="{ item }">{{ t(item.title) }}</template>
            <template #item="{ item, props }">
              <v-list-item v-bind="props" :title="t(item.title)"></v-list-item>
            </template>
          </v-select>
          <v-select :items="threeLevelClassifiedTypes" v-model="threeLevelClassifiedType" :return-object="false"
            class="mt-1">
            <template #selection="{ item }">{{ t(item.title) }}</template>
            <template #item="{ item, props }">
              <v-list-item v-bind="props" :title="t(item.title)"></v-list-item>
            </template>
          </v-select>
        </template>
      </div>
      <v-infinite-scroll :height="`calc(${getRootContainer().clientHeight}px - ${(mainRect.top || 0) + (isWidescreenMode ? 300 : 244)}px)`"
        :mode="mode" :key="updateKey" side="both" @load="requestBlockLibraryData">
        <div class="d-flex  flex-wrap justify-space-around">
          <Block v-for="(block, index) in currentData" :type="galleryType" :data="block" :key="block.filename + index"
            @dblclick.stop="onDblclick(block)" @click="onClick(block)" @collection="collection"></Block>
        </div>
        <template v-slot:empty>
          <v-alert type="warning">No more items!</v-alert>
        </template>
      </v-infinite-scroll>

      <v-row no-gutters>
        <v-col :cols="isWidescreenMode ? 'auto' : 12">
          <v-pagination v-model="pageIndex" @update:model-value="updatePageIndex" :total-visible="totalVisible"
            :length="countPageSize" density="compact" size="small">
            <template #first></template>>
          </v-pagination>
        </v-col>
        <v-spacer></v-spacer>
        <v-col cols="auto">
          <v-text-field type="number" :model-value="pageIndex" @update:model-value="onModelValuePageIndex"
            @update:focused="(is) => { setCommandFocus(!is); !is && updatePageIndex() }" @click:control="onClickControl"
            :max="countPageSize" :max-width="105" width="105" min="1" variant="outlined">
            <template #prepend>{{ t('前往') }}</template>
            <template #append>{{ t('页') }}</template>

          </v-text-field>
        </v-col>


      </v-row>

    </div>

  </div>
</template>

<style lang="scss">
.v-infinite-scroll__side {
  display: none;
}
</style>

<style scoped lang='scss'>
.mx_block_library_box {
  margin: 0;
  font-size: var(--mx-font-size)
}
</style>
