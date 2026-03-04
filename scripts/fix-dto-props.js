const fs = require('fs');
const path = require('path');

/**
 * 修复 DTO 文件中的严格属性初始化问题
 * 只为属性声明添加 ! 非空断言，不修改装饰器内部
 */

const BACKEND_SRC = path.join(__dirname, '..', 'packages', 'backend', 'src');

function fixDtoFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // 匹配属性声明行（前面有缩进，后面有分号）
  // 模式：缩进 + (readonly )? + 属性名 + : + 类型 + ;
  // 排除：已经有 ! 的、可选属性 ?、装饰器内部的属性
  const propertyPattern = /^(\s+)(readonly\s+)?([a-zA-Z_]\w*)(:\s+[^;]+);$/gm;

  const newContent = content.replace(propertyPattern, (match, indent, readonly, name, type) => {
    // 跳过已经有 ! 的
    if (type.includes('!')) return match;

    // 获取这个属性之前的所有行
    const lines = content.substring(0, content.indexOf(match)).split('\n');
    const prevLines = lines.slice(-10); // 获取前10行来检查装饰器

    // 检查是否有 @ApiProperty 装饰器
    const hasApiProperty = prevLines.some(line =>
      line.trim().startsWith('@ApiProperty(')
    );

    // 如果没有 @ApiProperty 装饰器，不修改
    if (!hasApiProperty) return match;

    // 检查是否是可选属性（前面有 ?）
    // 可选属性不需要 !
    const isOptional = type.trim().startsWith('?');
    if (isOptional) return match;

    // 添加非空断言
    const ro = readonly || '';
    modified = true;
    return `${indent}${ro}${name}!${type};`;
  });

  if (modified) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
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
