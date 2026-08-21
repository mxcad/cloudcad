# 0046 — 离线增量升级包：解压即升级 + 固定正向子集 + 无条件全量 store
**Status**: accepted

私有化部署客户更新版本时只有两个选择：全量部署包（含 runtime 二进制 + 完整依赖 store，分发体积大）或 Docker 镜像重建（构建慢），都无法快速更新上线。决定引入第三种交付物「增量升级包」：只含变更产物（各包 dist、全量 prisma migrations、scripts、完整生产 store），**解压覆盖即升级**，客户心智与全量包完全统一（解压 + 运行 start 自动检测），无独立升级脚本、无版本号机制、无备份回滚状态机。

> 修订记录：store 策略经历两版——①增量 diff 提取（基线存档 + 相对基线新增文件），实测全量 store 7z 后仅 ~120MiB，且存在「基线更新后跳版本缺中间依赖」结构性缺陷；②条件性全量（lockfile 未变不带 store），仍需 hash 分支判断；最终定为 ③**无条件全量**（始终携带完整 store）：流程恒定 = 幂等同步 store + 压缩，无分支、每个包自包含可控，代价仅是包体固定 ~180MiB（仍远小于全量部署包）。

**Decision**

1. **服务形态**：仅服务非 Docker 离线部署（start.bat/start.sh + runtime 二进制）。Docker 场景更新慢的根因是镜像构建，正解是构建层缓存/挂载 dist volume/预构建镜像，不属于升级包职责。
2. **内容粒度**：正向清单全量覆盖（dist 整体携带），不做文件级二进制 diff——diff 需要 base 版本精确匹配，脆弱且省不下多少体积。
3. **依赖处理（修订为无条件全量）**：升级包**始终携带完整 `.pnpm-store-deploy`**（镜像层以 `--store-dir` 直接写入，含 devDependencies 超集——目标机 `install --offline --prod` 只解析生产依赖闭包，多余包无影响；实测 7z 后约 150MiB 级）。打包时 `syncDeployStore()` 幂等同步：store 标记 `variant:lockfileHash` 一致则秒级跳过 install，不一致则增量安装（store 缓存命中只下载新增，不清 node_modules、不 build）。目标机解压合并（内容寻址追加语义，天然安全）后 `install --offline --prod` **零前提成功**，任何旧版本/任意跳版本均可升级。
   - 关键陷阱（已修复）：pnpm 在 node_modules 已完整时会跳过写 store——镜像内"单独 prod store 缓存层"实际为空，会导致容器内每次全量下载；正确做法是主 install 层直接用 `--store-dir` 写入。
   - 标记必须带 **variant 前缀**：`pnpm-lock.yaml` 对 oss/private 相同，但 private store 多 `@cloudcad/impl-mx` 依赖，纯 lockfile hash 无法区分 → oss→private 切换时误判（该缺陷同时修复了 `prepareDeployStore` 的同类问题）
   - 平台约束：store 原生依赖与打包环境平台强相关，**Linux 升级包必须在 Linux 容器内打包**（`pack:linux-upgrade`，复用 `Dockerfile.linux-deploy` 镜像层缓存的 store），跨平台/`--all` 直接拒绝
4. **DB 迁移**：升级包**永远携带全量 migrations 目录**（不是增量）——`migrate deploy` 要求目录与 `_prisma_migrations` 表自洽，客户机缺中间迁移目录会报错；cli.js 部署流程每次幂等执行 migrate deploy，新迁移自动应用。
5. **版本模型**：无版本号文件、无防降级校验、无基线范围——与全量包"覆盖语义"一致，不做任何版本状态机；manifest 的 `targetVersion` 仅写入升级日志供审计，不参与逻辑判断。
6. **失败语义**：不备份、不自动回滚；7z 解压 CRC 挡住损坏包，覆盖中断（如断电）靠重新下发覆盖兜底；migrate 失败即中止并提示人工介入。
7. **客户文件边界**：升级包永不包含配置与用户数据（`.env*`、前端 `ini/*.json`、`brand/` 资源、`data/`、SVN 仓库、uploads）；前端 dist 内嵌配置复用 `renameFrontendConfigFiles()` 改名 `.example`，防止覆盖客户已改配置。
8. **应用机制**：无独立升级脚本，**解压即升级**；目标机 `start` → cli.js bootstrap 自动完成依赖重装检测（`install --offline --prod`）、prisma migrate deploy、配置增量合并（config-updater）。
9. **打包生成**：固定正向子集 + 无条件全量 store，不做"与上次发布"的真实 diff；`pack-offline.js` 新增 `--upgrade` 模式（`pnpm pack:upgrade:win` 等），命名 `cloudcad-upgrade[-private]-<version>-<date>-<platform>.7z`（Linux 为 `.tar.gz`）。

**Rejected options**

- **文件级二进制 diff（bsdiff 等）**：base 版本必须精确匹配打包基线，客户版本漂移即失效；dist 量级本身可接受，省下的流量不值得引入脆弱性。
- **store 增量 diff 提取（首版设计）**：需维护打包机基线存档、diff 提取与累积模型，且基线随全量包更新后存在「跳版本缺中间依赖」结构性缺陷；全量 store 实测仅 ~120MiB，增量省下的体积不值得这套复杂度。
- **条件性全量 store（第二版设计）**：lockfile 未变时不带 store 可省包体，但引入 hash 分支判断与「目标机状态未知」的推理负担；每次升级包固定流程（幂等同步 + 压缩）更简单、每个包自包含可控。
- **version.json + 防降级校验**：现有全量包从不比较版本（`.deploy` 标记 + dist 存在性检测即是全部机制），引入版本状态机破坏一致性；"旧包覆盖"风险在产品上已被接受。
- **备份-还原回滚 / A-B 双目录**：引入备份状态机或改动全部启动脚本路径解析，破坏"解压即升级"心智；离线现场兜底 = 重新下发覆盖。
- **独立升级脚本**：cli.js 已具备 start/stop/migrate/pg 管理基础设施，升级 = 编排现有函数，无需新脚本语言与双平台实现。
- **与上次发布做真实 diff 生成最小包**：需要发布基线对比机制；而 dist/migrations 固定全量后 store 亦固定全量，发布对比是纯负担。

**Status**: accepted

**Cross-references**
- CONTEXT.md「增量升级包（Incremental Upgrade Package）」「私有化部署（Private Deployment / TOB）」
- `scripts/pack-offline.js`（`--upgrade` 模式；`syncDeployStore` 幂等同步 + `variant:hash` 标记；`renameFrontendConfigFiles` 复用；`.deploy` 标记语义）
- `scripts/pack-linux-deploy.js` + `runtime/docker/Dockerfile.linux-deploy`（Linux 升级包容器通道，`PACK_MODE=upgrade`）
- `runtime/scripts/cli.js` + `runtime/scripts/setup-offline.js`（目标机 bootstrap：依赖重装检测 + migrate deploy + 配置增量合并）
- `runtime/README.md`（离线部署指南，升级包使用说明）
