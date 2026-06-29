# SVN → MX 重命名执行计划

## 关键约定

### Windows vs Linux 明确区分

| 方面 | Windows | Linux (Docker/生产) |
|------|---------|-------------------|
| Runtime 目录 | `runtime/windows/subversion/` → `runtime/windows/mxversion/` | `runtime/linux/subversion/` **保持不动** |
| 可执行文件 | `svn.exe` → `mx.exe`，`svnadmin.exe` → `mxadmin.exe` | 系统 `svn`/`svnadmin` 命令，**不变** |
| DLL/SO | 保留原名（内部名称依赖） | 保留原名 |
| Dockerfile.svn | 不适用 | **保持原样**，仍提取 `svn` 二进制 |
| docker-entrypoint.sh | 不适用 | shell 命令仍用 `svn`/`svnadmin`，仅环境变量名改 |
| 包代码 `mxpath.js` | 路径指向 `runtime/windows/mxversion/mx.exe` | 路径指向 `runtime/linux/subversion/svn`（或系统 `svn`） |

### 通用规则

- **源码标识符**: 所有函数名、变量名、类型名、类名、文件名中的 `svn` → `mx`
- **日志/注释/错误消息**: 所有 `SVN` → `MX`
- **环境变量**: `SVN_REPO_PATH` → `MX_REPO_PATH`，`SVN_IGNORE_PATTERNS` → `MX_IGNORE_PATTERNS`
- **ConfigService key**: `'svnRepoPath'` → `'mxRepoPath'`，`'svn'` → `'mx'`

## 完成标准

- `packages/svnVersionTool/` → `packages/mxVersionTool/`
- `runtime/windows/subversion/` → `runtime/windows/mxversion/`（Windows 专属）
- `runtime/linux/subversion/` 保持不变（Linux 专属）
- Windows 可执行文件 `svn*.exe` → `mx*.exe`
- 包名 `@cloudcad/svn-version-tool` → `@cloudcad/mx-version-tool`
- 后端 `SvnVersionControlProvider` → `MxVersionControlProvider`，DTO 类名同改
- 所有函数名、类型名、变量名中的 `svn`/`SVN` → `mx`/`MX`
- 所有文档、注释、日志字符串中的 SVN 引用更新
- 构建脚本、Dockerfile、pnpm-lock.yaml 同步更新

---

## 阶段 1：`packages/svnVersionTool/` → `packages/mxVersionTool/`

### 1.1 目录改名

```
packages/svnVersionTool/ → packages/mxVersionTool/
```

### 1.2 文件改名

| 原名 | 新名 |
|------|------|
| `svncmd.js` | `mxcmd.js` |
| `svn-executor.js` | `mx-executor.js` |
| `svnpath.js` | `mxpath.js` |
| `svnadminpath.js` | `mxadminpath.js` |
| `svncheck.js` | `mxcheck.js` |
| `svncheckout.js` | `mxcheckout.js` |
| `svnadd.js` | `mxadd.js` |
| `svncommit.js` | `mxcommit.js` |
| `svnlist.js` | `mxlist.js` |
| `svnadmincreate.js` | `mxadmincreate.js` |
| `svnimport.js` | `mximport.js` |
| `svndelete.js` | `mxdelete.js` |
| `svnlog.js` | `mxlog.js` |
| `svncat.js` | `mxcat.js` |
| `svnpropset.js` | `mxpropset.js` |
| `svnupdate.js` | `mxupdate.js` |
| `svncleanup.js` | `mxcleanup.js` |
| `svnresolve.js` | `mxresolve.js` |

### 1.3 `package.json`

```json
{
  "name": "@cloudcad/mx-version-tool",
  "description": "MX 版本控制工具包，提供 MX 仓库管理、检出、添加、提交等操作",
  "main": "mxcmd.js",
  "keywords": ["mx", "version-control"],
  "files": [
    "mxcmd.js",
    "mx-executor.js",
    "mxcheckout.js",
    "mxadd.js",
    "mxcommit.js",
    "mxlist.js",
    "mxadmincreate.js",
    "mximport.js",
    "mxdelete.js",
    "mxlog.js",
    "mxcat.js",
    "mxpropset.js",
    "mxupdate.js",
    "mxcleanup.js",
    "mxpath.js",
    "mxadminpath.js",
    "mxcheck.js",
    "mxresolve.js",
    "index.d.ts",
    "README.md"
  ]
}
```

### 1.4 代码内标识符替换

**`mxpath.js`** 平台感知伪代码：

