# PM2 黄金路径验收 Checklist

> **用途**：重构（拆分/迁移/修复）每阶段结尾的强制回归门槛。
> **红线**：以下任何一项失败 = 该阶段不可交付，必须回滚或修复。
> 双平台：Windows 部署机 + Linux 部署机都要过。

## 前置说明

- **全量部署包**：`cloudcad-deploy-<版本>-<日期>-<平台>`（含 runtime 二进制 + 完整依赖 store，**新部署用**）
- **升级包**：`cloudcad-upgrade[-private]-<版本>-<日期>-<平台>`（业务产物全集，**不含 store**，复用目标机既有部署包 store 离线补装；前置：目标机已用同平台部署包部署过）
- 包内 `.deploy` 标记 → 启动脚本进 `deploy --skip-build` 路径
- PM2 后台模式 = 生产基线（本 checklist 守护的路径）
- rev4：**离线开发包已砍**，仅部署包 + 升级包两种产物

## V1 — 全量包首次部署（PM2）

- [ ] 解压全量包到干净目录
- [ ] `./start.sh`（Linux）/ `start.bat`（Windows）
- [ ] setupOffline 依赖安装成功（无联网报错）
- [ ] 首次部署：自动生成密码并终端展示（数据库/Redis/管理员）
- [ ] 选择 `[1] PM2 后台运行`
- [ ] 基础服务启动：postgresql / redis / cooperate / config-service
- [ ] 端口就绪：`5432`、`6379`、`3091`、`3002`
- [ ] 数据库迁移成功（migrate deploy 无报错）
- [ ] 应用服务启动：backend(3001) / frontend(3000)
- [ ] 健康检查通过：`GET /api/v1/health/live` = 200
- [ ] 前端页面可访问：`http://localhost:3000`
- [ ] 图纸版本部署后验证通过
- [ ] 浏览器自动打开

## V2 — stop → start（日常运维）

- [ ] `./stop.sh`（Linux）/ `stop.bat`（Windows）
- [ ] `pm2 list` 为空（或所有服务 stopped 后 delete）
- [ ] 端口全部释放：3001 / 3000 / 5432 / 6379 / 3002 / 3091
- [ ] 再次 `./start.sh` → 服务完整恢复
- [ ] 恢复后 `pm2 list` 显示全部服务 online

## V3 — 升级包部署（同布局）

- [ ] 旧版本目标机 + 新升级包解压覆盖
- [ ] 启动后依赖重装检测：lockfile 未变 → 跳过；变了 → 自动 `install --offline --prod`
- [ ] 数据库迁移幂等（重复部署不报错）
- [ ] `.env` 只增不覆盖已有配置
- [ ] 服务恢复，数据（data/）与用户文件不受影响

## V4 — 前台模式

> 仅当 D1=A（前台保留）时验收
> 依据 Q0 决策（基础服务统一 PM2 托管）：前台模式仅应用层走前台 spawn，
> 基础服务（PG/Redis/协同/配置中心）由 PM2 托管**保持常驻**，Ctrl+C 只停应用层。
> 全部停止请用 `cloudcad.sh stop`（stopInfrastructure）。

- [ ] 选择 `[2] 前台运行`
- [ ] 应用层（backend/frontend）前台 spawn 并显示横幅
- [ ] 基础服务（PG/Redis/协同/配置中心）由 PM2 托管 online（`pm2 list` 确认）
- [ ] 部署收尾验证（图纸版本/changelog）在**服务运行期间**执行完成
- [ ] Ctrl+C 后应用层退出：`tasklist`/`ps` 确认 backend/frontend 前台进程已停
- [ ] Ctrl+C 后基础服务仍由 PM2 托管（`pm2 list` 确认 PG/Redis/协同/配置中心仍 online）
- [ ] 无孤儿**应用层**进程（进程表残留 node backend/frontend）

## V5 — verify-deploy 全流程

- [ ] `node runtime/scripts/verify-deploy.js` 7 步全绿
- [ ] 步骤顺序：setup-offline → install-deps → start-infra → db-migration → start-backend → start-frontend → final-verification

## V6 — 打包侧

> rev4：离线开发包已砍，仅部署包 + 升级包。

- [ ] `pack:offline:win`（即 `--deploy`）产物清单审计：runtime 必需文件齐全、无开发垃圾
- [ ] `pack:linux-deploy` 产物正常
- [ ] `pack:upgrade:win` 产物为业务产物全集，**不含 `.pnpm-store-deploy`**（路线 B，复用目标机既有部署包 store 离线补装）
- [ ] 包内 `.deploy` 标记存在
- [ ] 包内 `runtime/ecosystem.config.js` 完整
- [ ] manifest 清单单一事实源正确（`scripts/pack-lib/manifest.js`：deploy/upgrade 共享条目一致，`pack-offline.js` 委托 manifest 无重复硬编码）

## V7 — CLI 冒烟

- [ ] `./cloudcad.sh --help` 输出与基线一致（拆分后逐字节 diff）
- [ ] 全部子命令可 dispatch：dev / deploy / start / stop / migrate / seed / db:backup / db:restore / db:list / db:cleanup / init / status / logs / version:check / version:verify
- [ ] 未知命令报错提示正常

## V8 — 升级包部署专项（路线 B：不带 store）

> rev4：D7 取消迁 packages/，无跨布局迁移；V8 改为验证升级包"不带 store 复用目标机既有 store"的部署语义。

- [ ] 目标机已用**同平台部署包**部署过（首次部署必须部署包打底，store 已存在）
- [ ] 升级包解压覆盖后启动，**不联网**依赖重装成功（`shouldReinstallDependencies` 检测 `.deploy-lock-hash` vs 新 `pnpm-lock.yaml`）
- [ ] 依赖复用既有 `.pnpm-store-deploy` 离线补装（lockfile 变化时 `install --offline`）
- [ ] `prisma migrate deploy` 幂等执行（无新 migration 时跳过，有新 migration 时应用）
- [ ] `.env` 只增不覆盖，`data/` 用户数据不受影响
- [ ] 升级包目录内确认**无** `.pnpm-store-deploy`、无 runtime 二进制
- [ ] 全流程 V1-V3 在同机复跑通过

## 记录

每阶段跑完，在此文件尾部追加：
```
## <日期> <阶段> <平台>
- 结果：✅/❌（失败项：...）
- 备注：
```
