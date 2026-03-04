/**
 * 批量修复后端 Service 层的普通 Error 为 NestJS HttpException
 * 
 * 运行方式：node scripts/fix-service-errors.js
 */

const fs = require('fs');
const path = require('path');

// 需要修复的文件列表（基于 code-explorer 的分析结果）
const fixes = [
  // gallery.service.ts
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 340, from: "throw new Error('父分类不存在')", to: "throw new NotFoundException('父分类不存在')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 345, from: "throw new Error('父分类不存在')", to: "throw new NotFoundException('父分类不存在')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 349, from: "throw new Error('父分类类型不匹配')", to: "throw new BadRequestException('父分类类型不匹配')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 360, from: "throw new Error('不能创建四级分类')", to: "throw new BadRequestException('不能创建四级分类')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 375, from: "throw new Error('分类名称已存在')", to: "throw new ConflictException('分类名称已存在')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 425, from: "throw new Error('分类不存在')", to: "throw new NotFoundException('分类不存在')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 430, from: "throw new Error('分类不存在')", to: "throw new NotFoundException('分类不存在')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 434, from: "throw new Error('分类类型不匹配')", to: "throw new BadRequestException('分类类型不匹配')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 449, from: "throw new Error('分类名称已存在')", to: "throw new ConflictException('分类名称已存在')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 491, from: "throw new Error('分类不存在')", to: "throw new NotFoundException('分类不存在')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 496, from: "throw new Error('分类不存在')", to: "throw new NotFoundException('分类不存在')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 500, from: "throw new Error('分类类型不匹配')", to: "throw new BadRequestException('分类类型不匹配')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 513, from: "throw new Error('该分类下有子分类，无法删除')", to: "throw new BadRequestException('该分类下有子分类，无法删除')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 526, from: "throw new Error('该分类下有文件，无法删除')", to: "throw new BadRequestException('该分类下有文件，无法删除')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 627, from: "throw new Error('文件不存在')", to: "throw new NotFoundException('文件不存在')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 631, from: "throw new Error('不能添加文件夹到图库')", to: "throw new BadRequestException('不能添加文件夹到图库')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 643, from: "throw new Error('分类不存在')", to: "throw new NotFoundException('分类不存在')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 647, from: "throw new Error('分类类型不匹配')", to: "throw new BadRequestException('分类类型不匹配')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 656, from: "throw new Error('一级分类不存在')", to: "throw new NotFoundException('一级分类不存在')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 660, from: "throw new Error('一级分类必须是顶级分类')", to: "throw new BadRequestException('一级分类必须是顶级分类')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 664, from: "throw new Error('一级分类类型不匹配')", to: "throw new BadRequestException('一级分类类型不匹配')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 669, from: "throw new Error('二级分类不属于选择的一级分类')", to: "throw new BadRequestException('二级分类不属于选择的一级分类')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 683, from: "throw new Error('该文件已经在您的图库中')", to: "throw new ConflictException('该文件已经在您的图库中')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 768, from: "throw new Error('文件不在图库中')", to: "throw new NotFoundException('文件不在图库中')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 777, from: "throw new Error('分类不存在')", to: "throw new NotFoundException('分类不存在')" },
  { file: 'packages/backend/src/gallery/gallery.service.ts', line: 781, from: "throw new Error('分类类型不匹配')", to: "throw new BadRequestException('分类类型不匹配')" },
];

// 需要添加的导入
const requiredImports = {
  'NotFoundException': '@nestjs/common',
  'BadRequestException': '@nestjs/common',
  'ConflictException': '@nestjs/common',
  'InternalServerErrorException': '@nestjs/common',
  'ForbiddenException': '@nestjs/common',
  'UnauthorizedException': '@nestjs/common',
};

// 按文件分组
const fixesByFile = {};
for (const fix of fixes) {
  if (!fixesByFile[fix.file]) {
    fixesByFile[fix.file] = [];
  }
  fixesByFile[fix.file].push(fix);
}

// 处理每个文件
for (const [file, fileFixes] of Object.entries(fixesByFile)) {
  const filePath = path.resolve(__dirname, '..', file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`文件不存在: ${filePath}`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // 应用所有替换
  for (const fix of fileFixes) {
    if (content.includes(fix.from)) {
      content = content.replace(fix.from, fix.to);
      modified = true;
      console.log(`✓ ${file}:${fix.line}: ${fix.from} -> ${fix.to}`);
    } else {
      console.log(`⚠ ${file}:${fix.line}: 未找到匹配 "${fix.from}"`);
    }
  }
  
  if (modified) {
    // 检查并添加必要的导入
    const imports = new Set();
    for (const fix of fileFixes) {
      const exceptionType = fix.to.match(/throw new (\w+)\(/)?.[1];
      if (exceptionType && requiredImports[exceptionType]) {
        imports.add(exceptionType);
      }
    }
    
    // 检查现有的 @nestjs/common 导入
    const commonImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]@nestjs\/common['"]\/");
    if (commonImportMatch) {
      const existingImports = commonImportMatch[1].split(',').map(s => s.trim());
      const newImports = [...existingImports];
      
      for (const imp of imports) {
        if (!existingImports.includes(imp)) {
          newImports.push(imp);
        }
      }
      
      const newImportStatement = `import { ${newImports.join(', ')} } from '@nestjs/common';`;
      content = content.replace(commonImportMatch[0], newImportStatement);
      console.log(`✓ 更新导入: ${file}`);
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ 已保存: ${file}`);
  }
}

console.log('\n修复完成！');