```javascript
const isWindows = os.platform() === 'win32';

// runtime 目录名（仅 Windows 改）
const versionDirName = isWindows ? 'mxversion' : 'subversion';  // ← 关键区分
const subversionDir = path.join(runtimeDir, versionDirName);

// 可执行文件名（仅 Windows 改）
const mxExeName = isWindows ? 'mx.exe' : 'svn';                // ← 关键区分
const mxPath = useRuntime
  ? path.join(subversionDir, mxExeName)
  : (isWindows ? 'mx' : 'svn');                                  // ← 回退值
```

变量重命名:
- `svnExeName` → `mxExeName`
- `svnPath` → `mxPath`
- `getSvnLibPath` → `getMxLibPath`

**`mxadminpath.js`**（同上逻辑）：

```javascript
const mxadminExeName = isWindows ? 'mxadmin.exe' : 'svnadmin';  // ← 关键区分
const mxadminPath = useRuntime
  ? path.join(subversionDir, mxadminExeName)
  : (isWindows ? 'mxadmin' : 'svnadmin');                        // ← 回退值
```

变量重命名:
- `svnadminExeName` → `mxadminExeName`
- `svnadminPath` → `mxadminPath`

**`mx-executor.js`**：
- `require('./svnpath')` → `require('./mxpath')`

**`mxcheck.js`**：
- require: `./svnpath` → `./mxpath`，`./svnadminpath` → `./mxadminpath`，`./svn-executor` → `./mx-executor`
- 函数: `checkSvnAvailable` → `checkMxAvailable`，`checkSvnAvailableSync` → `checkMxAvailableSync`
- 导出: 同上
- `getPlatformInfo` 返回值: `svnPath` → `mxPath`，`svnadminPath` → `mxadminPath`
- 错误消息: `'SVN 可执行文件损坏'` → `'MX 可执行文件损坏'`
- 包名: `@cloudcad/svn-version-tool` → `@cloudcad/mx-version-tool`

**`mxcmd.js`**：
- 所有 require: `./svnXxx` → `./mxXxx`
- 所有导出键名: `svnXxx` → `mxXxx`
- `checkSvnAvailable` / `checkSvnAvailableSync` → `mx` 前缀

**每个子命令文件**（mxcheckout, mxadd, mxcommit 等）：
- require 路径更新: `./svnXxx` → `./mxXxx`
- 函数名 `svnXxx` → `mxXxx`
- 变量 `svnPath` → `mxPath`
- 临时文件名: `svn-commit-` → `mx-commit-`，`svn-import-` → `mx-import-`，`svn-prop-` → `mx-prop-`

**`test.js`**：
- `require('./svncmd')` → `require('./mxcmd')`
- 函数名、注释更新

### 1.5 `index.d.ts`

| 原类型/函数 | 新类型/函数 |
|-------------|------------|
| `SvnCallback` | `MxCallback` |
| `svnCheckout` | `mxCheckout` |
| `svnAdd` | `mxAdd` |
| `svnCommit` | `mxCommit` |
| `svnDelete` | `mxDelete` |
| `svnList` | `mxList` |
| `svnadminCreate` | `mxadminCreate` |
| `svnImport` | `mxImport` |
| `svnLog` | `mxLog` |
| `svnCat` | `mxCat` |
| `svnPropset` | `mxPropset` |
| `svnUpdate` | `mxUpdate` |
| `svnCleanup` | `mxCleanup` |
| `SvnCheckResult` | `MxCheckResult` |
| `SvnCheckCallback` | `MxCheckCallback` |
| `checkSvnAvailable` | `checkMxAvailable` |
| `checkSvnAvailableSync` | `checkMxAvailableSync` |
| `PlatformInfo.svnPath` | `PlatformInfo.mxPath` |
| `PlatformInfo.svnadminPath` | `PlatformInfo.mxadminPath` |

### 1.6 `README.md`

- 标题/描述 `@cloudcad/svn-version-tool` → `@cloudcad/mx-version-tool`
- 所有函数名 `svnXxx` → `mxXxx`
- 安装命令更新
- 所有注释/描述中的 `SVN` → `MX`

### 1.7 `AGENTS.md`（包内）

- 所有 `SVN` → `MX`，`svn` → `mx`
- 包名、命令、目录路径全部更新

---

## 阶段 2：Runtime（仅 Windows 重命名，Linux 不动）

### 2.1 Windows：目录改名

```
runtime/windows/subversion/ → runtime/windows/mxversion/
```

### 2.2 Windows：可执行文件改名（11 个）

| 原名 | 新名 |
|------|------|
| `svn.exe` | `mx.exe` |
| `svnadmin.exe` | `mxadmin.exe` |
| `svnbench.exe` | `mxbench.exe` |
| `svndumpfilter.exe` | `mxdumpfilter.exe` |
| `svnfsfs.exe` | `mxfsfs.exe` |
| `svnlook.exe` | `mxlook.exe` |
| `svnmucc.exe` | `mxmucc.exe` |
| `svnrdump.exe` | `mxrdump.exe` |
| `svnserve.exe` | `mxserve.exe` |
| `svnsync.exe` | `mxsync.exe` |
| `svnversion.exe` | `mxversion.exe` |

