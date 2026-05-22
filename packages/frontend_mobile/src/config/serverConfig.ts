import type ServerConfig from '../../public/mxServerConfig.json'
import { getConfig } from './getConfig'
export type ServerConfigType = typeof ServerConfig

export let serverConfig: (Partial<ServerConfigType>)

export const fetchServerConfig = async ()=> {
  if(!serverConfig) {
    serverConfig = await getConfig(new URL('/public/mxServerConfig.json', import.meta.url).href) as (Partial<ServerConfigType>)
  }
}

export const getWasmConfig = ()=> {
  return serverConfig?.wasmConfig
}

export const getAiConfig = ()=> {
  return serverConfig?.aiConfig
}
