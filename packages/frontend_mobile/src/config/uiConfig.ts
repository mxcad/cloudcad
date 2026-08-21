
import type UIConfig from '../../public/mxUIConfig.json'
import { getConfig } from './getConfig'

export type UIConfigType = typeof UIConfig
/**  ‍ mxUiConfig.json中的所有UI数据 */
/** ‍ All UI data in mxUiConfig. json*/

export let uiConfig: (Partial<UIConfigType>)
/**  ‍ 工具栏数据 */
/** ‍ Toolbar data*/

export type MxToolbarData = UIConfigType["toolbarData"]

/**  ‍ 请求 mxUiConfig.json中的所有UI数据 异步函数 */
/** ‍ Request all UI data asynchronous functions in mxUiConfig. json*/

export const fetchUiConfig = async ()=> {
  uiConfig = await getConfig(new URL('/public/mxUIConfig.json', import.meta.url).href) as (Partial<UIConfigType>)
}


