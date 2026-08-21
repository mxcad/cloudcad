# scripts/ 目录说明

本目录存放 CloudCAD 的**打包/部署、代码生成、图库工具与测试脚本**。
运行时代码（启动/停止/运维 CLI）位于 `runtime/scripts/`，二者职责分离。

---

## 目录结构

```
scripts/
├── pack-lib/                  # 打包清单单一事实源（供 pack-offline.js 复用）
│   ├── manifest.js            # 部署包/升级包正向清单（P9 收敛双清单硬编码）
│   ├── packignore.json        # 打包排除配置（JSON，无需构建，改后即生效）
│   └── packignore.js          # 排除规则解析/匹配（被 pack-offline.js / pack-docker.js 引用）
├── e2e/                       # 端到端登录流程测试
│   ├── fixtures/
│   └── test-login-flow.py     # Playwright 登录流测试
├── pack-offline.js            # 统一打包：部署包 / 升级包
├── ...                        # 其余脚本见下方分类
```

---

## 一、打包 / 部署（核心，package.json 已注册）

| 脚本 | 用途 | npm/pnpm 命令 |
|------|------|--------------|
| `pack-offline.js` | 统一打包入口（部署包 / 升级包，含 Windows/Linux/oss/private 变体） | `pack:offline*`、`pack:upgrade*` |
| `pack-lib/manifest.js` | 打包清单单一事实源，被 `pack-offline.js` 引用 | —（库文件） |
| `pack-docker.js` | Docker 部署包打包 | `pack:docker` |
| `pack-linux-deploy.js` | Linux 部署包打包（Docker 容器内执行） | `pack:linux-deploy*`、`pack:linux-upgrade*` |
| `pack-linux-local.sh` | 本地 Linux 打包（无需 Docker） | `pack:linux-local` |
| `pack-menu.js` | 打包交互菜单（避免记忆命令参数） | `pack:menu` |
| `verify-linux-deploy.js` | Linux 部署包断网验证 | `verify:linux*` |

**打包链路运行时依赖（未单独注册命令，但被上述脚本调用）：**
- `extract-linux-runtime.js` —— 提取 Linux 运行时组件（被 `Dockerfile.linux-deploy` 与 `pack-linux-local.sh` 调用）
- `verify-deploy-package.sh` —— **已废弃**（无调用点，端口已按生产修正；功能由 `runtime/scripts/verify-deploy.js` 与 `verify-linux-deploy.js` 取代）

### 打包排除配置（`pack-lib/packignore.json`）

`pack-offline.js` 与 `pack-docker.js` 的目录复制统一应用 `pack-lib/packignore.json`
（类 `.gitignore` 但极简）过滤不打包内容，尤其用于排除 **mxcad 保密图纸（`.mxweb`）**。
纯 JSON 配置，**无需构建，改后下次打包即生效**。

```json
{
  "exclude": {
    "dirs": ["runtime/windows/mxcad/tool", "runtime/linux/mxcad/tool"],
    "files": []
  },
  "keepEmpty": {
    "dirs": ["runtime/windows/mxcad/files", "runtime/linux/mxcad/files"],
    "files": []
  }
}
```

- `exclude.dirs` / `exclude.files`：**完全排除**——目录/文件不打包，目录本身也不创建。
- `keepEmpty.dirs`：**保留空目录**——目录会创建（运行时依赖路径不缺失），但内部文件不打包。
- `keepEmpty.files`：单个文件不打包（父目录仍创建）。
- 路径统一用 `/`，相对仓库根；目录配置命中该目录及其所有子路径。

> 配置键名带 `comment` 仅作文档提示，会被忽略；实际生效键为 `exclude` 与 `keepEmpty`。

## 二、代码生成 / 契约门禁

| 脚本 | 用途 | 命令 / 调用方 |
|------|------|--------------|
| `generate-frontend-permissions.js` | 从 Prisma Schema 生成前端权限常量 | `generate:frontend-permissions` |
| `check-generated-clean.js` | 契约门禁：校验 API SDK / MSW handler 生成产物无未提交变更 | CI（#296） |

## 三、图库 / 缩略图工具（一次性运维工具）

| 脚本 | 用途 | 命令 / 调用方 |
|------|------|--------------|
| `batch-import-library.js` | 批量导入图库（支持断点续传） | 手动运维 |
| `export-public-library.js` | 导出公开图库 | 手动运维 |
| `export-thumbnails.js` | 导出缩略图（打包 zip） | 手动运维 |
| `upload-thumbnail.js` | 批量上传缩略图 | 手动运维 |
| `test-thumbnail.js` | 缩略图生成/重生成测试 | 手动运维 |

> 运行产物（`thumbnail-progress.json`、`upload-progress.json`、`upload-failed.log`）为脚本运行残留，已从仓库移除，属 `.gitignore` 应忽略范畴。

## 四、配置 / 品牌 / 版权 / 工程工具

| 脚本 | 用途 | 命令 / 调用方 |
|------|------|--------------|
| `add-copyright-header.js` | 为 TS/JS 源码添加/检查版权注释头 | 手动运维 |
| `clean-tsc-artifacts.js` | 清理源码目录中 tsc 生成的 `.d.ts`/`.js` 产物 | 手动运维 |
| `test-config-updater.js` | 配置增量更新逻辑测试 | 手动运维 |
| `test-config-integration.js` | 配置增量更新集成测试（模拟真实目录结构） | 手动运维 |
| `test-brand-resources.js` | 品牌资源文件增量更新测试 | 手动运维 |
| `autotest.bat` | Windows 定时自动测试流水线（拉取→测试→记录） | Windows 计划任务 |

---

## 孤儿脚本识别（未在 package.json 注册，仅手动/被引用）

以下脚本未被 `package.json` 的 `scripts` 注册，但均有真实用途或被其他脚本/文档引用，
**不要删除**：

- `extract-linux-runtime.js` —— 被打包链路调用
- `check-generated-clean.js` —— 被 CI 门禁调用
- 图库/缩略图工具与配置测试脚本（第三节、第四节大部分）—— 一次性运维工具
- `autotest.bat` —— Windows 计划任务入口

---

## 维护约定

1. **打包清单**统一维护在 `pack-lib/manifest.js`，勿在 `pack-offline.js` 内硬编码双清单（P9）。
2. **运行残留文件**（进度 json / 日志）不应提交入库，使用后清理或加入 `.gitignore`。
3. **打包/部署脚本**改动前必读 `docs/deployment-runtime-refactor-plan.md` 与
   `docs/adr/0056-deployment-runtime-packager-modularization.md`。
