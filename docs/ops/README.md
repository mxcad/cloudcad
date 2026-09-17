# 制度索引（安全管理体系总览）

> 本目录承载「梦想网页CAD实时协同平台」（CloudCAD 在线版，拟定等保第三级）的安全管理体系文档，结构为**方针 → 制度 → 规程**三层（GB/T 22239-2019 8.1.6.2 c「形成策略/制度/规程/表单完整体系」）。
> 公司事实字段（签发主体、人员、群组等）的唯一出口是 [公司事实收集总单](../compliance/company-facts-checklist.md)；本表「签发状态」列随总单勾选进度更新。

## 1. 体系结构

```
方针层（8.1.6.1）
└── 网络安全工作总体方针                    security-policy.md
制度层（8.1.6.2，经公司签发后生效）
├── 管理员角色分工表（三权分立）            admin-roles.md
├── 备份与恢复制度                          backup-restore-policy.md
├── 日志与审计管理制度                      log-audit-policy.md
├── 安全事件处置与应急预案                  incident-response.md
└── 漏洞扫描与补丁管理流程                  vuln-management.md
规程层（操作手册，随部署执行，不单独签发）
├── SSH 加固与边界防护操作手册              ssh-hardening.md
├── 恶意代码防范操作手册（ClamAV）          malware-prevention.md
├── 监控栈裸机离线部署（操作手册）          monitoring-baremetal.md
└── 转换引擎调优（操作手册）                conversion-tuning.md
台账（门禁跟踪记录，随 git 更新，非制度文档、不走签发）
└── 依赖漏洞门禁 allowlist 跟踪表           audit-ci-allowlist.md
```

> **编号对照**：各制度文档头的「等保对照：8.10.x」指 GB/T 22239-2019 的 8.1.10（安全运维管理）控制域，与本文 8.1.6.x（安全管理制度）互补——8.1.6 管「制度体系本身」（策略/发布/评审），8.1.10 管「运维管理内容」（角色/备份/事件/漏洞）。两套编号在 [等保自查清单](../security/mlps3-checklist.md) 中统一跟踪。

## 2. 文档与 GB/T 22239-2019 控制点映射

| 文档 | 层 | 对应控制点 | 说明 |
|---|---|---|---|
| [security-policy.md](security-policy.md) | 方针 | 8.1.6.1 安全策略 | 总体目标/范围/原则/安全框架四要素 |
| [admin-roles.md](admin-roles.md) | 制度 | 8.1.6.2 管理制度（运维角色与授权） | 三权分立 + 系统 `SystemPermission` 权限模型 |
| [backup-restore-policy.md](backup-restore-policy.md) | 制度 | 8.1.6.2 管理制度（备份与恢复） | RPO ≤1h / RTO ≤4h，平台内置备份自动化 |
| [log-audit-policy.md](log-audit-policy.md) | 制度 | 8.4.3.1/8.4.3.2 安全审计 + 8.1.6.2 | 日志范围/归档/查阅审批/定期审查/时钟同步 |
| [incident-response.md](incident-response.md) | 制度 | 8.1.6.2 管理制度（事件处置与应急响应） | 事件分级/联系矩阵/处置流程/演练 |
| [vuln-management.md](vuln-management.md) | 制度 | 8.1.6.2 管理制度（漏洞与风险管理） | 扫描范围/分级时限/补丁流程/台账 |
| [ssh-hardening.md](ssh-hardening.md) | 规程 | 8.1.2.1 边界防护 / 8.1.4.4 入侵防范 / 8.1.5.1 运维通道 | #418 已部署层强制 |
| [malware-prevention.md](malware-prevention.md) | 规程 | 8.1.3.4 / 8.1.4.5 恶意代码防范 | #421 ClamAV 宿主机夜间批扫 |
| [monitoring-baremetal.md](monitoring-baremetal.md) | 规程 | 8.5.4 集中监测/集中审计 | #314 监控栈裸机离线部署 |
| [conversion-tuning.md](conversion-tuning.md) | 规程 | 可用性保障（无直接控制点） | ADR-0060 转换引擎调优 |
| [audit-ci-allowlist.md](audit-ci-allowlist.md) | 台账 | 8.1.4.4(e) / 8.1.10.5 漏洞管理 | #423 依赖漏洞门禁 allowlist 跟踪表 + 豁免流程 |

## 3. 签发状态跟踪

| 文档 | 签发状态 | 待公司事实项（总单编号） |
|---|---|---|
| security-policy.md | ☐ 待签发 | CF-01/02/03/04 |
| admin-roles.md | ☐ 待签发 | CF-01/02/03/04/05/06/07/20 |
| backup-restore-policy.md | ☐ 待签发 | CF-01/02/03/04/08/13/14/15/16/17/20 |
| log-audit-policy.md | ☐ 待签发 | CF-01/02/03/04/05/11/12/15/17/20 |
| incident-response.md | ☐ 待签发 | CF-01/02/03/04/08/09/10/19/20 |
| vuln-management.md | ☐ 待签发 | CF-01/02/03/04/05/09/18/20 |
| ssh-hardening.md | ☑ 随部署执行（#418） | — |
| malware-prevention.md | ☑ 随部署执行（#421） | — |
| monitoring-baremetal.md | ☑ 随部署执行（#314） | — |
| conversion-tuning.md | ☑ 随部署执行（ADR-0060） | — |
| audit-ci-allowlist.md | ☑ 台账（非制度，不走签发，#423） | — |

**签发流程**：公司按 [公司事实收集总单](../compliance/company-facts-checklist.md) 勾选回填 → 各制度文件 `【待公司：CF-xx】` 处替换为事实值并签署文末审批栏 → 本表对应行改为 ☑ 已签发（记录文号与生效日期）→ 同步更新 [等保自查清单](../security/mlps3-checklist.md) 8.1.6.2–8.1.6.4 状态。

**版本控制**：本目录为制度唯一版本源（git）；修订升版本号并记录于各文件发文表，评审要求见 [security-policy.md §5](security-policy.md)。
