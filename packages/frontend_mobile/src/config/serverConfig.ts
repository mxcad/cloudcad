///////////////////////////////////////////////////////////////////////////////
// ‍ 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// ‍ Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.

// ‍ 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// ‍ The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement

// ‍ 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// ‍ This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials

//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import type ServerConfig from '../../public/mxServerConfig.json'
import { getConfig } from './getConfig'
export type ServerConfigType = typeof ServerConfig

export let serverConfig: (Partial<ServerConfigType>)

export type UploadFileConfig = Partial<ServerConfigType["uploadFileConfig"]>

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
  let {
    baseUrl = ""
  } = getUploadFileConfig() || {};

  if (baseUrl.substring(0, 16) == "http://localhost") {
    baseUrl = getHostUrl() + baseUrl.substring(16);
  }

  return baseUrl;
}

export function getsaveDwgUrl(): string {
  let {
    saveDwgUrl = ""
  } = getUploadFileConfig() || {};


  if (saveDwgUrl.substring(0, 16) == "http://localhost") {
    saveDwgUrl = getHostUrl() + saveDwgUrl.substring(16);
  }

  return saveDwgUrl;
}


export function getUrlConfig(): { baseUrl: string, saveDwgUrl: string, mxfilepath: string, saveUrl: string,printPdfUrl:string } {
  let {
    baseUrl = "",
    saveDwgUrl = "",
    mxfilepath = "",
    saveUrl = "",
    printPdfUrl ="",
  } = getUploadFileConfig() || {};

  if (baseUrl.substring(0, 16) == "http://localhost") {
    baseUrl = getHostUrl() + baseUrl.substring(16);
  }

  if (saveDwgUrl.substring(0, 16) == "http://localhost") {
    saveDwgUrl = getHostUrl() + saveDwgUrl.substring(16);
  }

  if (saveUrl.substring(0, 16) == "http://localhost") {
    saveUrl = getHostUrl() + saveUrl.substring(16);
  }

  if (printPdfUrl.substring(0, 16) == "http://localhost") {
    printPdfUrl = getHostUrl() + printPdfUrl.substring(16);
  }

  return { baseUrl, saveDwgUrl, mxfilepath, saveUrl,printPdfUrl };
}