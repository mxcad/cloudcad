const fs = require('fs');
const path = require('path');

/**
 * 修复 error 类型为 unknown 的错误
 * 将 error.message 和 error.stack 改为 (error as Error).message 等
 */

const BACKEND_SRC = path.join(__dirname, '..', 'packages', 'backend', 'src');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // 匹配 catch (error) 块中的 error.message 和 error.stack
  // 使用非贪婪匹配来找到 catch 块
  const catchPattern = /catch\s*\(\s*error\s*\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;

  const newContent = content.replace(catchPattern, (match, catchBody) => {
    // 检查是否使用了 error.message 或 error.stack
    if (/error\.message/.test(catchBody) || /error\.stack/.test(catchBody)) {
      // 检查是否已经有类型断言
      if (/error\s+as\s+Error/.test(catchBody)) {
        return match;
      }

      // 替换 error.message 和 error.stack
      let newBody = catchBody;

      // 如果多次使用，添加 const err = error as Error;
      const useCount = (catchBody.match(/error\.(message|stack)/g) || []).length;
      if (useCount > 1) {
        // 添加类型断言变量
        newBody = newBody.replace(
          /catch\s*\(\s*error\s*\)\s*\{/,
          'catch (error) {\n      const err = error as Error;'
        );
        // 替换所有 error.message 和 error.stack 为 err.message 和 err.stack
        newBody = newBody.replace(/error\.message/g, 'err.message');
        newBody = newBody.replace(/error\.stack/g, 'err.stack');
      } else {
        // 单次使用，直接内联替换
        newBody = newBody.replace(/error\.message/g, '(error as Error).message');
        newBody = newBody.replace(/error\.stack/g, '(error as Error).stack');
      }

      modified = true;
      return `catch (error) {${newBody}}`;
    }
    return match;
  });

  if (modified) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`✓ Fixed: ${filePath}`);
    return true;
  }

  return false;
}

function findTsFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      findTsFiles(fullPath, files);
    } else if (item.endsWith('.ts') && !item.endsWith('.spec.ts') && !item.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function main() {
  console.log('🔧 Fixing error type unknown issues...\n');

  const tsFiles = findTsFiles(BACKEND_SRC);
  console.log(`Found ${tsFiles.length} TypeScript files\n`);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const file of tsFiles) {
    try {
      const fixed = fixFile(file);
      if (fixed) {
        fixedCount++;
      } else {
        skippedCount++;
      }
    } catch (error) {
      console.error(`✗ Error fixing ${file}:`, error.message);
    }
  }

  console.log(`\n✅ Done! Fixed ${fixedCount} files, skipped ${skippedCount} files`);
}

main();
