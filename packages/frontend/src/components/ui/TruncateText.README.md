# TruncateText 组件

一个功能强大的文字截断组件，支持多种截断模式和友好的交互体验。

## 功能特性

- ✅ **多种截断模式**：尾部截断、头部截断、中间截断、直接裁剪
- ✅ **智能悬停提示**：自动检测截断，仅在需要时显示完整文本
- ✅ **响应式宽度**：支持不同屏幕尺寸的自适应截断
- ✅ **字符数限制**：支持基于字符数的精确截断
- ✅ **自定义配置**：可自定义省略号、提示文本等
- ✅ **专用组件**：提供文件名、路径、描述等场景的专用组件
- ✅ **TypeScript 支持**：完整的类型定义

## 安装

组件已集成到项目中，可直接导入使用：

```tsx
import {
  TruncateText,
  FileNameText,
  PathText,
  DescriptionText,
} from '@/components/ui/TruncateText';

// 或从索引文件导入
import { TruncateText } from '@/components/ui';
```

## 基础用法

### 1. 尾部截断（默认）

适用于大多数文本场景。

```tsx
<TruncateText maxWidth="200px">
  这是一段很长的文本，会被截断显示...
</TruncateText>
```

### 2. 文件名截断（中间截断）

适用于文件名等需要保留两端信息的场景。

```tsx
<FileNameText maxWidth="200px">
  very_long_file_name_with_extension.dwg
</FileNameText>

// 或手动指定模式
<TruncateText mode="middle" maxWidth="200px">
  very_long_file_name_with_extension.dwg
</TruncateText>
```

### 3. 路径截断（头部截断）

适用于路径等需要保留后缀的场景。

```tsx
<PathText maxWidth="200px">
  /very/long/path/to/some/folder/file.txt
</PathText>

// 或手动指定模式
<TruncateText mode="start" maxWidth="200px">
  /very/long/path/to/some/folder/file.txt
</TruncateText>
```

### 4. 描述文本截断（尾部截断）

适用于描述、备注等文本。

```tsx
<DescriptionText maxWidth="300px">
  这是一段很长的描述文本，会被截断显示...
</DescriptionText>
```

## 高级用法

### 响应式宽度

支持不同屏幕尺寸的自适应截断。

```tsx
<TruncateText
  maxWidth={100} // 默认宽度
  smMaxWidth={150} // 小屏幕
  mdMaxWidth={200} // 中等屏幕
  lgMaxWidth={300} // 大屏幕
  xlMaxWidth={400} // 超大屏幕
>
  这是一段很长的文本，会根据屏幕大小自适应截断...
</TruncateText>
```

### 字符数限制

使用字符数限制进行精确截断。

```tsx
<TruncateText useCharLimit maxChars={20}>
  这是一段很长的文本，会被截断显示...
</TruncateText>
```

### 禁用悬停提示

```tsx
<TruncateText maxWidth="200px" showTooltip={false}>
  这是一段很长的文本，鼠标悬停不会显示完整内容
</TruncateText>
```

### 自定义提示文本

```tsx
<TruncateText maxWidth="200px" tooltipText="这是自定义的提示文本">
  这是一段很长的文本
</TruncateText>
```

### 自定义省略号

```tsx
<TruncateText maxWidth="200px" ellipsis="……">
  这是一段很长的文本，使用中文省略号
</TruncateText>

<TruncateText maxWidth="200px" ellipsis=">>">
  这是一段很长的文本，使用更多符号
</TruncateText>
```

### 直接裁剪（不显示省略号）

```tsx
<TruncateText mode="clip" maxWidth="200px">
  这是一段很长的文本，会被直接裁断
</TruncateText>

// 或使用 end 模式但不显示省略号
<TruncateText mode="end" maxWidth="200px" showEllipsis={false}>
  这是一段很长的文本，会被直接裁断
</TruncateText>
```

## API 文档

### TruncateTextProps

