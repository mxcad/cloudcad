import type ServerConfig from '../../public/mxServerConfig.json'
import { getConfig } from './getConfig'
export type ServerConfigType = typeof ServerConfig

export let serverConfig: (Partial<ServerConfigType>)

export const fetchServerConfig = async ()=> {
  if(!serverConfig) {
    serverConfig = await getConfig(new URL('/public/mxServerConfig.json', import.meta.url).href) as (Partial<ServerConfigType>)
  }
}

export const getUploadFileConfig = ()=> {
  return serverConfig?.uploadFileConfig
}

export const getWasmConfig = ()=> {
  return serverConfig?.wasmConfig
}

export const getAiConfig = ()=> {
  return serverConfig?.aiConfig
}

export function getHostUrl(): string {
  let host = window.location.hostname;
  if (host.substring(0, 4) != "http") {
    host = document.location.protocol + "//" + host;
  }
  return host;
}

export function getBaseUrl(): string {
  return getHostUrl();
}

export function getUrlConfig() {
  return { baseUrl: '', saveDwgUrl: '', mxfilepath: '', saveUrl: '', printPdfUrl: '' };
}
