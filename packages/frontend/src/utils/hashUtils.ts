///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
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
