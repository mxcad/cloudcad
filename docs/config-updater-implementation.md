# 配置文件和品牌资源增量更新功能实现总结

## 问题描述

用户使用新部署包覆盖旧部署包时，自定义配置和资源会被覆盖丢失，包括：
- 前端 `dist/` 目录下所有静态 JSON 配置文件（如 `ini/*.json`, `brand/config.json` 等）
- 品牌资源文件（如 `brand/logo.png` - 用户上传的品牌 Logo）
- `.env` 环境变量文件

## 解决方案

### 1. 打包阶段：重命名静态资源配置为 .example

**文件**: `scripts/pack-offline.js`

**修改内容**:
- 修改 `renameFrontendConfigFiles()` 函数为 `renameFrontendStaticFiles()`
- **递归遍历** `dist/` 目录下所有子目录
- 处理两类文件：
  1. **JSON 配置文件** → `*.json.example`
  2. **brand 目录下的图片资源** → `*.png.example`, `*.jpg.example` 等

**效果**:
```
打包前：
  dist/ini/myServerConfig.json
  dist/brand/config.json
  dist/brand/logo.png

打包后：
  dist/ini/myServerConfig.json.example
  dist/brand/config.json.example
  dist/brand/logo.png.example
```

这样新部署包覆盖时不会直接覆盖用户现有的配置文件和品牌资源。

---

### 2. 初始化阶段：增量更新配置和资源

**文件**: `runtime/scripts/config-updater.js`（新建）

**核心功能**:

#### A. JSON 配置增量更新
```javascript
mergeWithMissingOnly(exampleConfig, userConfig)
```

**规则**:
1. 如果用户配置文件不存在，直接复制 `.example` 文件
2. 如果用户配置文件存在：
   - 备份为 `.bak` 文件
   - **递归遍历** `.example` 中的每个属性（支持任意深度嵌套）
   - 只添加 `.example` 中有但用户配置中没有的属性
   - 不修改用户已有的任何配置（值、对象、数组）

**示例**:
```json
// example (新增配置项)
{
  "uploadFileConfig": {
    "baseUrl": "",
    "create": {
      "server": "/api/upload",
      "accept": {           // 新增
        "mimeTypes": ".mxweb,.dwg,.dxf"
      }
    }
  },
  "newFeature": {           // 新增
    "enabled": true
  }
}

// user (用户原有配置)
{
  "uploadFileConfig": {
    "baseUrl": "http://custom.com"  // 用户自定义值
  }
}

// 合并结果
{
  "uploadFileConfig": {
    "baseUrl": "http://custom.com",  // ✓ 保持用户值
    "create": {
      "server": "/api/upload",
      "accept": {                     // ✓ 新增
        "mimeTypes": ".mxweb,.dwg,.dxf"
      }
    }
  },
  "newFeature": {                     // ✓ 新增
    "enabled": true
  }
}
```

#### B. 品牌资源文件恢复
```javascript
// brand 目录下的 .example 文件 → 恢复为原文件
```

**规则**:
1. 如果用户资源文件**已存在**（如 `logo.png`）→ **跳过，保留用户的**
2. 如果用户资源文件**不存在** → 从 `.example` 复制

**示例**:
```
场景 1: 用户已有自定义 Logo
  部署包：brand/logo.png.example
  用户文件：brand/logo.png (用户上传的自定义 Logo)
  结果：保留用户的 logo.png ✓

场景 2: 全新安装
  部署包：brand/logo.png.example
  用户文件：无
  结果：从 .example 复制创建 logo.png ✓
```

#### 支持的目录结构

递归处理 `dist/` 目录下所有子目录中的文件：

```
dist/
├── ini/
│   ├── myServerConfig.json
│   ├── myUiConfig.json
│   └── myVuetifyThemeConfig.json
├── brand/
│   ├── config.json
│   └── logo.png          ← 用户上传的品牌资源
└── settings/
    └── ui.json
```

所有 JSON 配置文件和品牌资源都会被自动发现并增量更新。

---

### 3. .env 文件增量更新

```javascript
updateEnvConfig(envFile)
```

**规则**:
1. 解析 `.env` 文件为键值对
2. 只添加 `.example` 中有但用户配置中没有的 key
3. 保持用户已有的所有配置值不变
4. 新增的配置项会添加特殊注释标记

**示例**:
```ini
# example
DATABASE_URL=postgresql://postgres:password@localhost:5432/cloudcad
REDIS_HOST=localhost
NEW_FEATURE_KEY=new_value

# user
DATABASE_URL=postgresql://postgres:custom@myhost:5432/mydb

# 合并结果
DATABASE_URL=postgresql://postgres:custom@myhost:5432/mydb  # ✓ 保持用户值
REDIS_HOST=localhost                                          # ✓ 新增
NEW_FEATURE_KEY=new_value                                     # ✓ 新增
```

