# 图库功能深度分析文档

> **文档版本**: v1.0  
> **创建日期**: 2026-01-14  
> **分析来源**: `代码参考/` 目录  
> **分析目标**: 深度理解 mxcad-app 图库功能实现，为 CloudCAD 项目集成做准备

---

## 目录

- [一、架构概览](#一架构概览)
- [二、后端接口实现](#二后端接口实现)
- [三、前端组件实现](#三前端组件实现)
- [四、核心逻辑实现](#四核心逻辑实现)
- [五、数据流转过程](#五数据流转过程)
- [六、关键设计模式](#六关键设计模式)
- [七、接口汇总](#七接口汇总)
- [八、文件路径规则](#八文件路径规则)
- [九、问题与建议](#九问题与建议)

---

## 一、架构概览

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端架构                                  │
├─────────────────────────────────────────────────────────────────┤
│  BlockLibrary.vue (主组件)                                       │
│       ├── Block.vue (图块卡片组件)                                 │
│       ├── BlockTypes.vue (分类组件)                                │
│       ├── useBlockLibrary.ts (核心逻辑 Hook)                       │
│       └── useBlockCollect.ts (收藏逻辑 Hook)                       │
├─────────────────────────────────────────────────────────────────┤
│                        后端接口                                    │
├─────────────────────────────────────────────────────────────────┤
│  gallery.js (图块库)              drawings.js (图纸库)             │
│       ├── POST /gallery/blocks/types      POST /gallery/drawings/types   │
│       └── POST /gallery/blocks/filelist    POST /gallery/drawings/filelist│
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 文件结构

```
代码参考/
├── drawings.js              # 图纸库后端接口
├── gallery.js               # 图块库后端接口
└── BlockLibrary/
    ├── BlockLibrary.vue     # 图库主组件
    ├── Block.vue            # 图块卡片组件
    ├── BlockTypes.vue       # 分类组件
    └── hooks/
        ├── useBlockLibrary.ts    # 核心逻辑 Hook
        └── useBlockCollect.ts    # 收藏逻辑 Hook
```

---

## 二、后端接口实现

### 2.1 图纸库接口 (drawings.js)

#### 接口 1: 获取分类列表

**路由**: `POST /gallery/drawings/types`

**入参**: 无

**出参**:
```json
{
  "code": "success",
  "result": {
    "allblocks": [
      {
        "id": 1,
        "pid": 0,
        "name": "建筑",
        "pname": "建筑",
        "status": 1
      }
    ]
  }
}
```

**SQL 查询**:
```sql
SELECT a.*, b.name AS pname 
FROM drawings_type a 
JOIN drawings_type b ON a.pid = b.id 
WHERE a.status = 1 AND a.pid != 0
```

**数据说明**:
- `id`: 分类 ID
- `pid`: 父分类 ID（0 表示一级分类）
- `name`: 分类名称
- `pname`: 父分类名称
- `status`: 状态（1=启用，0=禁用）

---

#### 接口 2: 获取图纸列表

**路由**: `POST /gallery/drawings/filelist`

**入参**:
```json
{
  "keywords": "箭头",      // 搜索关键字（可选）
  "firstType": 1,          // 二级分类 ID（0=全部）
  "pageIndex": 0,          // 页码（从 0 开始）
  "pageSize": 50           // 每页数量（默认 50）
}
```

**出参**:
```json
{
  "sharedwgs": [
    {
      "uuid": "abc123",
      "filename": "箭头_1.dwg",
      "firstType": 1,
      "secondType": 2,
      "filehash": "sha256...",
      "type": "建筑",
      "lookNum": 100,
      "likeNum": 50,
      "collect": false
    }
  ],
  "page": {
    "index": 0,
    "size": 50,
    "count": 150,
    "max": 3,
    "up": false,
    "down": true
  }
}
```

**SQL 查询 - 获取列表**:
```sql
SELECT a.uuid, a.filename, a.firstType, a.secondType, a.filehash, b.name as type 
FROM drawings_gallery a 
LEFT JOIN drawings_type b ON a.secondType = b.id 
WHERE 1=1 
  AND a.firstType = 1 
  AND a.filename LIKE '%箭头%' 
ORDER BY a.createTime DESC 
LIMIT 0, 50
```

**SQL 查询 - 获取总数**:
```sql
SELECT count(1) c 
FROM drawings_gallery 
WHERE 1=1 
  AND firstType = 1 
  AND filename LIKE '%箭头%'
```

**SQL 查询 - 获取统计信息**:
```sql
SELECT * 
FROM drawings_file_info 
WHERE fileuuid IN("uuid1", "uuid2", ...)
```

**数据说明**:
- `uuid`: 图纸 UUID
- `filename`: 文件名
- `firstType`: 一级分类 ID
- `secondType`: 二级分类 ID
- `filehash`: 文件 SHA-256 哈希值
- `type`: 分类名称（JOIN 获取）
- `lookNum`: 浏览次数
- `likeNum`: 收藏次数
- `collect`: 是否已收藏

**分页说明**:
- `index`: 当前页码
- `size`: 每页数量
- `count`: 总记录数
- `max`: 总页数
- `up`: 是否有上一页
- `down`: 是否有下一页

---

### 2.2 图块库接口 (gallery.js)

图块库接口与图纸库接口完全一致，仅数据表不同：

| 接口 | 图块库 | 图纸库 |
|------|--------|--------|
| 分类列表 | `/gallery/blocks/types` | `/gallery/drawings/types` |
| 图块列表 | `/gallery/blocks/filelist` | `/gallery/drawings/filelist` |
| 数据表 | `blocks_gallery`, `blocks_type`, `blocks_file_info` | `drawings_gallery`, `drawings_type`, `drawings_file_info` |

---

## 三、前端组件实现

### 3.1 BlockLibrary.vue (主组件)

**文件路径**: `代码参考/BlockLibrary/BlockLibrary.vue`

#### 核心功能

##### 1. 图库类型切换

```typescript
const galleryTypes = [
  { title: "图纸库", value: GalleryType.Drawings },
  { title: "图块库", value: GalleryType.Blocks }
]
```

**切换逻辑**:
```typescript
watch(galleryType, async (val, oldVal) => {
  if (val === oldVal) return
  getBlockTypesData()  // 重新获取分类
  if (typeId.value !== -1) {
    typeId.value = -1
  } else {
    empty()  // 清空数据
    blockingAutomaticUpdates()  // 阻塞自动更新
    processResult("end", await getBlocksData(), () => { })
  }
})
```

##### 2. 搜索功能

```typescript
const searchKeyword = ref("")

const onSearch = async () => {
  empty()  // 清空数据
  blockingAutomaticUpdates()  // 阻塞自动更新
  processResult("end", await getBlocksData(), () => { })
}
```

##### 3. 单击/双击处理

```typescript
const onClick = (block: BlockData) => {
  const baseUrl = getBaseUrl()
  
  // 图块库：单击插入
  if (galleryType.value === GalleryType.Blocks) {
    callCommand("Mx_Insert", {
      filePath: `${baseUrl}/blocks/${block.secondType}/${block.firstType}/${block.filehash}.mxweb`,
      name: block.filename,
      hash: block.filehash,
      isBlockLibrary: true
    })
  }
  // 图纸库：单击提示双击
  else if (galleryType.value === GalleryType.Drawings) {
    useMessage().info("请双击打开图纸")
  }
}

const onDblclick = async (block: BlockData) => {
  const baseUrl = getBaseUrl()
  
  // 图纸库：双击打开
  if (galleryType.value === GalleryType.Drawings) {
    MxFun.sendStringToExecute("_openMxweb", `${baseUrl}/drawings/${block.secondType}/${block.firstType}/${block.filehash}.mxweb`)
    setFileName(block.filename)
  }
}
```

##### 4. 收藏功能

```typescript
const onCollection = async (block: BlockData) => {
  if (await collection(block)) {
    const index = collectionList.value.indexOf(block)
    collectionList.value.splice(index, 1)
    
    // 更新分类列表
    if (collectionList.value.length === 0 && collectionTypes.value) {
      collectionTypes.value = collectionTypes.value.filter(item => item.id !== collectionTypeId.value)
      if (collectionTypes.value[0]) {
        collectionTypeId.value = collectionTypes.value[0].id
      } else {
        collectionTypeId.value = -1
      }
    }
  }
}
```

#### 响应式布局

```typescript
const isWidescreenMode = ref<boolean | undefined>(false)
```

**宽屏模式** (>450px):
```vue
<template v-if="isWidescreenMode">
  <v-chip-group v-model="blockType">
    <v-chip v-for="item in blockTypes" :value="item">
      {{ t(item.pname) }}
    </v-chip>
  </v-chip-group>
</template>
```

**窄屏模式**:
```vue
<template v-else>
  <v-select :items="blockTypes" v-model="blockType" />
</template>
```

#### 无限滚动

```vue
<v-infinite-scroll 
  :height="`calc(${getRootContainer().clientHeight}px - ${(mainRect.top || 0) + (isWidescreenMode ? 300 : 244)}px)`"
  :mode="mode" 
  :key="updateKey" 
  side="both" 
  @load="requestBlockLibraryData">
  <div class="d-flex flex-wrap justify-space-around">
    <Block v-for="block in currentData" :data="block" />
  </div>
</v-infinite-scroll>
```

---

### 3.2 Block.vue (图块卡片组件)

**文件路径**: `代码参考/BlockLibrary/Block.vue`

#### 图片路径生成

```typescript
const imgSrc = computed(() => {
  const baseUrl = getBaseUrl()
  let typeDir = ""
  
  if (type === GalleryType.Blocks) {
    typeDir = "blocks"
  } else if (type === GalleryType.Drawings) {
    typeDir = "drawings"
  }
  
  return baseUrl + '/' + typeDir + '/' + data.secondType + '/' + data.firstType + '/' + data.filehash + '.jpg'
})
```

**示例路径**:
```
图块库: http://localhost:3000/blocks/2/1/sha256hash.jpg
图纸库: http://localhost:3000/drawings/2/1/sha256hash.jpg
```

#### 收藏按钮交互

```vue
<v-tooltip :text="data.collect ? t('取消收藏') : t('收藏')">
  <template v-slot:activator="{ props }">
    <v-btn 
      v-bind="props" 
      class="collection" 
      :icon="data.collect ? 'class:iconfont shoucang1' : 'class:iconfont shoucang'"
      @click.stop="emit('collection', data)">
    </v-btn>
  </template>
</v-tooltip>

<style scoped>
.collection {
  display: none;
  position: absolute;
  right: 10px;
  top: 10px;
}

.block:hover .collection {
  display: block;
}
</style>
```

---

### 3.3 BlockTypes.vue (分类组件)

**文件路径**: `代码参考/BlockLibrary/BlockTypes.vue`

#### 分类添加/移除

```typescript
const onclick = async (node: BlockTypes[number]['list'][number]) => {
  const url = node.isAdd ? "/api/app/blocks/RemoveMyBlocks" : "/api/app/blocks/AddMyBlocks"
  
  post(url, {
    blocksId: node.id
  }).then((res) => {
    if (res.data.code === "success") {
      node.isAdd = !node.isAdd
    }
  })
}
```

---

## 四、核心逻辑实现

### 4.1 useBlockLibrary.ts (核心逻辑 Hook)

**文件路径**: `代码参考/BlockLibrary/hooks/useBlockLibrary.ts`

#### 数据结构定义

```typescript
// 图库类型枚举
export enum GalleryType {
  Drawings = 0,  // 图纸库
  Blocks = 1     // 图块库
}

// 图块数据接口
export interface BlockData {
  uuid: string,
  filename: string,
  firstType: number,    // 一级分类 ID
  secondType: number,   // 二级分类 ID
  filehash: string,
  collect: boolean,
  type: string
}

// 分类接口
export interface BlockType {
  id: number,
  pid: number,
  name: string,
  status: number,
  pname: string
}

// 分类分组接口
export type BlockTypes = {
  pname: string;
  pid: number;
  list: (BlockType & { isAdd?: boolean })[]
}[]
```

#### 分类系统实现

```typescript
// 一级分类
const blockTypes = ref<BlockTypes>()
const blockType = ref<BlockTypes[number]>()

// 二级分类
const typeId = ref<undefined | number>(-1)
const secondaryBlockTypes = computed(() => {
  return blockType.value?.list || []
})

// 三级分类（基于文件名解析）
const threeLevelClassifiedType = ref("全部")
const threeLevelClassifiedTypes = ref(["全部", ...Object.keys(threeLevelClassifiedData)])
```

#### 分类数据转换逻辑

```typescript
getBlockTypesData = () => {
  $api.post(baseUrl + `/gallery/${getApiName()}/types`).then((res) => {
    if (res.data.code === "success") {
      const { allblocks = [] } = res.data.result || {}
      
      // 创建"全部"分类
      blockType.value = {
        pname: "全部",
        pid: -1,
        list: [
          { "id": -1, "name": "全部", "pid": -1, "pname": "全部", "status": 0 },
          ...allblocks
        ]
      }
      blockTypes.value = [blockType.value]

      // 按父分类分组
      (allblocks as BlockType[]).forEach((type) => {
        const item = blockTypes.value?.find(({ pid }) => pid === type.pid)
        if (item) {
          item.list.push(type)
        } else {
          blockTypes.value?.push({ 
            pname: type.pname, 
            pid: type.pid, 
            list: [type] 
          })
        }
      })
    }
  })
}
```

**数据转换示例**:

```
后端返回 (allblocks):
[
  { id: 1, pid: 0, name: "建筑", pname: "建筑" },
  { id: 2, pid: 0, name: "机械", pname: "机械" },
  { id: 3, pid: 1, name: "门", pname: "建筑" },
  { id: 4, pid: 1, name: "窗", pname: "建筑" },
  { id: 5, pid: 2, name: "齿轮", pname: "机械" }
]

前端转换 (blockTypes):
[
  {
    pname: "全部",
    pid: -1,
    list: [
      { id: -1, name: "全部", pid: -1, pname: "全部" },
      { id: 1, pid: 0, name: "建筑", pname: "建筑" },
      { id: 2, pid: 0, name: "机械", pname: "机械" },
      { id: 3, pid: 1, name: "门", pname: "建筑" },
      { id: 4, pid: 1, name: "窗", pname: "建筑" },
      { id: 5, pid: 2, name: "齿轮", pname: "机械" }
    ]
  },
  {
    pname: "建筑",
    pid: 0,
    list: [
      { id: 1, pid: 0, name: "建筑", pname: "建筑" },
      { id: 3, pid: 1, name: "门", pname: "建筑" },
      { id: 4, pid: 1, name: "窗", pname: "建筑" }
    ]
  },
  {
    pname: "机械",
    pid: 0,
    list: [
      { id: 2, pid: 0, name: "机械", pname: "机械" },
      { id: 5, pid: 2, name: "齿轮", pname: "机械" }
    ]
  }
]
```

#### 三级分类解析逻辑

**文件名规则**: `分类_名称.dwg`

**解析逻辑**:
```typescript
const processResult = (side: InfiniteScrollSide, res: BlockDataResponse, done) => {
  if (res.status === 200) {
    const { sharedwgs, page } = res.data
    const arr = sharedwgs.map(node => {
      if (node.filename) {
        node.filename = node.filename.replace(/\.[^/.]+$/, '')  // 移除扩展名
      }
      return node
    })
    
    // 拼接数据
    blocksData.value = side === "end" 
      ? [...blocksData.value, ...arr] 
      : [...arr, ...blocksData.value]
    
    // 三级分类解析
    threeLevelClassifiedData = {}
    blocksData.value.forEach((obj) => {
      const index = obj.filename.indexOf("_")
      if (index >= 0) {
        const parts = obj.filename.split("_")
        const category = parts[0]  // 分类
        const name = parts[1]      // 名称
        
        if (!threeLevelClassifiedData[category]) {
          threeLevelClassifiedData[category] = []
        }
        threeLevelClassifiedData[category].push({
          ...obj,
          filename: name  // 显示时只显示名称部分
        })
      }
    })
    
    // 更新三级分类列表
    threeLevelClassifiedTypes.value = ["全部", ...Object.keys(threeLevelClassifiedData)]
  }
}
```

**解析示例**:

```
原始文件名:
- "门_单开门.dwg"
- "门_双开门.dwg"
- "窗_平开窗.dwg"
- "窗_推拉窗.dwg"

解析后 (threeLevelClassifiedData):
{
  "门": [
    { filename: "单开门", ... },
    { filename: "双开门", ... }
  ],
  "窗": [
    { filename: "平开窗", ... },
    { filename: "推拉窗", ... }
  ]
}

三级分类列表 (threeLevelClassifiedTypes):
["全部", "门", "窗"]
```

#### 分页逻辑

```typescript
const pageIndex = ref(0)        // 当前页码
const pageSize = 50             // 每页数量
const countPageSize = ref(15)   // 总页数

let upIndex = 0    // 向上记录索引
let downIndex = 0  // 向下记录索引

// 清空数据
const empty = () => {
  downIndex = upIndex = pageIndex.value = 0
  blocksData.value = []
  threeLevelClassifiedType.value = "全部"
  updateKey.value++
}

// 更新页码
const updatePageIndex = async () => {
  downIndex = upIndex = pageIndex.value
  updateKey.value++
  blocksData.value = []
  threeLevelClassifiedType.value = "全部"
}
```

#### 分页数据缓存

```typescript
const dataMap = new Map()

const getBlocksData = async (index = pageIndex.value - 1) => {
  const firstType = typeId.value === -1 ? void 0 : typeId.value
  
  // 生成缓存键
  const key = galleryType.value.toString() + 
              (blockType.value?.pid?.toString() || "") + 
              typeId.value?.toString() + 
              threeLevelClassifiedType.value.toString() + 
              index.toString() + 
              pageSize.toString() + 
              searchKeyword.value + 
              firstType
  
  // 检查缓存
  if (dataMap.has(key)) {
    return dataMap.get(key)
  }
  
  // 请求数据
  const res = await $api.post(baseUrl + `/gallery/${getApiName()}/filelist`, {
    pageIndex: index,
    pageSize,
    keywords: searchKeyword.value,
    firstType
  })
  
  // 缓存结果
  dataMap.set(key, res)
  return res
}
```

#### 无限滚动实现

```typescript
const requestBlockLibraryData = async ({ side, done }) => {
  try {
    // 向下滚动
    if (side === "end") {
      if (downIndex > countPageSize.value) return done("empty")
      pageIndex.value = downIndex++
    }
    
    // 向上滚动
    if (side === "start") {
      if (upIndex < 1) return done("empty")
      pageIndex.value = upIndex--
    }
    
    await nextTick()
    processResult(side, await getBlocksData(), done)
  } catch (error) {
    done("error")
  }
}
```

#### 自动更新控制

```typescript
const mode = ref<"manual" | "intersect">("intersect")

// 阻塞自动更新
const blockingAutomaticUpdates = () => {
  mode.value = "manual"  // 切换到手动模式
  nextTick(() => {
    mode.value = "intersect"  // 恢复自动模式
  })
}
```

**使用场景**:
```typescript
// 搜索时阻塞自动更新
const onSearch = async () => {
  empty()
  blockingAutomaticUpdates()  // 防止无限滚动自动触发
  processResult("end", await getBlocksData(), () => { })
}

// 切换分类时阻塞自动更新
watch(blockType, async () => {
  empty()
  blockingAutomaticUpdates()
  typeId.value = blockType.value?.list[0].id || -1
})
```

---

### 4.2 useBlockCollect.ts (收藏逻辑 Hook)

**文件路径**: `代码参考/BlockLibrary/hooks/useBlockCollect.ts`

#### 收藏功能实现

```typescript
const collection = async (block: BlockData) => {
  const res = await post("/api/app/blocks/CollectBlock", {
    // fileuuid: block.fileid
  })
  
  if (res.data.code === "success") {
    block.collect = !block.collect  // 切换收藏状态
    return true
  } else {
    useMessage().error(res.data.msg)
  }
}
```

#### 获取收藏分类

```typescript
const getMyCollectTypes = async () => {
  const res = await post("/api/app/blocks/MyCollect")
  
  if (res.data.code === "success") {
    collectionTypes.value = res.data.result.filter((item: any) => typeof item.id === 'number')
    if (collectionTypes.value && collectionTypes.value[0]) {
      collectionTypeId.value = collectionTypes.value[0].id
    }
  }
}
```

#### 获取收藏列表

```typescript
const getCollectionList = ({ side, done }) => {
  post("/api/app/blocks/CollectList", {
    typeId: collectionTypeId.value
  }).then((res) => {
    if (res.data.code === "success") {
      collectionList.value = [...collectionList.value, ...res.data.result.blocksList]
      pageIndex = pageIndex + 1
    } else {
      done("error")
    }
  }, () => done("error"))
}
```

#### 分类切换监听

```typescript
watch(collectionTypeId, () => {
  pageIndex = 0
  collectionList.value = []
  getCollectionList({
    side: 'end',
    done: () => { }
  })
})
```

---

## 五、数据流转过程

### 5.1 初始化流程

```
用户打开图库
  ↓
watch(isShowBlockLibrary) 触发
  ↓
getBlockTypesData() 获取分类数据
  ↓
转换分类数据（按父分类分组）
  ↓
blockTypes.value 更新
  ↓
typeId.value 设置为第一个分类
  ↓
watch(typeId) 触发
  ↓
empty() 清空数据
  ↓
getBlocksData() 获取第一页数据
  ↓
processResult() 处理结果
  ↓
blocksData.value 更新
  ↓
threeLevelClassifiedData 解析三级分类
  ↓
currentData 计算当前显示数据
  ↓
渲染 Block 组件列表
```

### 5.2 搜索流程

```
用户输入关键字
  ↓
v-model 更新 searchKeyword
  ↓
用户点击搜索/回车
  ↓
onSearch() 触发
  ↓
empty() 清空数据
  ↓
blockingAutomaticUpdates() 阻塞自动更新
  ↓
getBlocksData() 请求数据（带关键字参数）
  ↓
后端执行 LIKE '%keywords%' 查询
  ↓
返回匹配结果
  ↓
processResult() 处理结果
  ↓
更新 blocksData.value
  ↓
重新解析三级分类
  ↓
更新 currentData
  ↓
渲染结果
```

### 5.3 分类切换流程

```
用户选择一级分类
  ↓
watch(blockType) 触发
  ↓
empty() 清空数据
  ↓
blockingAutomaticUpdates() 阻塞自动更新
  ↓
typeId.value 设置为该分类的第一个子分类
  ↓
watch(typeId) 触发
  ↓
empty() 清空数据
  ↓
blockingAutomaticUpdates() 阻塞自动更新
  ↓
getBlocksData() 请求数据（带 firstType 参数）
  ↓
processResult() 处理结果
  ↓
更新 blocksData.value
  ↓
重新解析三级分类
  ↓
更新 currentData
  ↓
渲染结果
```

### 5.4 无限滚动流程

```
用户滚动到底部
  ↓
v-infinite-scroll @load 触发
  ↓
requestBlockLibraryData({ side: "end", done })
  ↓
检查 downIndex < countPageSize
  ↓
pageIndex.value = downIndex++
  ↓
getBlocksData(pageIndex) 获取下一页
  ↓
检查缓存（dataMap）
  ↓
processResult("end", res, done)
  ↓
blocksData.value = [...blocksData.value, ...newData]
  ↓
重新解析三级分类
  ↓
done("ok") 继续监听滚动
```

---

## 六、关键设计模式

### 6.1 数据缓存策略

```typescript
const dataMap = new Map()

const key = galleryType.value.toString() + 
            (blockType.value?.pid?.toString() || "") + 
            typeId.value?.toString() + 
            threeLevelClassifiedType.value.toString() + 
            index.toString() + 
            pageSize.toString() + 
            searchKeyword.value + 
            firstType

if (dataMap.has(key)) {
  return dataMap.get(key)  // 返回缓存
}

const res = await $api.post(...)
dataMap.set(key, res)  // 缓存结果
return res
```

**优势**:
- 避免重复请求相同数据
- 提升用户体验
- 减少服务器压力

### 6.2 三级分类动态解析

```typescript
blocksData.value.forEach((obj) => {
  const index = obj.filename.indexOf("_")
  if (index >= 0) {
    const parts = obj.filename.split("_")
    const category = parts[0]  // 分类
    const name = parts[1]      // 名称
    
    if (!threeLevelClassifiedData[category]) {
      threeLevelClassifiedData[category] = []
    }
    threeLevelClassifiedData[category].push({
      ...obj,
      filename: name  // 显示时只显示名称
    })
  }
})
```

**优势**:
- 无需后端维护三级分类表
- 基于文件名规则自动分类
- 灵活扩展

### 6.3 双向无限滚动

```typescript
// 向下滚动
if (side === "end") {
  if (downIndex > countPageSize.value) return done("empty")
  pageIndex.value = downIndex++
  blocksData.value = [...blocksData.value, ...newData]
}

// 向上滚动
if (side === "start") {
  if (upIndex < 1) return done("empty")
  pageIndex.value = upIndex--
  blocksData.value = [...newData, ...blocksData.value]
}
```

**优势**:
- 支持双向滚动
- 保持滚动位置
- 平滑加载数据

---

## 七、接口汇总

| 接口 | 方法 | 路径 | 功能 |
|------|------|------|------|
| 获取图块分类 | POST | `/gallery/blocks/types` | 获取图块库分类列表 |
| 获取图块列表 | POST | `/gallery/blocks/filelist` | 获取图块库分页数据 |
| 获取图纸分类 | POST | `/gallery/drawings/types` | 获取图纸库分类列表 |
| 获取图纸列表 | POST | `/gallery/drawings/filelist` | 获取图纸库分页数据 |
| 收藏图块 | POST | `/api/app/blocks/CollectBlock` | 收藏/取消收藏图块 |
| 获取收藏分类 | POST | `/api/app/blocks/MyCollect` | 获取收藏分类列表 |
| 获取收藏列表 | POST | `/api/app/blocks/CollectList` | 获取收藏图块列表 |
| 添加我的图块 | POST | `/api/app/blocks/AddMyBlocks` | 添加图块到我的图库 |
| 移除我的图块 | POST | `/api/app/blocks/RemoveMyBlocks` | 从我的图库移除图块 |

---

## 八、文件路径规则

### 8.1 图片路径

**格式**: `{baseUrl}/{typeDir}/{secondType}/{firstType}/{filehash}.jpg`

**示例**:
```
图块库: http://localhost:3000/blocks/2/1/sha256hash.jpg
图纸库: http://localhost:3000/drawings/2/1/sha256hash.jpg
```

**路径组成**:
- `baseUrl`: 基础 URL
- `typeDir`: "blocks" 或 "drawings"
- `secondType`: 二级分类 ID
- `firstType`: 一级分类 ID
- `filehash`: 文件 SHA-256 哈希值

### 8.2 MXWEB 文件路径

**格式**: `{baseUrl}/blocks/{secondType}/{firstType}/{filehash}.mxweb`

**示例**:
```
图块库: http://localhost:3000/blocks/2/1/sha256hash.mxweb
图纸库: http://localhost:3000/drawings/2/1/sha256hash.mxweb
```

**用途**: MxCAD 编辑器打开图纸

### 8.3 路径规则总结

| 文件类型 | 路径格式 | 示例 |
|----------|----------|------|
| 图片 (JPG) | `{baseUrl}/{typeDir}/{secondType}/{firstType}/{filehash}.jpg` | `http://localhost:3000/blocks/2/1/sha256hash.jpg` |
| MXWEB 文件 | `{baseUrl}/{typeDir}/{secondType}/{firstType}/{filehash}.mxweb` | `http://localhost:3000/blocks/2/1/sha256hash.mxweb` |

---

## 九、问题与建议

### 9.1 发现的问题

#### 1. SQL 注入风险

**问题描述**: 后端接口使用字符串拼接 SQL，存在 SQL 注入风险

**问题代码**:
```javascript
// gallery.js:33
file_gallery_where1 += ` and a.filename like concat('%','${keywords}','%') `
```

**建议**: 使用参数化查询

#### 2. 类型不安全

**问题描述**: TypeScript 代码中使用了 `any` 类型，违反了项目规范

**问题代码**:
```typescript
// useBlockCollect.ts:32
collectionTypes.value = res.data.result.filter((item: any) => typeof item.id === 'number')
```

**建议**: 使用明确的类型定义

#### 3. 缓存未清理

**问题描述**: `dataMap` 缓存没有清理机制，可能导致内存泄漏

**建议**: 实现缓存过期和清理机制

#### 4. 硬编码路径

**问题描述**: 文件路径规则硬编码在前端，不利于维护

**建议**: 将路径规则提取到配置文件

#### 5. 缺少错误处理

**问题描述**: 部分接口调用缺少完整的错误处理

**建议**: 添加全局错误处理和重试机制

### 9.2 改进建议

1. **使用参数化查询**: 防止 SQL 注入
2. **移除 any 类型**: 使用明确的类型定义
3. **添加缓存清理**: 实现缓存过期和清理机制
4. **配置化路径规则**: 将路径规则提取到配置文件
5. **完善错误处理**: 添加全局错误处理和重试机制
6. **添加单元测试**: 提高代码质量
7. **优化性能**: 减少不必要的重渲染
8. **国际化支持**: 添加多语言支持

---

## 十、集成建议

### 10.1 后端集成

1. **创建 GalleryModule**: 实现 NestJS 模块
2. **实现分类管理**: 基于 Asset.category 字段
3. **实现图纸列表查询**: 支持分页、搜索、过滤
4. **绕过全局响应包装**: 直接返回原始格式
5. **实现文件路径映射**: 映射到现有文件系统

### 10.2 前端集成

1. **迁移组件**: 将 Vue 3 组件迁移到 React
2. **适配路由**: 集成到现有路由系统
3. **适配状态管理**: 使用 React Context 或 Zustand
4. **适配 UI 组件**: 使用 Radix UI 和 Tailwind CSS
5. **适配 API 调用**: 使用现有的 API Service

### 10.3 数据映射

| 原始字段 | Asset 模型字段 | 说明 |
|----------|---------------|------|
| uuid | id | 主键 |
| filename | name | 文件名 |
| firstType | 需要映射 | 一级分类 ID |
| secondType | 需要映射 | 二级分类 ID |
| filehash | 从 path 提取 | 文件哈希值 |
| type | category | 分类名称 |
| lookNum | 需要新增 | 浏览次数 |
| likeNum | 需要新增 | 收藏次数 |
| collect | 需要新增 | 是否已收藏 |

---

## 附录

### A. 相关文件清单

```
代码参考/
├── drawings.js              # 图纸库后端接口
├── gallery.js               # 图块库后端接口
└── BlockLibrary/
    ├── BlockLibrary.vue     # 图库主组件
    ├── Block.vue            # 图块卡片组件
    ├── BlockTypes.vue       # 分类组件
    └── hooks/
        ├── useBlockLibrary.ts    # 核心逻辑 Hook
        └── useBlockCollect.ts    # 收藏逻辑 Hook
```

### B. 技术栈

- **前端**: Vue 3, TypeScript, Vuetify 3
- **后端**: Node.js, Express, MySQL
- **数据库**: MySQL

### C. 参考资料

- [MxCAD 官方文档](https://www.mxdraw.com/)
- [Vue 3 官方文档](https://vuejs.org/)
- [Vuetify 3 官方文档](https://vuetifyjs.com/)

---

**文档完成时间**: 2026-01-14  
**分析文件数**: 7 个  
**代码行数**: 约 1500 行  
**文档版本**: v1.0