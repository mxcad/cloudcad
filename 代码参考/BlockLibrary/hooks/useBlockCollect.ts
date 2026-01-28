///////////////////////////////////////////////////////////////////////////////
//版权所有（C）2002-2022，成都梦想凯德科技有限公司。
//本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
//此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

// 收藏

import { ref, watch } from "vue"
import { BlockData, InfiniteScrollSide, InfiniteScrollStatus } from "./useBlockLibrary"
import { useMessage } from "@/view/Message/useMessage"
import post from "@/plugins/axios/appPostApi"
let pageIndex = 0
export const useBlockCollect = () => {

  const collectionList = ref<BlockData[]>([])
  const collectionTypes = ref<{ id: number, name: string, counts: number }[]>()
  const collectionTypeId = ref(-1)
  const collection = async (block: BlockData) => {
    const res = await post("/api/app/blocks/CollectBlock", {
      // fileuuid: block.fileid
    })
    if (res.data.code === "success") {
      block.collect = !block.collect
      return true
    } else {
      useMessage().error(res.data.msg)
    }

  }

  const getMyCollectTypes = async () => {
    const res = await post("/api/app/blocks/MyCollect")
    if (res.data.code === "success") {
      collectionTypes.value = res.data.result.filter((item: any) => typeof item.id === 'number')
      if (collectionTypes.value && collectionTypes.value[0]) {
        collectionTypeId.value = collectionTypes.value[0].id
      }
    }
  }
  watch(collectionTypeId, ()=> {
    pageIndex = 0
    collectionList.value = []
    getCollectionList({
      side: 'end',
      done: ()=> {}
    })
  })

  const requestCollectData = ()=> {
    getMyCollectTypes().then(()=> {
      getCollectionList({
        side: 'end',
        done: ()=> {}
      })
    })
  }

  const getCollectionList = ({ side, done }: {
    side: InfiniteScrollSide;
    done: (status: InfiniteScrollStatus) => void;
  }) => {
    post("/api/app/blocks/CollectList", {
      typeId: collectionTypeId.value
    }).then((res) => {
      if (res.data.code === "success") {
        collectionList.value = [...collectionList.value, ...res.data.result.blocksList]
        pageIndex = pageIndex + 1
      }else {
        done("error")
      }
    }, ()=> done("error"))
  }

  return {
    collectionList,
    collectionTypes,
    collectionTypeId,
    collection,
    requestCollectData
  }
}
