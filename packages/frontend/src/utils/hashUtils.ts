///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 文件哈希计算工具
 * 统一使用 MD5 算法，与后端保持一致
 */

import SparkMD5 from 'spark-md5';

/**
 * 计算文件的 MD5 哈希值
 * @param file - 要计算哈希的文件
 * @returns Promise<string> - 文件的 MD5 哈希值
 */
export const calculateFileHash = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const spark = new SparkMD5.ArrayBuffer();
        spark.append(buffer);
        const hash = spark.end();
        resolve(hash);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

/**
 * 计算字符串的 MD5 哈希值
 * @param str - 要计算哈希的字符串
 * @returns string - 字符串的 MD5 哈希值
 */
export const calculateStringHash = (str: string): string => {
  return SparkMD5.hash(str);
};
