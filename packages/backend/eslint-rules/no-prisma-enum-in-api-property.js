/**
 * ESLint 规则：no-prisma-enum-in-api-property
 * 
 * 禁止在 @ApiProperty/@ApiQuery 装饰器中直接使用 Prisma 枚举
 * 原因：会导致 Swagger 循环依赖错误
 * 
 * 错误示例：
 * @ApiProperty({ enum: AuditAction })  // ❌ 会触发循环依赖
 * @ApiQuery({ enum: AuditAction })     // ❌ 会触发循环依赖
 * 
 * 正确示例：
 * @ApiProperty({ enum: Object.values(AuditAction), enumName: 'AuditAction' })  // ✅ 阻断类型追溯
 * @ApiQuery({ enum: Object.values(AuditAction), enumName: 'AuditAction' })     // ✅ 阻断类型追溯
 * 
 * 自动修复：将 enum: XXX 转换为 enum: Object.values(XXX), enumName: 'XXX'
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止在 @ApiProperty/@ApiQuery 中直接使用 Prisma 枚举，防止 Swagger 循环依赖',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      noPrismaEnum:
        '不要在 {{decorator}} 中直接使用 "{{enumName}}" 枚举。请使用 Object.values({{enumName}}) 并添加 enumName 属性。',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        // 检查是否是 @ApiProperty 或 @ApiQuery 装饰器调用
        if (
          node.callee.type !== 'Identifier' ||
          (node.callee.name !== 'ApiProperty' && node.callee.name !== 'ApiQuery')
        ) {
          return;
        }

        const decoratorName = node.callee.name;

        // 检查装饰器参数
        if (node.arguments.length === 0) {
          return;
        }

        const arg = node.arguments[0];
        if (arg.type !== 'ObjectExpression') {
          return;
        }

        // 查找 enum 属性
        const enumProperty = arg.properties.find(
          (prop) =>
            prop.type === 'Property' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'enum'
        );

        if (!enumProperty) {
          return;
        }

        const enumValue = enumProperty.value;

        // 检查是否已经是 Object.values() 形式
        if (
          enumValue.type === 'CallExpression' &&
          enumValue.callee.type === 'MemberExpression' &&
          enumValue.callee.object.type === 'Identifier' &&
          enumValue.callee.object.name === 'Object' &&
          enumValue.callee.property.type === 'Identifier' &&
          enumValue.callee.property.name === 'values'
        ) {
          return; // 已经是正确格式，跳过
        }

        // 检查是否是枚举引用（Identifier）
        if (enumValue.type !== 'Identifier') {
          return;
        }

        const enumName = enumValue.name;

        // 检查是否已有 enumName 属性
        const enumNameProperty = arg.properties.find(
          (prop) =>
            prop.type === 'Property' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'enumName'
        );

        // 报告错误并提供自动修复
        context.report({
          node: enumValue,
          messageId: 'noPrismaEnum',
          data: { enumName, decorator: decoratorName },
          fix(fixer) {
            const sourceCode = context.getSourceCode();
            const enumText = sourceCode.getText(enumValue);

            // 构建修复代码
            let fixText;
            if (enumNameProperty) {
              // 如果已有 enumName，只替换 enum 值
              fixText = `Object.values(${enumText})`;
              return fixer.replaceText(enumValue, fixText);
            } else {
              // 如果没有 enumName，同时添加 Object.values 和 enumName
              fixText = `Object.values(${enumText})`;
              
              // 在 enum 属性后添加 enumName
              return [
                fixer.replaceText(enumValue, fixText),
                fixer.insertTextAfter(enumProperty, `, enumName: '${enumText}'`),
              ];
            }
          },
        });
      },
    };
  },
};
