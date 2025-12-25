#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 需要清理的文件列表
const filesToClean = [
  'contexts/AuthContext.tsx',
  'config/getConfig.ts', 
  'components/MxCadUploader.tsx',
  'components/Layout.tsx',
  'pages/UserManagement.tsx',
  'pages/FileSystemManager.tsx',
  'pages/EmailVerification.tsx',
  'pages/Register.tsx',
  'pages/Profile.tsx',
  'pages/ProjectManager.tsx',
  'pages/Login.tsx'
];

// 清理函数
function cleanConsoleInFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`文件不存在: ${fullPath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  
  // 替换各种 console 输出
  content = content.replace(/console\.log\(.*?\);?/g, '// 静默：已移除日志输出');
  content = content.replace(/console\.error\(.*?\);?/g, '// 静默：已移除错误日志');
  content = content.replace(/console\.warn\(.*?\);?/g, '// 静默：已移除警告日志');
  content = content.replace(/console\.info\(.*?\);?/g, '// 静默：已移除信息日志');
  
  fs.writeFileSync(fullPath, content);
  console.log(`已清理: ${filePath}`);
}

// 批量清理
filesToClean.forEach(cleanConsoleInFile);

console.log('日志清理完成！');