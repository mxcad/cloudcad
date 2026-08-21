# Serverless / 白嫖方案调研 — mxcadassembly 运行环境

> 2026-07-28
> 用途：CloudCAD 三模式架构中「Cloud FaaS」模式的白嫖后端选型参考

## 前提

- mxcadassembly 提供 **Linux 版二进制**，无需 Wine
- 转换为**间歇性负载**，非持续高并发
- 目标是白嫖 / 极低成本运行

## 方案总览

| 方案 | 免费额度 | 最大超时 | 运行方式 | 评价 |
|------|---------|---------|---------|------|
| **Embedded 模式** | ∞（自有服务器） | 不限 | 进程内 spawn | ⭐ 最省，本就有服务器 |
| **Google Cloud Run** | 200万次/月 + 360K GB-秒 | **60 分钟** | Docker 容器 | ⭐ 超时长、额度大、最适合 |
| **华为 FunctionGraph** | 100万次/月 | 15-30 分钟 | 容器镜像 | ✅ PRD 原定方案 |
| **AWS Lambda** | 100万次/月 + 400K GB-秒 | 15 分钟 | 容器镜像 | ✅ 可行但不适合长任务 |
| **阿里云 FC** | 150K CU（首月） | 10-∞ 分钟 | 容器镜像 | ⚠️ 免费期短 |
| **Oracle Cloud 永久免费 VM** | 4 核 24GB ARM 永久免费 | 不限 | 直接部署 | ✅ 适合常驻节点 |
| **Fly.io** | 3 台共享 VM 免费 | 不限 | Docker 容器 | ⚠️ 小众平台 |
| **抢占式 ECS** | ❌ 付费（正价 10-20%） | 不限 | 直接部署 | 便宜但非白嫖 |
| **Cloudflare Workers** | ❌ 不支持 | 30 秒 | — | ❌ 不可用 |
| **边缘计算 (ENS/IEC)** | ❌ 无免费 | — | — | ❌ 不适用 |

## 推荐排序

### 1. Embedded 模式 — 完全免费

自有后端服务器的空闲 CPU 直接跑 mxcadassembly，零额外成本。

### 2. Google Cloud Run — 白嫖首选

- 60 分钟超时，满足所有转换场景
- 200万次/月 + 360K GB-秒 免费，间歇负载够用
- Docker 容器部署，mxcadassembly Linux 版直接打包
- HTTP 触发，IFunctionExecutor 对接简单

### 3. 华为 FunctionGraph — 国内首选

- 100万次/月免费
- 15-30 分钟超时，大多数转换够用
- 国内网络延迟低

### 4. Oracle Cloud 免费 VM — 常驻节点

- 4 核 ARM + 24GB 内存 **永久免费**
- 适合跑一个常驻转换 Worker
- 24 小时在线，没有冷启动问题

## 架构说明

IFunctionExecutor 接口抽象了转换后端，所有方案都通过同一接口调用，随时切换：

```
IFunctionExecutor.invoke(task)
├── ProcessPoolExecutor  (Embedded — 免费)
├── HttpConversionExecutor (Standalone)
├── CloudRunExecutor     (Google Cloud Run — 白嫖)
├── FunctionGraphExecutor (华为云 — 白嫖)
└── LambdaExecutor       (AWS)
```

切换只需改一个环境变量，业务代码零改动。
