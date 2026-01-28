///////////////////////////////////////////////////////////////////////////////
//版权所有（C）2002-2022，成都梦想凯德科技有限公司。
//本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
//此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { watch, ref, computed, nextTick } from "vue"
import $api from "@/plugins/axios"
import { getBaseUrl } from "@/config/serverConfig"
import { browserCacheRef } from "@/utils/common/ref/browserCacheRef"
import { onLoadComplete } from "@/view/hooks/useMxCad"
import { synchronizesPersistentResponsiveData } from "@/plugins/MxElectronApi/synchronizesPersistentResponsiveData"

export const isShowBlockLibrary = browserCacheRef(false, "Mx_isShowBlockLibrary")
synchronizesPersistentResponsiveData(isShowBlockLibrary, "Mx_Electron_Update_isShowBlockLibrary")
/** 图库类型 */
export enum GalleryType {
  /** 图纸库 */
  Drawings,
  /** 个人图库 */
  Blocks
}
/** 图块数据 */
export interface BlockData {
  uuid: string,
  filename: string,
  firstType: number,
  secondType: number,
  filehash: string,
  collect: boolean,
  type: string
}

/** 请求图块库数据参数 */
interface BlockDataRequestParameter {
  keywords?: string,
  // 分类类型
  firstType?: number,
  pageIndex?: number,
  pageSize?: number,
  showtype?: number
}

/** 请求图块数据的响应 response */
interface BlockDataResponse {
  data: {
    sharedwgs: BlockData[],
    page: {
      count: number,
      index: number,
      size: number,
      max: number,
      down: boolean,
      up: boolean
    }
  },
  status: number
}
export type InfiniteScrollSide = 'start' | 'end' | 'both';
export type InfiniteScrollStatus = 'ok' | 'empty' | 'loading' | 'error';

export interface BlockType {
  id: number;
  pid: number;
  name: string;
  status: number;
  pname: string
}
export type BlockTypes = { pname: string; pid: number; list: (BlockType & { isAdd?: boolean; })[] }[]
// 图库类型
export const galleryType = browserCacheRef(GalleryType.Blocks, "Mx_useBlockLibrary_galleryType")
synchronizesPersistentResponsiveData(galleryType, "Mx_Electron_Update_useBlockLibrary_galleryType")
const galleryTypes = [{
  title: "图纸库",
  value: GalleryType.Drawings
}, {
  title: "图块库",
  value: GalleryType.Blocks,
}]

