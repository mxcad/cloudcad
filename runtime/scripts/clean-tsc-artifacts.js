/**
 * 清理 tsc 在源码目录中生成的 .d.ts、.d.ts.map、.js、.js.map 文件
 * 用法: node scripts/clean-tsc-artifacts.js
 */

const fs = require('fs');
const path = require('path');

const patterns = ['.d.ts', '.d.ts.map', '.js', '.js.map'];

function shouldDelete(filename) {
  return patterns.some(ext => filename.endsWith(ext));
}

function findSourceFile(filename, dir) {
  // 尝试匹配 .ts 或 .tsx 源文件
  const baseName = filename
    .replace(/\.d\.ts\.map$/, '')
    .replace(/\.d\.ts$/, '')
    .replace(/\.js\.map$/, '')
    .replace(/\.js$/, '');

  // 检查 .ts 和 .tsx 两种可能
  const candidates = [`${baseName}.ts`, `${baseName}.tsx`];
  
  for (const candidate of candidates) {
    const fullPath = path.join(dir, candidate);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

function cleanDir(dir) {
  let deletedCount = 0;

  function walk(currentPath) {
    if (!fs.existsSync(currentPath)) return;

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && shouldDelete(entry.name)) {
        const sourceFile = findSourceFile(entry.name, currentPath);

        if (sourceFile) {
          fs.unlinkSync(fullPath);
          console.log(`已删除: ${fullPath}`);
          deletedCount++;
        } else {
          console.log(`跳过: ${fullPath} (无对应源文件)`);
        }
      }
    }
  }

  walk(dir);
  return deletedCount;
}

// 要清理的目录
const dirsToClean = [
  path.resolve(__dirname, '../apps/backend/src'),
  path.resolve(__dirname, '../apps/frontend/src'),
];

console.log('开始清理 tsc 编译产物...\n');

let totalDeleted = 0;
for (const dir of dirsToClean) {
  console.log(`\n处理目录: ${dir}`);
  console.log('-'.repeat(50));
  totalDeleted += cleanDir(dir);
}

console.log('\n' + '='.repeat(50));
console.log(`清理完成，共删除 ${totalDeleted} 个文件`);
