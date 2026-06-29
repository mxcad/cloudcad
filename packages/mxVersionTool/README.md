# @cloudcad/mx-version-tool

MX 版本控制工具包，提供 MX 仓库管理、检出、添加、提交等操作。

## 功能特性

- ✅ 创建 MX 仓库
- ✅ 从 MX 仓库检出代码
- ✅ 添加文件或目录到版本控制
- ✅ 提交更改到 MX 仓库
- ✅ 列出 MX 仓库内容
- ✅ 支持用户名/密码认证

## 安装

```bash
pnpm add @cloudcad/mx-version-tool
```

## 使用方法

### 基本导入

```javascript
const {
  mxCheckout,
  mxAdd,
  mxCommit,
  mxList,
  mxadminCreate,
} = require('@cloudcad/mx-version-tool');
```

### TypeScript 支持

```typescript
import {
  mxCheckout,
  mxAdd,
  mxCommit,
  mxList,
  mxadminCreate,
} from '@cloudcad/mx-version-tool';
```

## API 文档

### mxCheckout

```javascript
mxCheckout(repoUrl, targetDir, username, password, callback);
```

### mxAdd

```javascript
mxAdd(targetPaths, isRecursive, callback);
```

### mxCommit

```javascript
mxCommit(targetPaths, message, isRecursive, username, password, callback);
```

### mxList

```javascript
mxList(repoUrl, isRecursive, username, password, callback);
```

### mxadminCreate

```javascript
mxadminCreate(repoPath, callback);
```

## 注意事项

- 本包仅支持 Windows 平台
- MX 可执行文件已包含在 `mxversion/` 目录中
- 使用 file:// 协议访问本地仓库时，路径必须使用正斜杠（/）

## 测试

```bash
pnpm test
```

## 许可证

UNLICENSED