| 属性           | 类型                                     | 默认值  | 说明                         |
| -------------- | ---------------------------------------- | ------- | ---------------------------- |
| `children`     | `string`                                 | -       | 要显示的文本（必填）         |
| `mode`         | `'start' \| 'middle' \| 'end' \| 'clip'` | `'end'` | 截断模式                     |
| `maxChars`     | `number`                                 | `100`   | 最大显示字符数               |
| `maxWidth`     | `string \| number`                       | -       | 最大宽度                     |
| `smMaxWidth`   | `string \| number`                       | -       | 小屏幕最大宽度               |
| `mdMaxWidth`   | `string \| number`                       | -       | 中等屏幕最大宽度             |
| `lgMaxWidth`   | `string \| number`                       | -       | 大屏幕最大宽度               |
| `xlMaxWidth`   | `string \| number`                       | -       | 超大屏幕最大宽度             |
| `showTooltip`  | `boolean`                                | `true`  | 是否在鼠标悬停时显示完整文本 |
| `tooltipText`  | `string`                                 | -       | 自定义提示文本               |
| `className`    | `string`                                 | `''`    | 自定义类名                   |
| `ellipsis`     | `string`                                 | `'...'` | 截断后显示的省略号           |
| `useCharLimit` | `boolean`                                | `false` | 是否启用字符数限制           |
| `showEllipsis` | `boolean`                                | `true`  | 是否显示截断指示器           |
| `style`        | `React.CSSProperties`                    | `{}`    | 自定义样式                   |

### 截断模式说明

| 模式       | 说明     | 适用场景                   |
| ---------- | -------- | -------------------------- |
| `'end'`    | 尾部截断 | 大多数文本、描述、备注     |
| `'start'`  | 头部截断 | 路径、需要保留后缀的场景   |
| `'middle'` | 中间截断 | 文件名、需要保留两端的场景 |
| `'clip'`   | 直接裁剪 | 不需要省略号的场景         |

## 专用组件

### FileNameText

文件名专用组件，使用中间截断模式。

```tsx
<FileNameText maxWidth="200px">
  very_long_file_name_with_extension.dwg
</FileNameText>
```

### PathText

路径专用组件，使用头部截断模式。

```tsx
<PathText maxWidth="200px">/very/long/path/to/some/folder/file.txt</PathText>
```

### DescriptionText

描述文本专用组件，使用尾部截断模式。

```tsx
<DescriptionText maxWidth="300px">
  这是一段很长的描述文本，会被截断显示...
</DescriptionText>
```

## 使用场景示例

### 在表格中使用

```tsx
<table className="min-w-full divide-y divide-slate-200">
  <tbody>
    {users.map((user) => (
      <tr key={user.id}>
        <td className="px-6 py-4">
          <TruncateText maxWidth="150px">{user.name}</TruncateText>
        </td>
        <td className="px-6 py-4">
          <TruncateText maxWidth="200px">{user.email}</TruncateText>
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

### 在卡片中使用

```tsx
<div className="border rounded-lg p-4">
  <FileNameText className="font-medium mb-2">{file.name}</FileNameText>
  <DescriptionText className="text-sm text-slate-500">
    {file.description}
  </DescriptionText>
</div>
```

### 在面包屑中使用

```tsx
<nav className="flex items-center gap-2 text-sm">
  {breadcrumbs.map((crumb, index) => (
    <React.Fragment key={crumb.id}>
      {index > 0 && <span className="text-slate-400">/</span>}
      <TruncateText
        maxWidth={80}
        smMaxWidth={100}
        mdMaxWidth={120}
        lgMaxWidth={150}
      >
        {crumb.name}
      </TruncateText>
    </React.Fragment>
  ))}
</nav>
```

## 注意事项

1. **中间截断模式**：中间截断需要 JavaScript 计算精确的截断位置，性能略低于 CSS 截断。如需最佳性能，请使用字符数限制或 CSS 截断模式。

2. **响应式宽度**：响应式宽度需要配合 Tailwind CSS 的响应式类名使用。

3. **悬停提示**：组件会自动检测文本是否被截断，仅在截断时显示悬停提示。

4. **字符数限制**：使用字符数限制时，建议同时设置 `maxWidth` 以确保布局稳定。

## 浏览器兼容性

- Chrome/Edge: ✅ 完全支持
- Firefox: ✅ 完全支持
- Safari: ✅ 完全支持
- IE11: ❌ 不支持

## 相关文件

- `TruncateText.tsx` - 主组件文件
- `TruncateText.example.tsx` - 使用示例
- `TruncateText.spec.tsx` - 单元测试（待添加）

## 更新日志

### v1.0.0 (2026-01-23)

- ✨ 初始版本发布
- ✅ 支持四种截断模式
- ✅ 支持响应式宽度
- ✅ 支持字符数限制
- ✅ 支持智能悬停提示
- ✅ 提供专用组件（FileNameText、PathText、DescriptionText）