---

### 4. 离线环境初始化集成

**文件**: `runtime/scripts/setup-offline.js`

**修改内容**:
在 `setup()` 函数中，`copyEnvExampleToEnv()` 之后调用配置增量更新：

```javascript
// 2. 将 .env.example 拷贝为 .env
copyEnvExampleToEnv();

// 3. 配置文件增量更新（前端 JSON + 品牌资源 + .env）
const { updateAllConfigs } = require('./config-updater');
updateAllConfigs(PROJECT_ROOT);
```

---

## 文件清单

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `scripts/pack-offline.js` | 修改 | 重命名函数，支持 JSON 和品牌图片资源 |
| `runtime/scripts/config-updater.js` | 新建 | 增量更新核心逻辑 |
| `runtime/scripts/setup-offline.js` | 修改 | 在初始化时调用配置更新 |
| `scripts/test-config-updater.js` | 新建 | 单元测试脚本 |
| `scripts/test-config-integration.js` | 新建 | 集成测试脚本 |
| `scripts/test-brand-resources.js` | 新建 | 品牌资源测试脚本 |

---

## 测试

### 运行单元测试
```bash
node scripts/test-config-updater.js
```

**结果**: 19 通过，0 失败

### 运行集成测试
```bash
node scripts/test-config-integration.js
```

**结果**: 12 通过，0 失败

### 运行品牌资源测试
```bash
node scripts/test-brand-resources.js
```

**结果**: 所有测试通过
- ✓ 用户已有 logo.png → 保留用户的
- ✓ 用户没有 logo.png → 从 .example 复制
- ✓ config.json 增量更新正确

---

## 工作流程

### 部署包打包流程
```
1. 构建前端 → dist/
2. 复制 dist/ 到部署包临时目录
3. 递归遍历 dist/ 所有子目录
   - 重命名 *.json → *.json.example
   - 重命名 brand/*.png → *.png.example  ← 新增
4. 创建压缩包
```

### 用户部署流程
```
1. 解压部署包
2. 运行 start.bat
3. 自动执行离线环境初始化：
   a. 安装依赖
   b. 复制 .env.example → .env（如果不存在）
   c. 递归增量更新所有配置和资源：
      - JSON 配置：备份 + 增量更新
      - 品牌资源：如果用户有则保留，无则复制
      - .env 文件：增量更新
   d. 启动服务
```

### 覆盖部署流程（核心场景）
```
1. 解压新部署包（覆盖旧部署包）
2. 运行 start.bat
3. 自动执行离线环境初始化：
   a. 检测到用户配置文件存在
      - brand/logo.png → 保留用户的 ✓
      - brand/config.json → 备份 + 增量更新 ✓
      - ini/myServerConfig.json → 备份 + 增量更新 ✓
   b. 启动服务
```

---

## 特殊情况处理

| 情况 | 处理策略 |
|------|----------|
| JSON 数组 | 保持用户数组不变 |
| null vs 值 | 保持用户值 |
| 值 vs null | 添加 example 值 |
| 对象 vs 值 | 结构变化，记录警告，以 example 为准 |
| 值 vs 对象 | 结构变化，记录警告，保持 user 值 |
| 深层嵌套 | 递归处理每一层 |
| 未知子目录 | 自动发现并处理 |
| 品牌图片 | 用户有则保留，无则复制 |

---

## 备份策略

所有更新的 JSON 配置文件都会生成 `.bak` 备份文件：
- `myServerConfig.json.bak`
- `brand/config.json.bak`
- `.env.bak`

如果更新失败，会自动恢复备份。

**注意**: 品牌资源文件（如 `logo.png`）不会生成备份，因为它们是二进制文件，且更新策略是"用户有则保留"，不会被覆盖。

---

## 支持的文件类型

### JSON 配置文件（所有子目录）
- `*.json` → `*.json.example`

### 品牌资源文件（brand 目录）
- `*.png` → `*.png.example`
- `*.jpg` → `*.jpg.example`
- `*.jpeg` → `*.jpeg.example`
- `*.svg` → `*.svg.example`
- `*.gif` → `*.gif.example`

### 环境变量文件
- `*.env` → 增量更新键值对

---

## 未来扩展

可以考虑的改进：
1. 清理过期的 `.bak` 备份文件（保留最近 N 个）
2. 提供配置差异对比工具
3. 支持配置迁移脚本（重大版本升级时）
4. 支持配置验证（检查配置格式是否正确）
5. 扩展品牌资源类型（ favicon、banner 图片等）
