// 多选操作项 key（回收站扩展 restore/permanentDelete；父组件 selectionAction handler 按此类型标注）
// cut/copy=写入剪贴板（对齐 PC），move=单条目菜单的移动到文件夹（picker）
// 单一事实源：UnifiedFileList / TrashView / ProjectDetailPage / useFileNodeOps 共用，
// 避免类型定义随 Vue 组件文件散落（组件导出 type 会耦合到 .vue 文件解析）。
export type SelectionActionKey =
  | 'download'
  | 'delete'
  | 'move'
  | 'copy'
  | 'cut'
  | 'restore'
  | 'permanentDelete'

// 多选操作项定义（父组件可注入：回收站传 恢复/彻底删除；项目页按权限传 disabled 门控）
export interface SelectionActionDef {
  key: SelectionActionKey
  label: string
  danger?: boolean
  /** 权限/策略门控：禁用该操作（对齐 PC 按权限禁用批量操作按钮） */
  disabled?: boolean
}
