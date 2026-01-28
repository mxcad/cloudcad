<script setup lang="ts">
import { getBaseUrl } from "@/config/serverConfig";
import { BlockData, GalleryType } from "./hooks/useBlockLibrary"
import { computed } from "vue"
const { data, width, height = 150, isCollect, type = GalleryType.Blocks } = defineProps<{
  data: BlockData,
  width?: number,
  height?: number
  isCollect?: boolean,
  type?: GalleryType
}>()
const emit =  defineEmits<{
  (on: "collection", data: BlockData): void
}>()
const imgSrc = computed(()=> {
  const baseUrl  = getBaseUrl()
  let typeDir = ""
  if(type === GalleryType.Blocks) {
    typeDir = "blocks"
  }else if(type === GalleryType.Drawings) {
    typeDir = "drawings"
  }
  return baseUrl + '/'+ typeDir +'/'+ data.secondType + '/' + data.firstType + '/' + data.filehash + '.jpg'
})
</script>

<template>
  <v-card hover variant="tonal" class="pa-2 my-2 block mx-1" :height="height">
    <v-img  :width="(width || 100)" cover :src="imgSrc" crossorigin="anonymous">
      <template v-slot:placeholder>
        <div class="d-flex align-center justify-center fill-height">
          <v-progress-circular color="grey-lighten-4" indeterminate></v-progress-circular>
        </div>
      </template>
    </v-img>
    <v-tooltip :text="data.collect ? t('取消收藏') : t('收藏')" v-if="isCollect">
      <template v-slot:activator="{ props }">
        <v-btn v-bind="props" class="collection" :icon="data.collect ? 'class:iconfont shoucang1' : 'class:iconfont shoucang'"
          size="22px"
          @click.stop="emit('collection', data)" variant="tonal"></v-btn>
      </template>
    </v-tooltip>

    <span class="mt-2 mx-font-size d-inline-block text-truncate" :style="{
      width: (width || 100) + 'px'
    }"> {{ data.filename }}</span>
  </v-card>
</template>


<style lang="scss" scoped>
.mx-font-size {
  font-size: var(--mx-font-size);
}

.block {
  position: relative;;
}

.collection {
  display: none;
  position: absolute;
  right: 10px;
  top: 10px;
  font-size: 24px;
}

.block:hover .collection {
  display: block;
}
</style>
