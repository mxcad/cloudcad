const fs = require('fs');
const path = require('path');

/**
 * 修复 DTO 文件中的严格属性初始化问题
 * 为所有带有 @ApiProperty 装饰器的属性添加 ! 非空断言
 */

const BACKEND_SRC = path.join(__dirname, '..', 'packages', 'backend', 'src');

function fixDtoFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  const lines = content.split('\n');
  const newLines = [];

  let hasApiProperty = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // 检查是否是 @ApiProperty 装饰器
    if (trimmedLine.startsWith('@ApiProperty(')) {
      hasApiProperty = true;
      newLines.push(line);
    }
    // 检查是否是其他装饰器
    else if (trimmedLine.startsWith('@') && !trimmedLine.startsWith('@ApiProperty')) {
      newLines.push(line);
    }
    // 如果是属性声明行
    else if (hasApiProperty && trimmedLine.match(/^(\w+)(\??)(:\s+[^;]+);$/)) {
      // 检查是否已经有 !
      if (!trimmedLine.includes('!:')) {
        // 添加非空断言（如果不是可选属性 ?）
        const newLine = line.replace(/^(\s*)(\w+)(\??)(:\s+[^;]+);$/, (match, indent, name, optional, type) => {
          // 如果已经是可选属性 (?), 不添加 !
          if (optional === '?') {
            return match;
          }
          return `${indent}${name}!${type};`;
        });
        newLines.push(newLine);
        if (newLine !== line) {
          modified = true;
        }
      } else {
        newLines.push(line);
      }
      hasApiProperty = false;
    }
    else {
      newLines.push(line);
      hasApiProperty = false;
    }
  }

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
  console.log('🔧 Fixing DTO strict property initialization issues...\n');

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