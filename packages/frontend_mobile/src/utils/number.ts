///////////////////////////////////////////////////////////////////////////////
// ‍ 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// ‍ Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.

// ‍ 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// ‍ The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement

// ‍ 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// ‍ This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials

//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

// ‍  数字处理公共函数
// ‍ Common functions for digital processing


/**
/**

 * 保留几位小数
*Keep a few decimal places

 * @param num 需要处理的数字
*The numbers that @ param num needs to handle

 * @param bit 保留几位小数
*How many decimal places should be retained for @ param bit

 * */


export function keepDecimal(num: number, bit: number): number {
  const iNum = Number(num)
  if(isNaN(iNum)) return num
  const newNum = Number(iNum.toFixed(bit))
  if(isNaN(newNum)) return 0
  return newNum
}


/** 返回范围内的数字
/**Return numbers within the range

 * @template
* @template

 * ```
* ```
ts
* ```ts

 * 示例用法
*Example usage

 * console.log(clampNumber(5, 0, 10)); // ‍  输出: 5
* console.log(clampNumber(5, 0, 10)); // ‍   Output: 5

 * console.log(clampNumber(15, 0, 10)); // ‍  输出: 10
* console.log(clampNumber(15, 0, 10)); // ‍   Output: 10

 * console.log(clampNumber(-5, 0, 10)); // ‍  输出: 0
* console.log(clampNumber(-5, 0, 10)); // ‍   Output: 0

 * ```
*/
export function clampNumber(num: number, min: number, max: number) {
  return Math.min(Math.max(num, min), max);
}
