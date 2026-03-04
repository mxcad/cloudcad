const fs = require('fs');
const path = require('path');

/**
 * 修复 DTO 文件中的简单属性声明
 * 只为简单的属性声明添加 ! 非空断言
 */

const BACKEND_SRC = path.join(__dirname, '..', 'packages', 'backend', 'src');

function fixDtoFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  const lines = content.split('\n');
  const newLines = [];

  let apiPropertyFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // 检查是否是 @ApiProperty 装饰器
    if (trimmedLine.startsWith('@ApiProperty(')) {
      apiPropertyFound = true;
      newLines.push(line);
    }
    // 检查是否是其他装饰器
    else if (trimmedLine.startsWith('@') && apiPropertyFound) {
      newLines.push(line);
    }
    // 如果是属性声明行（前面有 @ApiProperty）
    else if (apiPropertyFound) {
      // 匹配简单属性声明：name: type;
      // 不匹配：内联对象类型、数组类型等复杂类型
      const simplePropertyMatch = trimmedLine.match(/^(readonly\s+)?([a-zA-Z_]\w*)(:\s+[A-Z][a-zA-Z0-9_<>,\[\]]+);$/);

      if (simplePropertyMatch) {
        const [, readonly, name, type] = simplePropertyMatch;
        // 检查是否已经有 !
        if (!type.includes('!')) {
          const ro = readonly ? readonly + ' ' : '';
          const newLine = line.replace(/^(\s*)(readonly\s+)?([a-zA-Z_]\w*)(:\s+[A-Z][a-zA-Z0-9_<>,\[\]]+);$/, `$1${ro}$3!$4;`);
          newLines.push(newLine);
          modified = true;
        } else {
          newLines.push(line);
        }
      } else {
        newLines.push(line);
      }
      apiPropertyFound = false;
    }
    else {
      newLines.push(line);
      apiPropertyFound = false;
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
