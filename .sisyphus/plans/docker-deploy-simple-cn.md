# Plan 生成：docker-部署简单中文版

## TL;DR

> 摘要：创建一个简单的 Docker 部署打包包，能够打包成 tar.gz 形式分发到任意有 Docker 的线上服务器。打包包含预构建镜像、docker-compose 配置，以及一键部署脚本。服务器无需在本地构建镜像。
> 交付物：部署包 tar.gz、单键部署脚本 deploy.sh、环境变量模板 (.env.example)、以及最简启动脚本。
> 努力程度：短期
> 并行执行：是
> 关键路径：打包 -> 传输 -> 部署

## 背景信息

### 原始需求

- 为线上服务器打包一个可直接部署的 Docker 部署包，要求简洁、上线无感知更新优先。
- 目标是不在目标服务器进行源码构建，而是在本地完成打包，传输至服务器后解压即可启动。

### 面试要点

- 目标是尽量简单的交付，降低服务器端配置和依赖。提供一个 tar 包，解压即可运行。
- 更新策略需要在打包阶段设计，确保能无感更新（滚动更新）。

### Metis 审查（已处理的差距）

- 主要差距：无；重点放在易用性与部署安全性上。

## 工作目标

### 核心目标

- 提供一个最简、可自包含的 Docker 部署包，支持线上服务器的一键部署与滚动更新（在打包层面实现简单能力）。

### 交付物

- 部署包 cloudcad-deploy-simple.tar.gz 包含：
  - docker-compose.yml 已配置好
  - 镜像 tarball cloudcad-app.tar（可选：若内部自带 PostgreSQL/Redis 也放入）
  - .env.example 环境变量模板
  - deploy.sh 单键部署脚本
  - 启动/停止脚本 start.sh / stop.sh（可选）
  - data/ 初始数据目录结构（卷挂载用）
  - README/文档

### 定义完成（可验证）

- 目标服务器执行：
  - tar -xzf cloudcad-deploy-simple-\*.tar.gz
  - docker load -i images/cloudcad-app.tar (如包含镜像)
  - docker-compose up -d
  - 使用健康检查端点验证服务
  - 部署脚本 deploy.sh 应在无需交互的情况下执行并启动服务

### 必须具备

- 单一 tar.gz 部署包
- 部署脚本 deploy.sh
- 以镜像为基础的 docker-compose 设计
- 环境变量模板 (.env.example)
- 最小化数据卷挂载结构

### 不能有

- 服务器端需要源码构建
- 超出 Docker 运行时所需的额外依赖

## 验证策略

- 预部署：校验包内容是否完整（镜像是否存在，compose 文件合法）
- 部署：在干净的服务器上执行一键部署脚本
- 部署后：通过 docker-compose ps、健康端点确认容器状态
- 更新：替换镜像 tarball，执行 deploy.sh update（滚动更新风格）

## 执行策略

### 并行执行波次

- Wave 1：打包任务（镜像打包、compose 拼接、环境变量模板化）
- Wave 2（可选）：在 deploy.sh 中加入轻量的 canary 检查脚本

### 依赖矩阵

- 无外部依赖，目标机器需有 Docker

## 待办事项（TODO）

- [ ] 创建打包产物脚本（pack-docker.js），输出：镜像 tarball、compose、模板
- [ ] 编写 deploy.sh：
  - 从包中加载镜像
  - 使用 docker-compose up -d 启动服务
  - 执行基础健康检查
- [ ] 准备简化的 docker-compose.yml 以便镜像打包后使用
- [ ] 将 .env.example 与使用说明一并打包
- [ ] 提供一个最小数据目录结构以便卷挂载

## 最终验证波（强制执行）

- F1 计划合规性审计 — 由 Oracle 审核
- F2 代码质量审查 — 不需要计划中的代码修改
- F3 实机 QA — 验证 deploy.sh 在干净 VM 上的工作情况
- F4 范围保真性检查 — 确认不需要额外组件

## 提交策略

- 计划文档仅作为参考，不在代码库中提交

## 成功标准

- 产生一个单一 tar.gz 部署包，且在干净服务器上通过最小化步骤完成部署并启动服务。

## 说明

- 此计划尽量避免服务器端构建，降低上线难度，强调简单性与可更新性。

计划文件已保存至：.sisyphus/plans/docker-deploy-simple-cn.md
