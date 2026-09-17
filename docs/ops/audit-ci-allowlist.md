# 依赖漏洞门禁 allowlist 跟踪表（等保 #423）

> **门禁**：`.github/workflows/ci.yml` 的 `dependency-scan` job 在每次 push/PR 运行 `npx -y audit-ci@7.1.0 --config audit-ci.json`（版本钉死，与本地验证版本一致；升级须同步复核 allowlist 兼容性。根目录单跑，`--high` 阈值 + `--skip-dev` 只查生产依赖，无需 `pnpm install`，秒级）。
> **拦截语义**：high+ 漏洞**不在** allowlist → CI 红（阻断合入）；在 allowlist 内 → 不红（豁免跟踪）。moderate/low 不拦截，仅在本表跟踪。
> **allowlist 载体**：根目录 `audit-ci.json` 的 `allowlist` 数组（GHSA 标识符，audit-ci 新版要求 GHSA 而非数字 ID）。
> **复核周期**：每 30 天（制度见 [vuln-management.md](vuln-management.md) 例行检查节）。本表「复核截止日」到期即复核：能消的消（升级后从 allowlist 移除），不能消的更新豁免理由与新的截止日。
> **基线**：day-1（2026-08-31）45 条 advisory / 43 个 GHSA；B1 清理后剩 18 条 / 17 个 GHSA（消 26 个 GHSA）；B2 清理后（2026-09-01）剩 8 条 / 8 个 GHSA（再消 9 个 GHSA；剩余 8 条全部为上游阻塞/无修复版本）。

## 豁免流程（增删 allowlist）

1. **新增豁免**：high+ 漏洞暂时无法修复时，在 `audit-ci.json` 的 `allowlist` 加入 GHSA，并在本表登记（受影响包/修复方向/复核截止日/豁免理由）；**禁止无登记直接加 allowlist**（CI 不校验登记，靠 code-review 与 30 天复核兜底）。
2. **移除（收敛）**：漏洞修复（升级依赖/移除死依赖）后，从 `audit-ci.json` 移除对应 GHSA 并更新本表状态为「已消除」；每消一批提交一次，保持收缩轨迹可见（git 历史即台账）。
3. **红线**：allowlist 只豁免「已知存量」，**新增依赖引入的 high 漏洞一律不得进 allowlist**——CI 红即阻断，必须修复或回滚依赖。
4. **临期提醒**：复核截止日前 3 天，安全管理员（SECURITY_ADMIN）在本表对应行发起复核；逾期未复核的行在制度评审时点名。

## allowlist 跟踪表

状态：☑ 豁免中（在 allowlist）　✅ 已消除（已从 allowlist 移除）
批次：B1=传递依赖/直接小版本升级（已完成）　B2=业务面定点升级 multer/nodemailer/uuid（已完成）　E=引擎/上游阻塞（等上游）　N=无修复版本

### 豁免中（8 个 GHSA，当前 allowlist 全量；全部为 #446 上游阻塞/无修复版本）

| GHSA | 级别 | 受影响包 | 修复方向 | 批次 | 复核截止日 | 状态 |
|------|------|----------|----------|------|-----------|------|
| GHSA-fq6p-x6j3-cmmq | high | three@0.113.2（mxcad/mxdraw 引擎 peer，frontend_mobile） | 引擎黑盒约束，等 mxcad 引擎升级 three | E | 2026-09-30 | ☑ |
| GHSA-pfq8-rq6v-vf5m | high | html-minifier@3.5.21（经 art-template@4.13.4，@voerkai18n 链） | 无修复版本（包已归档），根因 art-template，等 @voerkai18n 升级 | N | 2026-09-30 | ☑ |
| GHSA-92pp-h63x-v22m | moderate | @hono/node-server（prisma→@prisma/dev 传递） | 等 prisma 上游升级（@prisma/dev 0.24.3） | E | 2026-09-30 | ☑ |
| GHSA-frvp-7c67-39w9 | moderate | @hono/node-server（同上） | 同上 | E | 2026-09-30 | ☑ |
| GHSA-8j4g-w8fx-2239 | moderate | hono（@prisma/dev 传递） | 等 prisma 上游升级 | E | 2026-09-30 | ☑ |
| GHSA-f23p-vx2j-j53r | moderate | hono（同上） | 同上 | E | 2026-09-30 | ☑ |
| GHSA-54fx-42gc-7vw4 | moderate | hono（同上） | 同上 | E | 2026-09-30 | ☑ |
| GHSA-79qm-7rj5-m7r9 | low | hono（同上） | 同上 | E | 2026-09-30 | ☑ |

