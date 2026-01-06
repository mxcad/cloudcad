const fs = require('fs');
const { globSync } = require('glob');

const files = globSync('packages/backend/src/**/*.spec.ts');

let fixedCount = 0;

files.forEach((file) => {
  let content = fs.readFileSync(file, 'utf8');
  const originalContent = content;

  // 1. 修复对象属性中的缺失引号: name: '值, description: => name: '值', description:
  content = content.replace(/'([^']+),\s+(\w+):/g, "'$1', $2:");

  // 2. 修复方法链中多余的引号: 'method')' => 'method')'
  content = content.replace(/(\w+)'\)'/g, "$1')");

  // 3. 修复 it/describe 中缺失的闭合引号: it('描述, async => it('描述', async
  content = content.replace(
    /(it|describe)\('([^']+),\s+(async|function|\(\))/g,
    "$1('$2', $3"
  );

  // 4. 修复对象属性值缺失引号: message: '值, => message: '值',
  content = content.replace(/:\s*'([^']+),(\s*\n\s*})/g, ": '$1',$2");

  // 5. 修复函数参数缺失引号: ('值?) => ('值')
  content = content.replace(/\('([^']+)\?\)/g, "('$1')");

  // 6. 修复 toThrow 参数缺失引号: toThrow('值?\n => toThrow('值'\n
  content = content.replace(
    /toThrow\(\s*'([^']+)\?(\s*\n)/g,
    "toThrow(\n        '$1'$2"
  );

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`✓ 修复: ${file}`);
    fixedCount++;
  }
});

console.log(`\n完成！修复了 ${fixedCount} 个文件`);