export const useBlockLibrary = () => {

  const pageIndex =  ref(0)

  // 图块库数据
  const blocksData = ref<BlockData[]>([])

  // 每页数量
  const pageSize = 50

  // 总页数
  const countPageSize = ref(15)

  // 图库搜索的关键字
  const searchKeyword = ref("")

  // mode 自动触发还是手动触发
  const mode = ref<"manual" | "intersect">("intersect")
  // 阻塞自动更新
  const blockingAutomaticUpdates = ()=> {
    mode.value = "manual"
    nextTick(()=> {
      mode.value = "intersect"
    })
  }

  // 图库API名称
  const getApiName = () => {
    if (galleryType.value === GalleryType.Blocks) return "blocks"
    if (galleryType.value === GalleryType.Drawings) return "drawings"
    return ""
  }
  // 一级分类
  const blockTypes = ref<BlockTypes>()
  const blockType = ref<BlockTypes[number]>()


  // 二级分类
  const typeId = ref<undefined | number>(-1)
  const secondaryBlockTypes = computed(() => {
    return blockType.value?.list || []
  })
  // 强制刷新无线滚动组件
  const updateKey = ref(0)
   // 向上记录索引页数
   let upIndex = 0
   // 向下记录索引页数
   let downIndex = 0
  // 清空数据
  const empty = () => {
    downIndex = upIndex = pageIndex.value = 0
    blocksData.value = []
    threeLevelClassifiedType.value = "全部"
    updateKey.value++
  }

  // 下标页码更新
  const updatePageIndex = async ()=> {
    downIndex = upIndex = pageIndex.value
    updateKey.value++
    blocksData.value = []
    threeLevelClassifiedType.value = "全部"
  }
  watch(blockType, async () => {
    empty()
    blockingAutomaticUpdates()
    typeId.value = blockType.value?.list[0].id || -1
  })
  // 改变二级分类触发
  watch(typeId, async () => {
    empty()
    blockingAutomaticUpdates()
    processResult("end", await getBlocksData(), () => { })
  })

  // 获取图库分页数据
  const dataMap = new Map()
  const getBlocksData = async (index = pageIndex.value - 1) => {
    // 确保 index 不小于 0
    const safeIndex = Math.max(0, index)
    const baseUrl = getBaseUrl();
    // blocks || drawings
    const firstType = typeId.value === -1 ? void 0 : typeId.value
    const key =  galleryType.value.toString() + (blockType.value?.pid?.toString() || "") + typeId.value?.toString() + threeLevelClassifiedType.value.toString() + safeIndex.toString() + pageSize.toString() + searchKeyword.value + firstType
    if(dataMap.has(key)) {
      return dataMap.get(key)
    }
    const res = await $api.post<void, BlockDataResponse, BlockDataRequestParameter>(baseUrl + `/gallery/${getApiName()}/filelist`, {
      pageIndex: safeIndex,
      pageSize,
      keywords: searchKeyword.value,
      firstType
    })
    dataMap.set(key, res)
    return res
  }

  // 三级分类
  let threeLevelClassifiedData: {
    [type: string]: BlockData[]
  } = {}
  const threeLevelClassifiedType = ref("全部")
  const threeLevelClassifiedTypes = ref(["全部", ...Object.keys(threeLevelClassifiedData)])

  // 当前数据
  const currentData = computed(() => {
    if (threeLevelClassifiedType.value === "全部") return blocksData.value
    return threeLevelClassifiedData[threeLevelClassifiedType.value] || []
  })


  // 处理分页请求后的结果
  const processResult = (side: InfiniteScrollSide = "end", res: BlockDataResponse, done: (status: InfiniteScrollStatus) => void) => {
    if (res.status === 200) {
      const { data } = res
      const { sharedwgs, page } = data || {}
      countPageSize.value = page.max
      if (sharedwgs) {
        const arr = sharedwgs.map(node => {
          if (node.filename) node.filename = node.filename.replace(/\.[^/.]+$/, '')
          return node
        })
        blocksData.value = side === "end" ?  [...blocksData.value, ...arr] : [...arr,...blocksData.value]
        threeLevelClassifiedData = {}
        blocksData.value.forEach((obj) => {
          const index = obj.filename.indexOf("_")
          if (index >= 0) {
            const parts = obj.filename.split("_");
            const category = parts[0]; // 分类
            const name = parts[1]; // 名称
            if (!threeLevelClassifiedData[category]) {
              threeLevelClassifiedData[category] = []
            }
            threeLevelClassifiedData[category].push({
              ...obj,
              filename: name
            })
          }
        })
        threeLevelClassifiedTypes.value = ["全部", ...Object.keys(threeLevelClassifiedData)]
        done("ok")
      } else {
        done("error")
      }
    } else {
      done("error")
    }
  }

  // 图库分类触发
  watch(galleryType, async (val, oldVal) => {
    if (val === oldVal) return
    getBlockTypesData()
    if (typeId.value !== -1) {
      typeId.value = -1
    } else {
      empty()
      blockingAutomaticUpdates()
      processResult("end", await getBlocksData(), () => { })
    }
  })

  // 自动请求图块库数
  const requestBlockLibraryData = async ({ side, done }: {
    side: InfiniteScrollSide;
    done: (status: InfiniteScrollStatus) => void;
  }) => {
    try {
      if(side === "end") {
        if(downIndex > countPageSize.value) return done("empty")
        pageIndex.value = downIndex ++
      }
      if(side === "start") {
        if(upIndex < 1) return done("empty")
        pageIndex.value = upIndex --
      }
      await nextTick()
      processResult(side, await getBlocksData(), done)
    } catch (error) {
      done("error")
    }
  }

  // 搜索
  const onSearch = async () => {
    empty()
    blockingAutomaticUpdates()
    processResult("end", await getBlocksData(), () => { })
  }

  // 获取一二级分类
  const getBlockTypesData = () => {
    return new Promise<void>((resolve, reject) => {
      const baseUrl = getBaseUrl();
      $api.post(baseUrl + `/gallery/${getApiName()}/types`).then((res) => {
        if (res.data && res.data.code === "success" && res.data.result) {
          const { allblocks = [] } = res.data.result || {}
          blockType.value = { pname: "全部", pid: -1, list: [ { "id": -1, "name": "全部", "pid": -1, "pname": "全部", "status": 0 }, ...allblocks], }
          blockTypes.value = [blockType.value];

          (allblocks as BlockType[]).forEach((type) => {
            const item = blockTypes.value?.find(({ pid }) => pid === type.pid)
            if (item) {
              item.list.push(type)
            } else {
              blockTypes.value?.push({ pname: type.pname, pid: type.pid, list: [type] })
            }
          });
          resolve()
        } else {
          reject()
        }
      }, reject)
    })

  }
  // 初次加载时获取一次
  onLoadComplete(() => {
    isShowBlockLibrary.value && getBlockTypesData()
  })

  // 图库显示时触发
  watch(isShowBlockLibrary, (newVal, oldVal) => {
    // 为了加快启动速度，尽量减少启动时做的事，在需要的时候，再去访问块数据。
    if (newVal) {
      getBlockTypesData()
    }
  })


  return {
    galleryType,
    galleryTypes,
    searchKeyword,
    isShowBlockLibrary,
    blocksData,
    requestBlockLibraryData,
    onSearch,
    blockTypes,
    blockType,
    typeId,
    getBlockTypesData,
    secondaryBlockTypes,
    threeLevelClassifiedType,
    threeLevelClassifiedTypes,
    currentData,
    pageIndex,
    updatePageIndex,
    countPageSize,
    mode,
    updateKey
  }
}
