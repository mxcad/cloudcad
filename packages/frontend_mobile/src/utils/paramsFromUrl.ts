///////////////////////////////////////////////////////////////////////////////
// ‍ 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// ‍ Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.

// ‍ 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// ‍ The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement

// ‍ 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// ‍ This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials

//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/** 打开页面并传递参数 */
export function openPageWithParams(url: string, params: Record<string, any>): void {
  const paramString = new URLSearchParams(encodeParams(params)).toString();
  window.location.href = `${url}?${paramString}`;
}

/** 获取页面传递的参数 */
export function getParamsFromUrl(): Record<string, any> {
  let params: Record<string, any> = {};
  const url = window.location.href;
  const questionMarkIndex = url.indexOf("?");
  if (questionMarkIndex !== -1) {
    const paramString = url.substring(questionMarkIndex + 1);
    params = decodeParams(parseParamString(paramString));
  }
  return params;
}

/** 解析参数字符串并返回参数对象 */
export function parseParamString(paramString: string): Record<string, any> {
  const params: Record<string, any> = {};
  const paramPairs = paramString.split("&");
  for (let i = 0; i < paramPairs.length; i++) {
    const pair = paramPairs[i].split("=");
    params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
  }
  return params;
}

/**  ‍ 将参数对象分解成参数字符串并返回 */
/** ‍ Decompose parameter objects into parameter strings and return them*/

export function stringifyParams(params: Record<string, any>): string {
  return new URLSearchParams(encodeParams(params)).toString();
}

/**   ‍ 对参数对象进行编码 */
/** ‍ Encode parameter objects*/

function encodeParams(params: Record<string, any>): Record<string, string> {
  const encodedParams: Record<string, string> = {};
  for (const key in params) {
    encodedParams[encodeURIComponent(key)] = encodeURIComponent(params[key]);
  }
  return encodedParams;
}

/**  ‍ 对参数对象进行解码 */
/** ‍ Decoding parameter objects*/

function decodeParams(params: Record<string, string>): Record<string, any> {
  const decodedParams: Record<string, any> = {};
  for (const key in params) {
    decodedParams[decodeURIComponent(key)] = decodeURIComponent(params[key]);
  }
  return decodedParams;
}
