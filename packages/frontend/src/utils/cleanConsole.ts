///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

﻿import { readFileSync, writeFileSync } from 'fs';

/**
 * 清理文件中的 console 输出
 */
function cleanConsoleOutputs(filePath: string): void {
  const content = readFileSync(filePath, 'utf8');

  // 替换所有 console 输出为静默注释
  const cleanedContent = content
    .replace(/console\.log\([^)]*\);?/g, '// 静默：已移除日志输出')
    .replace(/console\.error\([^)]*\);?/g, '// 静默：已移除错误日志')
    .replace(/console\.warn\([^)]*\);?/g, '// 静默：已移除警告日志')
    .replace(/console\.info\([^)]*\);?/g, '// 静默：已移除信息日志');

  writeFileSync(filePath, cleanedContent);
}

// 如果直接运行此文件
if (require.main === module) {
  const files = process.argv.slice(2);
  files.forEach(cleanConsoleOutputs);
}

export { cleanConsoleOutputs };
