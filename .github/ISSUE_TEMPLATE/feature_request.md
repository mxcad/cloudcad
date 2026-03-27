name: Feature Request
description: 提出新功能请求或改进建议
title: "[Feature] "
labels: ["enhancement"]
assignees: []
projects: []
body:

- type: markdown
  attributes:
  value: |
  感谢您提出功能建议！请详细描述您的需求，以便我们评估和实现。

- type: textarea
  id: summary
  attributes:
  label: 功能摘要
  description: 简洁概括您期望的功能
  placeholder: |
  例如：添加批量导出 DWG 文件的功能
  validations:
  required: true

- type: textarea
  id: problem
  attributes:
  label: 解决的问题
  description: 这个功能解决了什么问题？有什么使用场景？
  placeholder: | - 当前工作流程中遇到的痛点 - 需要这个功能的业务场景
  validations:
  required: true

- type: textarea
  id: solution
  attributes:
  label: 期望的解决方案
  description: 描述您期望的功能实现方式
  placeholder: | - 功能应该如何工作 - 关键交互和界面设计建议 - 相关的配置选项
  validations:
  required: true

- type: textarea
  id: alternatives
  attributes:
  label: 替代方案
  description: 您考虑过其他解决方案吗？
  validations:
  required: false

- type: textarea
  id: context
  attributes:
  label: 额外上下文
  description: 任何其他相关信息、截图或参考资料
  validations:
  required: false

- type: checkboxes
  id: checklist
  attributes:
  label: 检查清单
  options: - label: 我已搜索现有 Issue，确认此功能未被请求
  required: true - label: 这不是重复的功能请求
  required: true - label: 功能符合 CloudCAD 的产品定位
  required: true
