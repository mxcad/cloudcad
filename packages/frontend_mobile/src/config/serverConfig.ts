import type ServerConfig from '../../public/mxServerConfig.json'
import { getConfig } from './getConfig'
export type ServerConfigType = typeof ServerConfig

export let serverConfig: (Partial<ServerConfigType>)

export const fetchServerConfig = async ()=> {
  if(!serverConfig) {
    serverConfig = await getConfig(new URL('/public/mxServerConfig.json', import.meta.url).href) as (Partial<ServerConfigType>)
  }
}

// mxServerConfig.json 里的 wasmConfig / aiConfig 两个键在移动端零消费者，
// 不在此提供 getter——留着就是「读了不生效」的陷阱出口。