DLL 文件保留原名（内部有名称依赖，改名会导致加载失败）。

### 2.3 Linux：完全不动

| 项目 | 状态 |
|------|------|
| `runtime/linux/subversion/` 目录 | **不变** |
| 内部 `svn`、`svnadmin` 等二进制 | **不变** |
| `runtime/docker/Dockerfile.svn` | **不变**（仍提取 `svn` 二进制） |
| `runtime/scripts/extract-linux-runtime.js` | **不变**（仍处理 `subversion` 组件） |

---

## 阶段 3：后端代码更新

### 3.1 文件重命名

| 旧路径 | 新路径 |
|--------|--------|
| `src/version-control/providers/svn-version-control.provider.ts` | `src/version-control/providers/mx-version-control.provider.ts` |
| `src/version-control/dto/svn-log-response.dto.ts` | `src/version-control/dto/mx-log-response.dto.ts` |
| `src/version-control/dto/svn-log-entry.dto.ts` | `src/version-control/dto/mx-log-entry.dto.ts` |
| `src/version-control/dto/svn-log-path.dto.ts` | `src/version-control/dto/mx-log-path.dto.ts` |

### 3.2 `mx-version-control.provider.ts`

- import: `from '@cloudcad/svn-version-tool'` → `from '@cloudcad/mx-version-tool'`
- 导入函数: `svnCheckout` → `mxCheckout`（12 个全部）
- promisify: `promisify(svnXxx)` → `promisify(mxXxx)`
- 异步变量: `svnCheckoutAsync` → `mxCheckoutAsync` 等
- 类名: `SvnVersionControlProvider` → `MxVersionControlProvider`
- 字段: `svnRepoPath` → `mxRepoPath`，`svnIgnorePatterns` → `mxIgnorePatterns`
- ConfigService get key: `'svnRepoPath'` → `'mxRepoPath'`，`'svn'` → `'mx'`
- 日志/注释: `'SVN'` → `'MX'`

### 3.3 DTO 类重命名

| 旧类名 | 新类名 |
|--------|--------|
| `SvnLogResponseDto` | `MxLogResponseDto` |
| `SvnLogEntryDto` | `MxLogEntryDto` |
| `SvnLogPathDto` | `MxLogPathDto` |

对应文件内部 import 和 JSDoc 同步更新。

### 3.4 `version-control.module.ts`

```typescript
import { MxVersionControlProvider } from './providers/mx-version-control.provider';
// providers 中 SvnVersionControlProvider → MxVersionControlProvider
```

### 3.5 `version-control.controller.ts`

- import: `SvnLogResponseDto` → `MxLogResponseDto`

### 3.6 `app.config.ts`（config 接口定义）

| 原定义 | 新定义 |
|--------|--------|
| `svnRepoPath: string` | `mxRepoPath: string` |
| `SvnConfig` | `MxConfig` |
| `svn: SvnConfig` | `mx: MxConfig` |

### 3.7 `configuration.ts`（默认值）

| 原 | 新 |
|----|----|
| `svnRepoPath: resolvePath(process.env.SVN_REPO_PATH \|\| "data/svn-repo")` | `mxRepoPath: resolvePath(process.env.MX_REPO_PATH \|\| "data/svn-repo")` |
| `svn: { ignorePatterns: ... }` | `mx: { ignorePatterns: ... }` |
| `SVN_IGNORE_PATTERNS` | `MX_IGNORE_PATTERNS` |

### 3.8 `linux-init.service.ts`

- import: `from '@cloudcad/mx-version-tool'`
- `checkSvnAvailableSync` → `checkMxAvailableSync`
- `platformInfo.svnPath` → `platformInfo.mxPath`
- 日志: `'SVN'` → `'MX'`

### 3.9 `file-operations.service.ts`

- 变量: `svnError` → `mxError`
- 日志: `'SVN'` → `'MX'`

### 3.10 `file-conversion-upload.service.ts`

- 变量: `svnError` → `mxError`

### 3.11 `packages/backend/package.json`

```json
"@cloudcad/mx-version-tool": "workspace:*"
```

---

## 阶段 4：测试文件

| 文件 | 变更 |
|------|------|
| `test/mocks-setup.ts:1` | `jest.mock('@cloudcad/mx-version-tool', () => mxMockObj)` |
| `test/integration/cad-save-version.integration.spec.ts` | `@cloudcad/svn-version-tool` → `@cloudcad/mx-version-tool`, `svnBehaviors` → `mxBehaviors`, `svnOk` → `mxOk`, `svnNames` → `mxNames`, `svnMockObj` → `mxMockObj` |
| `test/integration/cad-save-as-duplicate-version-chain.integration.spec.ts` | 同上 |
| `test/integration/workflow-2-save-svn-version.integration.spec.ts` | 同上 |

