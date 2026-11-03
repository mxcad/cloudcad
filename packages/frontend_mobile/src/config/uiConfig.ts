
import type UIConfig from '../../public/mxUIConfig.json'
import { getConfig } from './getConfig'
import type { MxToolbarItem } from '@/types/mx-toolbar-item'

export type UIConfigType = typeof UIConfig
/**  ‍ mxUiConfig.json中的所有UI数据 */
/** ‍ All UI data in mxUiConfig. json*/

/** 底部工具栏项为运行时 MxToolbarItem（含「注释掉」hidden 标记），其余字段保持 JSON 字面量类型 */
export let uiConfig: Omit<Partial<UIConfigType>, 'toolbarData'> & { toolbarData?: MxToolbarItem[] }

/** 递归过滤 hidden 项（「注释掉」机制：数据保留、运行时剔除不渲染） */
export const filterHiddenToolbar = (items: MxToolbarItem[]): MxToolbarItem[] =>
  items
    .filter((i) => !i.hidden)
    .map((i) => (i.list ? { ...i, list: filterHiddenToolbar(i.list) } : i))

/**  ‍ 请求 mxUiConfig.json中的所有UI数据 异步函数 */
/** ‍ Request all UI data asynchronous functions in mxUiConfig. json*/

export const fetchUiConfig = async ()=> {
  const cfg = await getConfig(new URL('/public/mxUIConfig.json', import.meta.url).href) as (Partial<UIConfigType>)
  uiConfig = {
    ...cfg,
    toolbarData: cfg.toolbarData ? filterHiddenToolbar(cfg.toolbarData as MxToolbarItem[]) : cfg.toolbarData,
  }
}


