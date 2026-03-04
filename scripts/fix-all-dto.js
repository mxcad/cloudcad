const fs = require('fs');
const path = require('path');

/**
 * 修复所有 DTO 文件中的严格属性初始化问题
 */

const BACKEND_SRC = path.join(__dirname, '..', 'packages', 'backend', 'src');

function fixDtoFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  const lines = content.split('\n');
  const newLines = [];

  let apiPropertyStack = []; // 追踪多个装饰器

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // 检查是否是装饰器
    if (trimmedLine.startsWith('@')) {
      apiPropertyStack.push(line);
    }
    // 如果是属性声明行（前面有装饰器）
    else if (apiPropertyStack.length > 0 && trimmedLine.match(/^(readonly\s+)?(\w+)(\??)(!?:\s+[^;]+);?$/)) {
      // 检查是否已经有 ! 或者是可选属性
      const hasBang = trimmedLine.includes('!:');
      const hasQuestion = trimmedLine.match(/^\w+\?/);

      if (!hasBang && !hasQuestion) {
        // 添加非空断言
        const newLine = line.replace(/^(\s*)(readonly\s+)?(\w+)(:\s+[^;]+);?$/, (match, indent, readonly, name, type) => {
          const ro = readonly || '';
          return `${indent}${ro}${name}!${type};`;
        });
        newLines.push(...apiPropertyStack);
        newLines.push(newLine);
        if (newLine !== line) {
          modified = true;
        }
      } else {
        newLines.push(...apiPropertyStack);
        newLines.push(line);
      }
      apiPropertyStack = [];
    }
    else {
      newLines.push(...apiPropertyStack);
      newLines.push(line);
      apiPropertyStack = [];
    }
  }

  // 处理文件末尾的装饰器
  newLines.push(...apiPropertyStack);

  if (modified) {
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
    console.log(`✓ Fixed: ${filePath}`);
    return true;
  }

  return false;
}

function findDtoFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      findDtoFiles(fullPath, files);
    } else if (item.endsWith('.dto.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function main() {
  console.log('🔧 Fixing all DTO strict property initialization issues...\n');

  const dtoFiles = findDtoFiles(BACKEND_SRC);
  console.log(`Found ${dtoFiles.length} DTO files\n`);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const file of dtoFiles) {
    try {
      const fixed = fixDtoFile(file);
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