---

## 阶段 5：环境变量

| 旧变量 | 新变量 |
|--------|--------|
| `SVN_REPO_PATH` | `MX_REPO_PATH` |
| `SVN_IGNORE_PATTERNS` | `MX_IGNORE_PATTERNS` |

涉及文件：
- `packages/backend/.env`
- `packages/backend/.env.example`
- `docker/.env`
- `docker/.env.example`

---

## 阶段 6：Docker + 构建脚本

### 6.1 `docker/Dockerfile`

| 行号 | 原内容 | 新内容 |
|------|--------|--------|
| 9 | `subversion`（apk 包名） | 保留不变（系统包名） |
| 19 | `packages/svnVersionTool/package.json` | `packages/mxVersionTool/package.json` |
| 40 | `复制 svnVersionTool 源代码` | `复制 mxVersionTool 源代码` |
| 41 | `COPY packages/svnVersionTool ./packages/svnVersionTool` | `COPY packages/mxVersionTool ./packages/mxVersionTool` |
| 104 | `subversion`（apk 包名） | 保留不变 |
| 112 | `packages/svnVersionTool/package.json` | `packages/mxVersionTool/package.json` |
| 119 | `@cloudcad/svn-version-tool` | `@cloudcad/mx-version-tool` |
| 125-126 | `@cloudcad/svn-version-tool` | `@cloudcad/mx-version-tool` |
| 132 | `复制 svnVersionTool 源代码` | `复制 mxVersionTool 源代码` |
| 133 | `COPY packages/svnVersionTool ./packages/svnVersionTool` | `COPY packages/mxVersionTool ./packages/mxVersionTool` |

### 6.2 `docker/docker-entrypoint.sh`

⚠️ **此脚本在 Docker (Linux) 中运行，系统命令仍为 `svn`/`svnadmin`**

| 变更类型 | 内容 |
|---------|------|
| 函数名 | `init_svn` → `init_mx`（仅源码标识符） |
| 环境变量名 | `SVN_REPO_PATH` → `MX_REPO_PATH`，`FILES_DATA_PATH` 不变 |
| shell 命令 | **不变**，仍用 `svn info`、`svnadmin create`、`svn switch` 等 |
| .svn 目录 | **不变**，SVN 工作副本元数据目录名不改 |
| 注释/日志 | `'SVN'` → `'MX'`

### 6.3 `runtime/docker/Dockerfile.svn`

⚠️ **此文件仅用于 Linux Docker 构建，保持不变**

| 方面 | 状态 |
|------|------|
| 所有内容 | **不变**，仍提取 Linux `svn`/`svnadmin` 等二进制到 `runtime/linux/subversion/` |

### 6.4 `runtime/scripts/extract-linux-runtime.js`

⚠️ **此脚本仅用于 Linux，保持不变**

| 方面 | 状态 |
|------|------|
| 所有内容 | **不变**，仍处理 `subversion` 组件提取 |

### 6.5 打包脚本

| 文件 | 原内容 | 新内容 |
|------|--------|--------|
| `scripts/pack-offline.js` | `packages/svnVersionTool` | `packages/mxVersionTool` |
| `scripts/pack-docker.js` | `packages/svnVersionTool` | `packages/mxVersionTool` |
| `runtime/scripts/pack-offline.js` | `packages/svnVersionTool` | `packages/mxVersionTool` |
| `runtime/scripts/pack-docker.js` | `packages/svnVersionTool` | `packages/mxVersionTool` |

---

## 阶段 7：pnpm-lock.yaml

运行 `pnpm install` 重新生成，自动更新：
- `@cloudcad/svn-version-tool` → `@cloudcad/mx-version-tool`
- `packages/svnVersionTool` → `packages/mxVersionTool`

`pnpm-workspace.yaml` 不需要修改（使用 `packages/*` 通配符）。

---

## 阶段 8：项目文档

| 文件 | 内容 |
|------|------|
| `AGENTS.md`（根） | `svnVersionTool` → `mxVersionTool`，`svncmd.js` → `mxcmd.js` |
| `PROJECT_OVERVIEW.md` | 类似更新 |
| 其他 .md 文档 | `svn`/`SVN` → `mx`/`MX` |

---

## 验证步骤（完成后）

1. `git status` 确认所有改名文件
2. `pnpm install` 更新 lockfile
3. `pnpm type-check`（在后端包运行）
4. `pnpm test` 运行测试
5. `pnpm build` 确认构建通过
