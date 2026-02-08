# @cloudcad/svn-version-tool

SVN 版本控制工具包，提供 SVN 仓库管理、检出、添加、提交等操作。

## 功能特性

- ✅ 创建 SVN 仓库
- ✅ 从 SVN 仓库检出代码
- ✅ 添加文件或目录到版本控制
- ✅ 提交更改到 SVN 仓库
- ✅ 列出 SVN 仓库内容
- ✅ 支持用户名/密码认证

## 安装

```bash
pnpm add @cloudcad/svn-version-tool
```

## 使用方法

### 基本导入

```javascript
const { 
  svnCheckout, 
  svnAdd, 
  svnCommit, 
  svnList, 
  svnadminCreate 
} = require('@cloudcad/svn-version-tool');
```

### TypeScript 支持

```typescript
import { 
  svnCheckout, 
  svnAdd, 
  svnCommit, 
  svnList, 
  svnadminCreate 
} from '@cloudcad/svn-version-tool';
```

## API 文档

### svnCheckout

从 SVN 仓库检出代码。

```javascript
svnCheckout(repoUrl, targetDir, username, password, callback)
```

**参数：**
- `repoUrl` (string): 仓库 URL
- `targetDir` (string): 目标目录
- `username` (string | null): 用户名（可选）
- `password` (string | null): 密码（可选）
- `callback` (function): 回调函数

**示例：**

```javascript
svnCheckout(
  'file:///path/to/repo',
  './localrepo',
  null,
  null,
  (error, result) => {
    if (error) {
      console.error('Error:', error);
    } else {
      console.log('Success:', result);
    }
  }
);
```

### svnAdd

添加文件或目录到 SVN 版本控制。

```javascript
svnAdd(targetPaths, isRecursive, callback)
```

**参数：**
- `targetPaths` (string[]): 目标路径数组
- `isRecursive` (boolean): 是否递归
- `callback` (function): 回调函数

**示例：**

```javascript
svnAdd(['./localrepo/newfile.txt'], true, (error, result) => {
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success:', result);
  }
});
```

### svnCommit

向 SVN 仓库提交更改。

```javascript
svnCommit(targetPaths, message, isRecursive, username, password, callback)
```

**参数：**
- `targetPaths` (string[]): 目标路径数组
- `message` (string): 提交日志
- `isRecursive` (boolean): 是否递归
- `username` (string | null): 用户名（可选）
- `password` (string | null): 密码（可选）
- `callback` (function): 回调函数

**示例：**

```javascript
svnCommit(
  ['./localrepo/dir1/file.txt'],
  'Added new files',
  true,
  null,
  null,
  (error, result) => {
    if (error) {
      console.error('Error:', error);
    } else {
      console.log('Success:', result);
    }
  }
);
```

### svnList

列出 SVN 仓库内容。

```javascript
svnList(repoUrl, isRecursive, username, password, callback)
```

**参数：**
- `repoUrl` (string): 仓库 URL
- `isRecursive` (boolean): 是否递归
- `username` (string | null): 用户名（可选）
- `password` (string | null): 密码（可选）
- `callback` (function): 回调函数

**示例：**

```javascript
svnList(
  'file:///path/to/repo',
  true,
  null,
  null,
  (error, result) => {
    if (error) {
      console.error('Error:', error);
    } else {
      console.log('Repository contents:', result);
    }
  }
);
```

### svnadminCreate

创建一个新的 SVN 仓库。

```javascript
svnadminCreate(repoPath, callback)
```

**参数：**
- `repoPath` (string): 仓库路径
- `callback` (function): 回调函数

**示例：**

```javascript
svnadminCreate('./svnrepo', (error, result) => {
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Repository created successfully');
  }
});
```

## 平台支持

- ✅ Windows 10+ (x64)

## 注意事项

- 本包仅支持 Windows 平台
- SVN 可执行文件已包含在 `subversion/` 目录中
- 使用 file:// 协议访问本地 SVN 仓库时，路径必须使用正斜杠（/）

## 测试

运行测试用例：

```bash
pnpm test
```

## 许可证

UNLICENSED