### 已消除（B2，2026-09-01 从 allowlist 移除，子票 #445）

| GHSA | 级别 | 受影响包 | 消除方式 | 状态 |
|------|------|----------|----------|------|
| GHSA-72gw-mp4g-v24j | high | multer@2.1.1（@nestjs/platform-express 传递钉版） | backend 直接 `^2.0.2`→`^2.2.0` + `pnpm.overrides` `multer@2` → 2.2.0（platform-express 钉版 2.1.1 一并收敛）；2.2.0 纯安全修复无 breaking（multipart/busboy 链路无变更） | ✅ |
| GHSA-3p4h-7m6x-2hcm | moderate | multer（同上） | 同上 | ✅ |
| GHSA-p6gq-j5cr-w38f | high | nodemailer@7.0.13（backend 直接） | backend 直接 `^7.0.11`→`^9.0.1`；@nestjs-modules/mailer peer `>=8.0.5` 满足，既有 peer 警告消除 | ✅ |
| GHSA-vvjj-xcjg-gr5g | moderate | nodemailer@8.0.11（preview-email 传递钉版） | `pnpm.overrides` `nodemailer@8` → ^9.0.1（preview-email 为 mailer 可选依赖，仅 preview 命令使用） | ✅ |
| GHSA-268h-hp4c-crq3 | moderate | nodemailer（同上） | 同上 | ✅ |
| GHSA-wqvq-jvpq-h66f | moderate | nodemailer（同上） | 同上 | ✅ |
| GHSA-r7g4-qg5f-qqm2 | moderate | nodemailer（同上） | 同上 | ✅ |
| GHSA-c7w3-x93f-qmm8 | low | nodemailer（同上） | 同上 | ✅ |
| GHSA-w5hq-g745-h8pq | moderate | uuid@9.0.1（tencentcloud-sdk / preview-email 传递钉版） | `pnpm.overrides` `uuid@9` → ^11.1.1（后端直接依赖 uuid ^14.0.1 不受影响；v4/v5 API 稳定） | ✅ |

### 已消除（B1，2026-08-31 从 allowlist 移除）

| GHSA | 级别 | 受影响包 | 消除方式 | 状态 |
|------|------|----------|----------|------|
| GHSA-ph34-pc88-72gc | high | npm（经 `latest@0.2.0` 死依赖） | 移除 frontend_mobile 死依赖 `latest`（零引用） | ✅ |
| GHSA-4328-8hgf-7wjr | high | npm（同上） | 同上 | ✅ |
| GHSA-x8qc-rrcw-4r46 | high | npm（同上） | 同上 | ✅ |
| GHSA-m6cx-g6qm-p2cx | high | npm（同上） | 同上 | ✅ |
| GHSA-93f3-23rq-pjfp | moderate | npm（同上） | 同上 | ✅ |
| GHSA-3jxr-9vmj-r5cp | high | brace-expansion@2.1.1 | `pnpm.overrides` brace-expansion@2 → 2.1.4 | ✅ |
| GHSA-mh99-v99m-4gvg | high | brace-expansion@2.1.1/5.0.7 | brace-expansion@2 → 2.1.4 + @5 → 5.0.9 | ✅ |
| GHSA-rgw5-rvv9-x895 | high | brace-expansion@2.1.1/5.0.7 | 同上 | ✅ |
| GHSA-52cp-r559-cp3m | high | js-yaml@4.1.1 | `pnpm.overrides` js-yaml@4 → 4.3.2 | ✅ |
| GHSA-5p4m-2wfm-xmqj | high | js-yaml@4.3.0 | 同上 | ✅ |
| GHSA-h67p-54hq-rp68 | moderate | js-yaml（同上） | 同上 | ✅ |
| GHSA-v245-v573-v5vm | high | linkify-it@5.0.1 | `pnpm.overrides` linkify-it@5 → 5.0.2 | ✅ |
| GHSA-v2hh-gcrm-f6hx | high | fast-uri@3.1.3 | `pnpm.overrides` fast-uri@3 → 3.1.6 | ✅ |
| GHSA-7p8r-x3mc-p8w7 | high | fast-uri@3.1.3 | 同上 | ✅ |
| GHSA-qwww-vcr4-c8h2 | high | react-router@7.18.1 | `pnpm update react-router-dom` → 7.18.3 | ✅ |
| GHSA-28wg-ghj8-5hjv | high | nanoid@3.3.15 | `pnpm.overrides` nanoid → 3.3.18 | ✅ |
| GHSA-2v37-7h3g-55p8 | high | nanoid@3.3.15 | 同上 | ✅ |
| GHSA-r28c-9q8g-f849 | high | postcss@8.5.16 | `pnpm update postcss` + override → 8.5.26 | ✅ |
| GHSA-fxqj-rqcc-2cmp | moderate | postcss（同上） | 同上 | ✅ |
| GHSA-8r6m-32jq-jx6q | high | fast-xml-parser@5.9.3 | backend 直接依赖 `^5.9.3`→`^5.10.1` → 5.11.1 | ✅ |
| GHSA-2p49-hgcm-8545 | high | svgo@4.0.1 | `pnpm.overrides` svgo@4 → 4.1.0 | ✅ |
| GHSA-ggr8-5vv4-36mx | high | deepmerge-ts@7.1.5（prisma 传递） | `pnpm.overrides` deepmerge-ts → 8.0.2（prisma 兼容已验证） | ✅ |
| GHSA-8xcm-r25x-g524 | moderate | undici@6.27.0 | `pnpm.overrides` undici → 6.28.0 | ✅ |
| GHSA-m8rv-5g2x-5cg5 | moderate | undici（同上） | 同上 | ✅ |
| GHSA-v3r7-h72x-cjcm | moderate | undici（同上） | 同上 | ✅ |
| GHSA-5qjj-4xww-7phc | moderate | valibot@1.2.0 | `pnpm.overrides` valibot → 1.4.2 | ✅ |

