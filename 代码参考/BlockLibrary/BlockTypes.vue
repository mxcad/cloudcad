<script setup lang="ts">
import { ref, watch } from 'vue';
import { BlockTypes } from './hooks/useBlockLibrary';
import post from "../../../../plugins/axios/appPostApi"
const { data } = defineProps<{
  data: BlockTypes
}>()

const addIndexs = ref<number[]>([])
const item = ref<BlockTypes[number]>(data[0])
watch(item, ()=> {
  addIndexs.value = item.value.list.filter(({isAdd})=> {
     return isAdd
  }).map((_, index)=> index)
})
const onclick = async ( node: BlockTypes[number]['list'][number])=> {
  const url = node.isAdd ? "/api/app/blocks/RemoveMyBlocks" : "api/app/blocks/AddMyBlocks"
  post(url, {
    blocksId: node.id
  }).then((res)=> {
    if(res.data.code === "success") {
      node.isAdd = !node.isAdd
    }
  })
}
</script>
<template>
   <v-card>
    <v-select :items="data" v-model="item" item-title="pname"  return-object></v-select>
    <div>
      <v-chip
          v-for="node in item.list"
          :prepend-icon="node.isAdd ? 'class:iconfont gou': void 0"
          variant="outlined"
          class="ma-1"
          size="x-small"
          @click="onclick(node)"
        >
          {{ node.name }}
        </v-chip>
      </div>
  </v-card>
</template>
