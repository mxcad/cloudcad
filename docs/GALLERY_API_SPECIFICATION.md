# 图库后端接口规范

> **文档版本**: v1.0  
> **创建日期**: 2026-01-14  
> **用途**: CloudCAD 项目图库功能后端接口实现参考

---

## 接口列表

### 图纸库接口

1. [获取分类列表](#1-获取分类列表图纸库) - `POST /gallery/drawings/types`
2. [获取图纸列表](#2-获取图纸列表图纸库) - `POST /gallery/drawings/filelist`

### 图块库接口

1. [获取分类列表](#1-获取分类列表图块库) - `POST /gallery/blocks/types`
2. [获取图块列表](#2-获取图块列表图块库) - `POST /gallery/blocks/filelist`

---

## 图纸库接口

### 1. 获取分类列表（图纸库）

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
      },
      {
        "id": 2,
        "pid": 0,
        "name": "机械",
        "pname": "机械",
        "status": 1
      },
      {
        "id": 3,
        "pid": 1,
        "name": "门",
        "pname": "建筑",
        "status": 1
      },
      {
        "id": 4,
        "pid": 1,
        "name": "窗",
        "pname": "建筑",
        "status": 1
      }
    ]
  }
}
```

**字段说明**:示成功
- `result.allblocks`: 分类列表数组
  - `id`: 分类 ID（number）
  - `pid`: 父分类 ID，0 表示一级分类
  - `name`: 分类名称（string）
  - `pname`: 父分类名称（string）
  - `status`: 状态，1=启用，0=禁用
- `code`: 状态码，"success" 表

**SQL 查询逻辑**:
```sql
SELECT a.*, b.name AS pname 
FROM drawings_type a 
JOIN drawings_type b ON a.pid = b.id 
WHERE a.status = 1 AND a.pid != 0
```

**说明**:
- 查询所有二级分类（pid != 0）
- JOIN 获取父分类名称
- 只返回启用的分类（status = 1）

---

### 2. 获取图纸列表（图纸库）

**路由**: `POST /gallery/drawings/filelist`

**入参**:
```json
{
  "keywords": "箭头",
  "firstType": 1,
  "pageIndex": 0,
  "pageSize": 50
}
```

**入参说明**:
- `keywords` (string, 可选): 搜索关键字，模糊匹配文件名
- `firstType` (number, 可选): 二级分类 ID，0 表示全部
- `pageIndex` (number, 必填): 页码，从 0 开始
- `pageSize` (number, 必填): 每页数量，默认 50

**出参**:
```json
{
  "sharedwgs": [
    {
      "uuid": "abc123def456",
      "filename": "箭头_1.dwg",
      "firstType": 1,
      "secondType": 2,
      "filehash": "a1b2c3d4e5f6...",
      "type": "门",
      "lookNum": 100,
      "likeNum": 50,
      "collect": false
    },
    {
      "uuid": "xyz789ghi012",
      "filename": "箭头_2.dwg",
      "firstType": 1,
      "secondType": 2,
      "filehash": "f6e5d4c3b2a1...",
      "type": "门",
      "lookNum": 80,
      "likeNum": 30,
      "collect": true
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

**出参说明**:
- `sharedwgs`: 图纸列表数组
  - `uuid` (string): 图纸 UUID
  - `filename` (string): 文件名（含扩展名）
  - `firstType` (number): 一级分类 ID
  - `secondType` (number): 二级分类 ID
  - `filehash` (string): 文件 SHA-256 哈希值
  - `type` (string): 分类名称（从分类表 JOIN 获取）
  - `lookNum` (number): 浏览次数
  - `likeNum` (number): 收藏次数
  - `collect` (boolean): 是否已收藏

- `page`: 分页信息
  - `index` (number): 当前页码
  - `size` (number): 每页数量
  - `count` (number): 总记录数
  - `max` (number): 总页数
  - `up` (boolean): 是否有上一页
  - `down` (boolean): 是否有下一页

**SQL 查询逻辑**:

**步骤 1: 获取总数**
```sql
SELECT count(1) c 
FROM drawings_gallery 
WHERE 1=1 
  AND firstType = 1 
  AND filename LIKE '%箭头%'
```

**步骤 2: 获取列表**
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

**步骤 3: 获取统计信息**
```sql
SELECT * 
FROM drawings_file_info 
WHERE fileuuid IN("abc123def456", "xyz789ghi012")
```

**数据组装逻辑**:
1. 查询主列表，获取基本信息
2. 查询统计表，获取 lookNum 和 likeNum
3. 根据 uuid 关联统计数据
4. 为每条记录添加 `collect: false`（默认未收藏）
5. 计算分页信息

**分页计算逻辑**:
```javascript
max = count / pageSize + (count % pageSize == 0 ? 0 : 1)
up = (pageIndex != 0)
down = (pageIndex < max - 1)
```

---

## 图块库接口

### 1. 获取分类列表（图块库）

**路由**: `POST /gallery/blocks/types`

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
      },
      {
        "id": 2,
        "pid": 0,
        "name": "机械",
        "pname": "机械",
        "status": 1
      },
      {
        "id": 3,
        "pid": 1,
        "name": "门",
        "pname": "建筑",
        "status": 1
      },
      {
        "id": 4,
        "pid": 1,
        "name": "窗",
        "pname": "建筑",
        "status": 1
      }
    ]
  }
}
```

**字段说明**: 与图纸库分类接口相同

**SQL 查询逻辑**:
```sql
SELECT a.*, b.name AS pname 
FROM blocks_type a 
JOIN blocks_type b ON a.pid = b.id 
WHERE a.status = 1 AND a.pid != 0
```

---

### 2. 获取图块列表（图块库）

**路由**: `POST /gallery/blocks/filelist`

**入参**:
```json
{
  "keywords": "箭头",
  "firstType": 1,
  "pageIndex": 0,
  "pageSize": 50
}
```

**入参说明**: 与图纸库列表接口相同

**出参**:
```json
{
  "sharedwgs": [
    {
      "uuid": "abc123def456",
      "filename": "箭头_1.dwg",
      "firstType": 1,
      "secondType": 2,
      "filehash": "a1b2c3d4e5f6...",
      "type": "门",
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

**出参说明**: 与图纸库列表接口相同

**SQL 查询逻辑**:

**步骤 1: 获取总数**
```sql
SELECT count(1) c 
FROM blocks_gallery 
WHERE 1=1 
  AND firstType = 1 
  AND filename LIKE '%箭头%'
```

**步骤 2: 获取列表**
```sql
SELECT a.uuid, a.filename, a.firstType, a.secondType, a.filehash, b.name as type 
FROM blocks_gallery a 
LEFT JOIN blocks_type b ON a.secondType = b.id 
WHERE 1=1 
  AND a.firstType = 1 
  AND a.filename LIKE '%箭头%' 
ORDER BY a.createTime DESC 
LIMIT 0, 50
```

**步骤 3: 获取统计信息**
```sql
SELECT * 
FROM blocks_file_info 
WHERE fileuuid IN("abc123def456", "xyz789ghi012")
```

**数据组装逻辑**: 与图纸库列表接口相同

---

## 通用说明

### 响应格式

所有接口直接返回原始 JSON 格式，**不经过 NestJS 全局响应包装**。

### 参数类型处理

```javascript
// pageIndex 和 pageSize 可能是字符串类型，需要转换
if (typeof (pageIndex) == 'string') {
  pageIndex = parseInt(pageIndex);
}
if (typeof (pageSize) == 'string') {
  pageSize = parseInt(pageSize);
}
```

### 默认值处理

```javascript
let keywords = req.body.keywords || "";
let firstType = req.body.firstType || 0;
let pageIndex = req.body.pageIndex || 0;
let pageSize = req.body.pageSize || 50;
```

### 空数据处理

```javascript
if (fileIDs.length == 0) {
  // 返回空的数据
  let data = {};
  data.sharedwgs = galleryDwgDatas;
  data.page = cratePageData(pageIndex, pageSize, result.galleryCount);
  res.send(data);
}
```

### 统计数据默认值

```javascript
// 如果没有找到统计数据，设置默认值
for (var i = 0; i < galleryDwgDatas.length; i++) {
  for (var j = 0; j < rs.length; j++) {
    if (galleryDwgDatas[i].uuid === rs[j].fileuuid) {
      galleryDwgDatas[i].lookNum = rs[j].lookNum;
      galleryDwgDatas[i].likeNum = rs[j].likeNum;
      break;
    } else {
      galleryDwgDatas[i].lookNum = 0;
      galleryDwgDatas[i].likeNum = 0;
    }
  }
}
```

---

## 数据表结构参考

### drawings_gallery / blocks_gallery（主表）

| 字段 | 类型 | 说明 |
|------|------|------|
| uuid | string | 主键（UUID） |
| filename | string | 文件名 |
| firstType | int | 一级分类 ID |
| secondType | int | 二级分类 ID |
| filehash | string | 文件 SHA-256 哈希值 |
| createTime | datetime | 创建时间 |

### drawings_type / blocks_type（分类表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| pid | int | 父分类 ID（0=一级分类） |
| name | string | 分类名称 |
| status | int | 状态（1=启用，0=禁用） |

### drawings_file_info / blocks_file_info（统计表）

| 字段 | 类型 | 说明 |
|------|------|------|
| fileuuid | string | 关联主表 uuid |
| lookNum | int | 浏览次数 |
| likeNum | int | 收藏次数 |

---

## CloudCAD 项目适配说明

### 数据库映射

使用现有的 `Asset` 模型，需要映射以下字段：

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

### 分类映射方案

**方案 1**: 使用 Asset.category 字段存储分类名称，建立内存映射表

```typescript
// 分类映射表
const categoryMap = new Map<string, { id: number, pid: number }>()

// 初始化映射
categoryMap.set("建筑", { id: 1, pid: 0 })
categoryMap.set("机械", { id: 2, pid: 0 })
categoryMap.set("门", { id: 3, pid: 1 })
categoryMap.set("窗", { id: 4, pid: 1 })
```

**方案 2**: 新增分类表，维护分类关系

```prisma
model GalleryType {
  id        Int      @id @default(autoincrement())
  pid       Int      @default(0)
  name      String
  status    Int      @default(1)
  assets    Asset[]
}
```

### 文件哈希提取

从 Asset.path 中提取文件哈希：

```typescript
// 示例路径: /drawings/2/1/a1b2c3d4e5f6.mxweb
const filehash = asset.path.split('/').pop()?.replace('.mxweb', '')
```

### 统计数据存储

**方案 1**: 在 Asset 模型中新增字段

```prisma
model Asset {
  // ... 现有字段
  lookNum   Int      @default(0)
  likeNum   Int      @default(0)
}
```

**方案 2**: 创建统计表

```prisma
model AssetStatistics {
  id        String   @id @default(cuid())
  assetId   String   @unique
  lookNum   Int      @default(0)
  likeNum   Int      @default(0)
  asset     Asset    @relation(fields: [assetId], references: [id])
}
```

---

## 实现注意事项

### 1. 绕过全局响应包装

```typescript
@Post('drawings/types')
async getDrawingsTypes(@Res() res: Response) {
  const result = await this.galleryService.getTypes('drawings');
  res.send({
    code: "success",
    result: { allblocks: result }
  });
}
```

### 2. 参数验证

```typescript
class GalleryListDto {
  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsNumber()
  @IsInt()
  firstType?: number;

  @IsNumber()
  @IsInt()
  @Min(0)
  pageIndex: number;

  @IsNumber()
  @IsInt()
  @Min(1)
  pageSize: number;
}
```

### 3. 分页计算

```typescript
calculatePagination(pageIndex: number, pageSize: number, count: number) {
  const max = Math.ceil(count / pageSize);
  return {
    index: pageIndex,
    size: pageSize,
    count: count,
    max: max,
    up: pageIndex > 0,
    down: pageIndex < max - 1
  };
}
```

### 4. SQL 注入防护

使用 Prisma 参数化查询，避免字符串拼接：

```typescript
// ❌ 错误：字符串拼接
const sql = `SELECT * FROM asset WHERE name LIKE '%${keywords}%'`;

// ✅ 正确：Prisma 查询
const assets = await prisma.asset.findMany({
  where: {
    name: {
      contains: keywords
    }
  }
});
```

---

**文档完成时间**: 2026-01-14  
**接口总数**: 4 个  
**文档版本**: v1.0