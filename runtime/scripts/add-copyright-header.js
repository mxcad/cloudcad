/**
 * 为项目中的 TS/JS 源码文件添加版权注释头
 * 
 * 使用方法: node scripts/add-copyright-header.js [--check|--add]
 *   --check: 仅检查哪些文件缺少版权注释
 *   --add: 添加版权注释（默认行为）
 */

const fs = require('fs');
const path = require('path');

// ============================================================

// 新版权声明内容（要插入的字符串）

// ============================================================

const COPYRIGHT_HEADER = `///////////////////////////////////////////////////////////////////////////////
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
`;

// ============================================================
// 旧版权声明内容（要清空的字符串）
// ============================================================
let OLD_COPYRIGHT_HEADER = `///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
`;

// 需要扫描的目录
const SOURCE_DIRS = [
  'apps/backend/src',
  'apps/frontend/src',
];

// 排除的目录模式
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /dist/,
  /\.d\.ts$/,
];

// 文件扩展名
const TARGET_EXTENSIONS = ['.ts', '.js'];

/**
 * 检查路径是否应该被排除
 */
function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * 递归获取目录下所有目标文件
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    
    if (shouldExclude(fullPath)) {
      return;
    }

    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      const ext = path.extname(fullPath);
      if (TARGET_EXTENSIONS.includes(ext)) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

/**
 * 检查文件是否已有版权注释
 * 只检查文件开头是否以斜线行开始（版权块格式）
 */
function hasCopyrightHeader(content) {
  // 处理 shebang：如果有 shebang，跳过第一行检查
  if (content.startsWith('#!')) {
    const newlineIndex = content.indexOf('\n');
    if (newlineIndex === -1) return false;
    // 跳过 shebang 和可能的空行
    const afterShebang = content.slice(newlineIndex + 1);
    return /^\/{10,}/.test(afterShebang.trimStart());
  }
  
  // 检查是否以至少10个斜线开头
  return /^\/{10,}/.test(content);
}

/**
 * 移除文件中所有旧的版权声明（全文字符串匹配）
 */
function removeOldCopyright(content) {
  // 使用 split join 进行全局字符串替换
  return content.split(OLD_COPYRIGHT_HEADER).join('');
}

/**
 * 处理 shebang 行（如 #!/usr/bin/env node）
 * 先移除旧版权声明，再添加新的
 */
function processFileContent(content, hasShebang) {
  // 先移除文件中所有旧的版权声明（全文匹配）
  content = removeOldCopyright(content);
  
  // 移除 shebang 后可能残留的旧版权声明
  if (hasShebang) {
    const lines = content.split('\n');
    const shebangLine = lines[0];
    let restContent = lines.slice(1).join('\n');
    
    // 再次检查并移除 shebang 后的旧版权声明
    restContent = removeOldCopyright(restContent);
    
    // 检查 shebang 后是否已有版权注释
    if (hasCopyrightHeader(restContent)) {
      return null; // 已有版权注释
    }
    
    return shebangLine + '\n\n' + COPYRIGHT_HEADER + restContent;
  } else {
    // 检查是否已有版权注释
    if (hasCopyrightHeader(content)) {
      return null; // 已有版权注释
    }
    
    return COPYRIGHT_HEADER + content;
  }
}

/**
 * 处理单个文件
 */
function processFile(filePath, mode) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const hasShebang = content.startsWith('#!/');
  
  // 检查是否有旧版权声明需要替换（字符串匹配）
  const hasOldCopyright = content.includes(OLD_COPYRIGHT_HEADER);
  
  if (mode === 'check') {
    // 检查模式：如果已有新版权声明则跳过
    if (hasCopyrightHeader(content) && !hasOldCopyright) {
      return { status: 'skipped', reason: 'already_has_copyright' };
    }
    return { status: 'missing', reason: 'no_copyright_header' };
  }
  
  // 添加模式：处理文件（会先移除旧版权再添加新的）
  const newContent = processFileContent(content, hasShebang);
  
  if (newContent === null) {
    return { status: 'skipped', reason: 'already_has_copyright' };
  }
  
  fs.writeFileSync(filePath, newContent, 'utf-8');
  
  // 如果之前有旧版权，标记为替换
  if (hasOldCopyright) {
    return { status: 'replaced', reason: 'copyright_replaced' };
  }
  
  return { status: 'updated', reason: 'copyright_added' };
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--check') ? 'check' : 'add';
  const rootDir = path.resolve(__dirname, '..');
  
  console.log(`\n=== 版权注释${mode === 'check' ? '检查' : '添加'}工具 ===\n`);
  console.log(`模式: ${mode === 'check' ? '仅检查' : '添加版权注释'}\n`);
  
  let totalFiles = 0;
  let updatedFiles = 0;
  let replacedFiles = 0;
  let skippedFiles = 0;
  let missingFiles = 0;
  
  const missingFileList = [];
  
  SOURCE_DIRS.forEach(dir => {
    const fullDir = path.join(rootDir, dir);
    
    if (!fs.existsSync(fullDir)) {
      console.log(`目录不存在: ${fullDir}`);
      return;
    }
    
    const files = getAllFiles(fullDir);
    
    files.forEach(filePath => {
      totalFiles++;
      const result = processFile(filePath, mode);
      
      const relativePath = path.relative(rootDir, filePath);
      
      if (result.status === 'updated') {
        updatedFiles++;
        console.log(`✓ 已添加: ${relativePath}`);
      } else if (result.status === 'replaced') {
        replacedFiles++;
        console.log(`↻ 已替换: ${relativePath}`);
      } else if (result.status === 'missing') {
        missingFiles++;
        missingFileList.push(relativePath);
      } else {
        skippedFiles++;
      }
    });
  });
  
  console.log('\n=== 处理结果 ===\n');
  console.log(`扫描文件总数: ${totalFiles}`);
  
  if (mode === 'check') {
    console.log(`缺少版权注释: ${missingFiles}`);
    console.log(`已有版权注释: ${totalFiles - missingFiles}`);
    
    if (missingFileList.length > 0) {
      console.log('\n缺少版权注释的文件:');
      missingFileList.forEach(f => console.log(`  - ${f}`));
    }
  } else {
    console.log(`已添加版权注释: ${updatedFiles}`);
    console.log(`已替换版权注释: ${replacedFiles}`);
    console.log(`跳过（已有版权）: ${skippedFiles}`);
  }
  
  console.log('');
}

main();