## 批次清理计划

- **B1（已完成，2026-08-31）**：移除死依赖 `latest`（消 npm 链 5 条）；直接依赖升级（fast-xml-parser 5.11.1、react-router-dom 7.18.3、postcss 8.5.26）；`pnpm.overrides` 收敛传递依赖（brace-expansion 2.1.4/5.0.9、js-yaml 4.3.2、linkify-it 5.0.2、fast-uri 3.1.6、nanoid 3.3.18、svgo 4.1.0、deepmerge-ts 8.0.2、undici 6.28.0、valibot 1.4.2）。allowlist 43 → 17。
- **B2（已完成，2026-09-01，子票 #445）**：multer 2.2.0（直接 `^2.2.0` + override `multer@2` 收敛 platform-express 钉版）；nodemailer 9.0.1（直接 `^9.0.1` + override `nodemailer@8` 收敛 preview-email 钉版，mailer peer 警告消除）；uuid override `uuid@9` → 11.1.1（tencentcloud-sdk/preview-email 钉版收敛，后端直接依赖 ^14.0.1 不动）。验证：后端 2207/2207 + 前端 1322/1322 全绿、`pnpm audit --prod` 8 条与门禁一致。allowlist 17 → 8。
- **E（引擎/上游阻塞，子票 #446）**：three（mxcad 引擎 peer）、hono/@hono/node-server（prisma→@prisma/dev 传递）——等上游，每 30 天复核确认上游进展。
- **N（无修复版本，子票 #446）**：html-minifier（包已归档）——等 @voerkai18n/art-template 上游，豁免理由长期有效但每 30 天复核确认。

## 验收对照（#423）

- [x] dependency-scan job 上线（`.github/workflows/ci.yml`，与 build-and-test 并行，无 pnpm install，秒级）
- [x] 人为引入高危依赖 CI 变红、allowlist 条目内不红（本地演练：摘除 GHSA-72gw-mp4g-v24j → `Failed security audit due to high vulnerabilities` exit 1；还原 → 绿 exit 0）
- [x] 存量第一批（B1）清理后 allowlist 43→17（-60%），跟踪记录见上表「已消除」节
- [x] 存量第二批（B2，#445）清理后 allowlist 17→8，剩余 8 条全部为上游阻塞/无修复版本（#446 跟踪），跟踪记录见上表「已消除（B2）」节
- [x] vuln-management 制度文本含门禁衔接条款（§1 CI 门禁与例行检查注）
