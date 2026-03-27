name: Bug Report
description: 报告一个 Bug 帮助我们改进
title: "[Bug] "
labels: ["bug"]
assignees: []
projects: []
body:

- type: markdown
  attributes:
  value: |
  感谢您报告 Bug！请尽可能详细地描述问题，以便我们快速定位和修复。

- type: textarea
  id: description
  attributes:
  label: Bug 描述
  description: 清晰描述遇到的问题
  placeholder: |
  简要描述这个 Bug：- 预期行为是什么？- 实际行为是什么？- 这个 Bug 严重程度如何？
  validations:
  required: true

- type: textarea
  id: steps
  attributes:
  label: 复现步骤
  description: 能复现 Bug 的详细步骤
  placeholder: | 1. 打开页面 ... 2. 点击按钮 ... 3. 看到错误 ...
  validations:
  required: true

- type: textarea
  id: expected
  attributes:
  label: 预期行为
  description: 描述您期望的正确行为
  validations:
  required: true

- type: textarea
  id: actual
  attributes:
  label: 实际行为
  description: 描述实际发生的错误行为
  validations:
  required: true

- type: input
  id: version
  attributes:
  label: 版本号
  description: 使用的 CloudCAD 版本
  placeholder: "例如：v1.0.0"
  validations:
  required: false

- type: dropdown
  id: os
  attributes:
  label: 操作系统
  description: 运行环境的操作系统
  options: - Windows - macOS - Linux - 其他
  validations:
  required: false

- type: dropdown
  id: browser
  attributes:
  label: 浏览器
  description: 使用的浏览器
  options: - Chrome - Firefox - Safari - Edge - 其他
  validations:
  required: false

- type: textarea
  id: logs
  attributes:
  label: 错误日志 / 控制台输出
  description: 如有错误日志，请粘贴在此（敏感信息请脱敏）
  placeholder: |
  `     粘贴错误日志在这里
    `
  validations:
  required: false

- type: textarea
  id: screenshots
  attributes:
  label: 截图 / 录屏
  description: 如有可能，提供问题截图或录屏
  validations:
  required: false

- type: checkboxes
  id: checklist
  attributes:
  label: 检查清单
  options: - label: 我已搜索现有 Issue，确认此 Bug 未被报告
  required: true - label: 我提供了详细的复现步骤
  required: true - label: 我已移除/脱敏敏感信息
  required: true
