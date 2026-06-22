# SVN → MX 重命名执行计划

## 完成标准

- `packages/svnVersionTool/` 改为 `packages/mx-version-tool/`
- `runtime/windows/subversion/` 改为 `runtime/windows/mxversion/`
- `runtime/linux/subversion/` 改为 `runtime/linux/mxversion/`
- Windows 可执行文件 `svn*.exe` → `mx*.exe`（DLL 保留原名）
- 包名 `@cloudcad/svn-version-tool` → `@cloudcad/mx-version-tool`
- 后端 `SvnVersionControlProvider` → `MxVersionControlProvider`
- 所有函数名、类型名、变量名中的 `svn`/`SVN` → `mx`/`MX`
- 所有文档、注释、日志字符串中的 SVN 引用更新
- 构建脚本、Dockerfile、pnpm-lock.yaml 同步更新

---

## 阶段 1：`packages/svnVersionTool/` 包内部重命名

### 1.1 目录改名

```
packages/svnVersionTool/ → packages/mx-version-tool/
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

### 1.3 代码内标识符替换

**`mxpath.js`（原 svnpath.js）**：
- `svnExeName` → `mxExeName`
- `svnPath` → `mxPath`
- `getSvnLibPath` → `getMxLibPath`
- `subversionDir` → `mxversionDir`
- 注释中 `svn`/`SVN` → `mx`/`MX`

**`mxadminpath.js`（原 svnadminpath.js）**：
- `svnadminExeName` → `mxadminExeName`
- `svnadminPath` → `mxadminPath`
- `subversionDir` → `mxversionDir`

**`mx-executor.js`（原 svn-executor.js）**：
- `require('./svnpath')` → `require('./mxpath')`
- 注释中 `SVN` → `MX`

**`mxcheck.js`（原 svncheck.js）**：
- `require('./svnpath')` → `require('./mxpath')`
- `require('./svnadminpath')` → `require('./mxadminpath')`
- `require('./svn-executor')` → `require('./mx-executor')`
- `checkSvnAvailable` → `checkMxAvailable`
- `checkSvnAvailableSync` → `checkMxAvailableSync`
- `svnPath` → `mxPath`
- 输出对象属性 `svnPath` → `mxPath`，`svnadminPath` → `mxadminPath`
- 错误消息 `SVN` → `MX`，`@cloudcad/svn-version-tool` → `@cloudcad/mx-version-tool`
- `getPlatformInfo` 返回值属性 `svnPath` → `mxPath`，`svnadminPath` → `mxadminPath`

**`mxcmd.js`（原 svncmd.js）**：
- 所有 `require('./svnXxx')` → `require('./mxXxx')`
- 所有导出键名 `svnXxx` → `mxXxx`
- `checkSvnAvailable` → `checkMxAvailable`
- `checkSvnAvailableSync` → `checkMxAvailableSync`

**`mxcheckout.js`**：
- `require('./svnpath')` → `require('./mxpath')`
- `require('./svn-executor')` → `require('./mx-executor')`
- `svnCheckout` → `mxCheckout`（函数名 + exports）
- `svnPath` → `mxPath`

**`mxadd.js`**、**`mxcommit.js`**、**`mxlist.js`**、**`mxadmincreate.js`**、
**`mximport.js`**、**`mxdelete.js`**、**`mxlog.js`**、**`mxcat.js`**、
**`mxpropset.js`**、**`mxupdate.js`**、**`mxcleanup.js`**：
- require 路径更新：`./svnXxx` → `./mxXxx`
- 函数名 `svnXxx` → `mxXxx`
- 变量 `svnPath` → `mxPath`
- 注释中 `SVN` → `MX`
- 临时文件名 `svn-commit-*.txt` → `mx-commit-*.txt`（svncommit.js）
- 临时文件名 `svn-import-*.txt` → `mx-import-*.txt`（svnimport.js）
- 临时文件名 `svn-prop-*.txt` → `mx-prop-*.txt`（svnpropset.js）

**`test.js`**：
- `require('./svncmd')` → `require('./mxcmd')`
- 函数名 `svnXxx` → `mxXxx`
- 注释/变量中的 `SVN` → `MX`

### 1.4 `package.json`

```json
{
  "name": "@cloudcad/mx-version-tool",
  "description": "MX 版本控制工具包，提供 MX 仓库管理、检出、添加、提交等操作",
  "main": "mxcmd.js",
  "keywords": ["mx", "version-control"],
  "files": [
    "mxcmd.js",
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
    "index.d.ts",
    "README.md"
  ]
}
```

### 1.5 `index.d.ts`

全局替换：
- `SvnCallback` → `MxCallback`
- `svnCheckout` → `mxCheckout`（函数名 + 注释）
- `svnAdd` → `mxAdd`
- `svnCommit` → `mxCommit`
- `svnDelete` → `mxDelete`
- `svnList` → `mxList`
- `svnadminCreate` → `mxadminCreate`
- `svnImport` → `mxImport`
- `svnLog` → `mxLog`
- `svnCat` → `mxCat`
- `SvnCheckResult` → `MxCheckResult`
- `PlatformInfo.svnPath` → `PlatformInfo.mxPath`
- `PlatformInfo.svnadminPath` → `PlatformInfo.mxadminPath`
- `SvnCheckCallback` → `MxCheckCallback`
- `checkSvnAvailable` → `checkMxAvailable`
- `checkSvnAvailableSync` → `checkMxAvailableSync`
- `svnPropset` → `mxPropset`
- `svnUpdate` → `mxUpdate`
- `svnCleanup` → `mxCleanup`
- 注释中 `SVN` → `MX`

### 1.6 `README.md`

- 标题 `@cloudcad/svn-version-tool` → `@cloudcad/mx-version-tool`
- 所有 `SVN` → `MX`
- 所有函数名 `svnXxx` → `mxXxx`
- 安装命令 `pnpm add @cloudcad/svn-version-tool` → `@cloudcad/mx-version-tool`
- 所有代码示例更新
- 注意事项中 `subversion/` → `mxversion/`

### 1.7 `AGENTS.md`（包内）

- 所有 `SVN` → `MX`
- 所有 `svn` → `mx`
- `src/svn/` → `src/mx/`
- 包名、命令等全部更新

---

## 阶段 2：Runtime 重命名

### 2.1 目录改名

```
runtime/windows/subversion/ → runtime/windows/mxversion/
runtime/linux/subversion/   → runtime/linux/mxversion/   (构建时生成)
```

### 2.2 Windows 可执行文件改名（11 个）

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

DLL 文件保留原名（有内部名称依赖，改名会导致加载失败）：
- `libapr-1.dll`、`libaprutil-1.dll`、`libcrypto-3-x64.dll`、`libexpat.dll`、`libssl-3-x64.dll`
- `libsvn_client-1.dll`、`libsvn_delta-1.dll`、`libsvn_diff-1.dll`、`libsvn_fs-1.dll`
- `libsvn_fs_fs-1.dll`、`libsvn_fs_util-1.dll`、`libsvn_fs_x-1.dll`、`libsvn_ra-1.dll`
- `libsvn_ra_local-1.dll`、`libsvn_ra_serf-1.dll`、`libsvn_ra_svn-1.dll`
- `libsvn_repos-1.dll`、`libsvn_subr-1.dll`、`libsvn_wc-1.dll`
- `sqlite3.dll`、`zlib1.dll`

### 2.3 `runtime/docker/Dockerfile.svn`

- 注释 `../linux/subversion` → `../linux/mxversion`
- 注释 `runtime/linux/subversion/` → `runtime/linux/mxversion/`
- `cp /usr/bin/svn .` → `cp /usr/bin/svn . && mv svn mx`
- `cp /usr/bin/svnadmin .` → `cp /usr/bin/svnadmin . && mv svnadmin mxadmin`
- `cp /usr/bin/svnlook .` → `cp /usr/bin/svnlook . && mv svnlook mxlook`
- `cp /usr/bin/svnsync .` → `cp /usr/bin/svnsync . && mv svnsync mxsync`
- `cp /usr/bin/svnversion .` → `cp /usr/bin/svnversion . && mv svnversion mxversion`
- `cp /usr/bin/svnserve .` → `cp /usr/bin/svnserve . && mv svnserve mxserve`
- `for b in svn svnadmin svnlook svnsync svnversion svnserve` → `for b in mx mxadmin mxlook mxsync mxversion mxserve`

### 2.4 `runtime/scripts/extract-linux-runtime.js`

13 处修改：
- 注释 `--svn` → `--mx`，`Subversion` → `MxVersion`
- 参数解析 `--svn` / `--subversion` → `--mx` / `--mxversion`
- 组件名 `'svn'` → `'mx'`
- 子目录映射 `'subversion'` → `'mxversion'`
- 函数名 `extractSvnYum` → `extractMxYum`，`extractSvnApt` → `extractMxApt`
- 二进制列表 `['svn', 'svnadmin', ...]` → `['mx', 'mxadmin', ...]`
- 系统包名 `subversion` 保留不变（apt-get install 需要）
- 提取后为二进制添加 mv 改名步骤

---

## 阶段 3：后端代码更新

### 3.1 `version-control.module.ts`

```typescript
import { MxVersionControlProvider } from './providers/mx-version-control.provider';
// ...
providers: [
  MxVersionControlProvider,
  {
    provide: VERSION_CONTROL_TOKEN,
    useExisting: MxVersionControlProvider,
  },
],
```

### 3.2 `providers/svn-version-control.provider.ts` → `mx-version-control.provider.ts`

- 文件名：`svn-version-control.provider.ts` → `mx-version-control.provider.ts`
- import: `from '@cloudcad/svn-version-tool'` → `from '@cloudcad/mx-version-tool'`
- 所有导入的函数名：`svnCheckout` → `mxCheckout` 等（12 个）
- `promisify(svnXxx)` → `promisify(mxXxx)`
- 异步变量名：`svnCheckoutAsync` → `mxCheckoutAsync` 等
- 类名：`SvnVersionControlProvider` → `MxVersionControlProvider`
- Logger name: `SvnVersionControlProvider.name` → `MxVersionControlProvider.name`
- 所有日志字符串 `SVN` → `MX`
- 所有注释 `SVN` → `MX`
- 属性名 `svnRepoPath` → `mxRepoPath`（如果 ConfigService 的键也改了，需确认）

### 3.3 `linux-init.service.ts`

- import: `from '@cloudcad/mx-version-tool'`
- `checkSvnAvailableSync` → `checkMxAvailableSync`
- `platformInfo.svnPath` → `platformInfo.mxPath`
- 日志/错误消息 `SVN` → `MX`

### 3.4 `packages/backend/package.json`

```json
"@cloudcad/mx-version-tool": "workspace:*"
```

### 3.5 测试文件（4 个）

| 文件 | 变更 |
|------|------|
| `test/mocks-setup.ts:1` | `jest.mock('@cloudcad/mx-version-tool', ...)` |
| `test/integration/cad-save-version.integration.spec.ts:52` | `jest.mock('@cloudcad/mx-version-tool', ...)` |
| `test/integration/cad-save-as-duplicate-version-chain.integration.spec.ts:59` | `jest.mock('@cloudcad/mx-version-tool', ...)` |
| `test/integration/workflow-2-save-svn-version.integration.spec.ts:52` | `jest.mock('@cloudcad/mx-version-tool', ...)` |

---

## 阶段 4：构建脚本和 Dockerfile

### 4.1 `docker/Dockerfile`

| 行号 | 原内容 | 新内容 |
|------|--------|--------|
| 9 | `subversion`（apk 包名） | 保留不变（系统包名） |
| 19 | `packages/svnVersionTool/package.json` | `packages/mx-version-tool/package.json` |
| 40 | `复制 svnVersionTool 源代码` | `复制 mx-version-tool 源代码` |
| 41 | `COPY packages/svnVersionTool ./packages/svnVersionTool` | `COPY packages/mx-version-tool ./packages/mx-version-tool` |
| 97 | `subversion`（apk 包名） | 保留不变 |
| 105 | `packages/svnVersionTool/package.json` | `packages/mx-version-tool/package.json` |
| 112 | `@cloudcad/svn-version-tool` | `@cloudcad/mx-version-tool` |
| 118 | `@cloudcad/svn-version-tool` | `@cloudcad/mx-version-tool` |
| 119 | `@cloudcad/svn-version-tool` | `@cloudcad/mx-version-tool` |
| 124 | `复制 svnVersionTool 源代码` | `复制 mx-version-tool 源代码` |
| 125 | `COPY packages/svnVersionTool ./packages/svnVersionTool` | `COPY packages/mx-version-tool ./packages/mx-version-tool` |

### 4.2 `runtime/docker/Dockerfile.linux-deploy`

| 行号 | 原内容 | 新内容 |
|------|--------|--------|
| 47 | `subversion`（apt 包名） | 保留不变 |
| 54 | `subversion`（dnf 包名） | 保留不变 |
| 70 | `subversion`（yum 包名） | 保留不变 |
| 100 | `packages/svnVersionTool/package.json` | `packages/mx-version-tool/package.json` |
| 109 | `COPY packages/svnVersionTool ./packages/svnVersionTool` | `COPY packages/mx-version-tool ./packages/mx-version-tool` |

### 4.3 `scripts/pack-offline.js`（根 + runtime）

| 行号 | 原内容 | 新内容 |
|------|--------|--------|
| 641/608 | `src: 'packages/svnVersionTool'` | `src: 'packages/mx-version-tool'` |
| 642/609 | `dest: 'packages/svnVersionTool'` | `dest: 'packages/mx-version-tool'` |

### 4.4 `scripts/pack-docker.js`（根 + runtime）

| 行号 | 原内容 | 新内容 |
|------|--------|--------|
| 116 | `src: 'packages/svnVersionTool'` | `src: 'packages/mx-version-tool'` |
| 116 | `dest: 'packages/svnVersionTool'` | `dest: 'packages/mx-version-tool'` |

---

## 阶段 5：pnpm-lock.yaml

运行 `pnpm install` 重新生成，自动更新：
- `@cloudcad/svn-version-tool` → `@cloudcad/mx-version-tool`
- `packages/svnVersionTool` → `packages/mx-version-tool`

pnpm-workspace.yaml 不需要修改（使用 `packages/*` 通配符自动涵盖新目录名）。

---

## 阶段 6：项目文档

| 文件 | 行号 | 原内容 | 新内容 |
|------|------|--------|--------|
| `AGENTS.md`（根） | 29 | `packages/svnVersionTool` 等 | `packages/mx-version-tool` |
| `CLAUDE.md`（根） | 32 | `svnVersionTool/` | `mx-version-tool/` |
| `README.md`（根） | 125 | `svnVersionTool/` | `mx-version-tool/` |
| `PROJECT_OVERVIEW.md` | 49, 181 | `svnVersionTool` | `mx-version-tool` |
| `DEVELOPMENT_GUIDE.md` | 160 | `svnVersionTool/` | `mx-version-tool/` |
| `packages/backend/AGENTS.md` | 91 | `svnVersionTool` | `mx-version-tool` |

---

## 验证步骤（完成后）

1. `git status` 确认所有改名文件
2. `pnpm install` 更新 lockfile
3. `pnpm type-check` 检查类型错误（后端）
4. `pnpm test` 运行测试
5. `pnpm build` 确认构建通过
