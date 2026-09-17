/**
 * 工具栏条目。
 *
 * 数据来源：public/mxUIConfig.json 的 toolbarData，由 components/MxToolbar.vue 渲染、
 * pages/home/hooks* 消费。listTitle / isClosed 是纯代码字段（JSON 里没有），
 * 由 useEditObjectToolbar 等运行时构造条目时追加。
 */
export interface MxToolbarItem {
  /** i18n 文案键或原始名称 */
  name?: string;
  /** 图标名（MxIcon 的 icon） */
  icon?: string;
  /** 点击后执行的命令名；缺失或空串 = 纯导航项 */
  cmd?: string;
  /** 是否使用默认图标前缀（MxIcon 的 isDefault） */
  isIconDefault?: boolean;
  /** 子级工具栏条目（菜单展开） */
  list?: MxToolbarItem[];
  /** 子级工具栏标题；缺失时回落到 name + 「工具」 */
  listTitle?: string;
  /** 点击后收起工具栏 */
  isClosed?: boolean;
}
