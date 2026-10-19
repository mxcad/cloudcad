# v1 打包统一 —— 待办跟踪（拆出项）

> 背景：`docs/packaging-unification-plan.md` 的 **v1（步骤 1–8，#434–#439，契约 C1–C12）**
> 代码已全部落地并提交（`09b2d23` 打包统一 + `c909003` 口令三分支 + `07d3c27` 修复口令回归与 C7 收尾
> + `0954d92` 修正 pack-manifest 陈旧断言）。验收矩阵 V1–V8 中，**代码与可自主验证的部分已闭环**
> （V2 裸机 linux 断网绿、V3 docker linux 已验、V1 裸机 windows 出包并实证含口令修复、单测全绿）。
>
> 下列 3 项属于**外向 / 依赖专属资源**的验证动作，无法在开发会话内自主完成，故从 v1 验收范围拆出、
> 单独跟踪，避免持续阻塞「v1 代码已完成」这一事实的确认。

## 待办清单

### F1 · V1 Windows 裸机包断网验证
- **动作**：`node scripts/verify-windows-deploy.js`（构建 `servercore:ltsc2022` 基础镜像 + `--network none` 断网跑 `verify-deploy.js` 全服务健康检查）。
- **阻塞**：本机 Docker 处 `desktop-linux` 容器模式，无 `desktop-windows` context、无 CLI 切换路径；须 **Docker Desktop UI → Settings → General → 勾选 Use Windows containers → Restart**。
- **降级路径（ADR-0059）**：无 Windows 容器支持时 = Linux 硬门禁（已绿，V2）+ Windows 手动验证。
- **前置产物**：`release/cloudcad-deploy-1.0.0-20261019-windows.7z`（296MB，已解出 `secret-generator.js` 实证含 `generateStrongPassword()` 修复）。
- **负责人 / 触发**：用户切好 Docker Windows 模式后由会话执行，或用户在 Windows 机器手动跑 `start.bat` 验证。

### F2 · V7 CI（release.yml `build-linux-docker` job）
- **动作**：触发 CI 跑 docker linux 打包 + 断网验证 job。
- **阻塞**：需 `v*` tag 或 `workflow_dispatch`，属外向 release 动作；且 gitea↔github 长期分叉，不自主触发。
- **前置**：`release.yml` 的 `build-linux-docker` job 已就绪（v1 代码已含）。
- **负责人 / 触发**：用户打 tag 或在 CI 界面手动 dispatch。

### F3 · V5/V6 真实部署验证
- **动作**：V5 旧版兼容（老包在目标机可升级/共存）、V6 运维入口（`cloudcad` CLI 在真实部署包上可用）。
- **现状**：核心逻辑已被 runtime-unit 单测覆盖（全绿）；**真实部署**部分需目标机 / fixture。
- **阻塞**：无可用目标机 / fixture。
- **负责人 / 触发**：提供一台真实部署目标机或 fixture 后执行。

## 备注
- 本文件为本地跟踪；按仓库约定（`docs/agents/issue-tracker.md`）这些票**应登记到 Gitea `qjx/cloudcad`**。
  登记时 Gitea API 返回 401（Git Credential Manager 里存的凭据对 API 无效，疑似口令/token 已变更），
  需用户刷新凭据（建议建 access token 后 `git credential-manager-core store`）或由用户在 Gitea Web 手动建票。
- 3 项全部关闭后，v1 验收矩阵 V1–V8 即全绿。
