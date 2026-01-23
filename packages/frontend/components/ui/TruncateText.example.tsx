/**
 * TruncateText 组件使用示例
 *
 * 本文件展示了 TruncateText 组件的各种使用方式
 */

import React from 'react';
import {
  TruncateText,
  FileNameText,
  PathText,
  DescriptionText,
} from './TruncateText';

/**
 * 示例 1: 基础使用 - 尾部截断（默认）
 */
export const Example1_Basic = () => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">基础使用 - 尾部截断</h3>

      {/* 默认尾部截断 */}
      <div className="max-w-xs">
        <TruncateText maxWidth="200px">
          这是一段很长的文本，会被截断显示...
        </TruncateText>
      </div>

      {/* 使用字符数限制 */}
      <div>
        <TruncateText useCharLimit maxChars={20}>
          这是一段很长的文本，会被截断显示...
        </TruncateText>
      </div>
    </div>
  );
};

/**
 * 示例 2: 文件名截断（中间截断）
 */
export const Example2_FileName = () => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">文件名截断（中间截断）</h3>

      {/* 使用 FileNameText 组件 */}
      <div className="max-w-xs">
        <FileNameText maxWidth="200px">
          very_long_file_name_with_extension.dwg
        </FileNameText>
      </div>

      {/* 手动指定 mode="middle" */}
      <div className="max-w-xs">
        <TruncateText mode="middle" maxWidth="200px">
          another_very_long_file_name.dxf
        </TruncateText>
      </div>
    </div>
  );
};

/**
 * 示例 3: 路径截断（头部截断）
 */
export const Example3_Path = () => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">路径截断（头部截断）</h3>

      {/* 使用 PathText 组件 */}
      <div className="max-w-xs">
        <PathText maxWidth="200px">
          /very/long/path/to/some/folder/file.txt
        </PathText>
      </div>

      {/* 手动指定 mode="start" */}
      <div className="max-w-xs">
        <TruncateText mode="start" maxWidth="200px">
          /another/very/long/path/to/folder/file.txt
        </TruncateText>
      </div>
    </div>
  );
};

/**
 * 示例 4: 响应式宽度
 */
export const Example4_Responsive = () => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">响应式宽度</h3>

      {/* 响应式截断 */}
      <div className="max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg">
        <TruncateText
          maxWidth={100}
          smMaxWidth={150}
          mdMaxWidth={200}
          lgMaxWidth={300}
        >
          这是一段很长的文本，会根据屏幕大小自适应截断...
        </TruncateText>
      </div>
    </div>
  );
};

/**
 * 示例 5: 禁用悬停提示
 */
export const Example5_NoTooltip = () => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">禁用悬停提示</h3>

      {/* 禁用悬停提示 */}
      <div className="max-w-xs">
        <TruncateText maxWidth="200px" showTooltip={false}>
          这是一段很长的文本，鼠标悬停不会显示完整内容
        </TruncateText>
      </div>

      {/* 自定义提示文本 */}
      <div className="max-w-xs">
        <TruncateText maxWidth="200px" tooltipText="这是自定义的提示文本">
          这是一段很长的文本
        </TruncateText>
      </div>
    </div>
  );
};

/**
 * 示例 6: 自定义省略号
 */
export const Example6_CustomEllipsis = () => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">自定义省略号</h3>

      {/* 使用自定义省略号 */}
      <div className="max-w-xs">
        <TruncateText maxWidth="200px" ellipsis="……">
          这是一段很长的文本，使用中文省略号
        </TruncateText>
      </div>

      {/* 使用更多符号 */}
      <div className="max-w-xs">
        <TruncateText maxWidth="200px" ellipsis=">>">
          这是一段很长的文本，使用更多符号
        </TruncateText>
      </div>
    </div>
  );
};

/**
 * 示例 7: 直接裁剪（不显示省略号）
 */
export const Example7_Clip = () => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">直接裁剪（不显示省略号）</h3>

      {/* 使用 clip 模式 */}
      <div className="max-w-xs">
        <TruncateText mode="clip" maxWidth="200px">
          这是一段很长的文本，会被直接裁断
        </TruncateText>
      </div>

      {/* 使用 end 模式但不显示省略号 */}
      <div className="max-w-xs">
        <TruncateText mode="end" maxWidth="200px" showEllipsis={false}>
          这是一段很长的文本，会被直接裁断
        </TruncateText>
      </div>
    </div>
  );
};

/**
 * 示例 8: 在表格中使用
 */
export const Example8_InTable = () => {
  const users = [
    { name: '张三', email: 'zhangsan@example.com' },
    { name: '李四李四李四李四李四', email: 'lisi@example.com' },
    { name: '王五', email: 'wangwu@verylongdomainname.com' },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">在表格中使用</h3>

      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
              姓名
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
              邮箱
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-200">
          {users.map((user, index) => (
            <tr key={index}>
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
    </div>
  );
};

/**
 * 示例 9: 在卡片中使用
 */
export const Example9_InCard = () => {
  const files = [
    {
      name: 'very_long_file_name_with_extension.dwg',
      size: '2.5 MB',
    },
    {
      name: 'another_very_long_file_name.dxf',
      size: '1.2 MB',
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">在卡片中使用</h3>

      <div className="grid grid-cols-2 gap-4">
        {files.map((file, index) => (
          <div key={index} className="border rounded-lg p-4">
            <FileNameText className="font-medium mb-2">
              {file.name}
            </FileNameText>
            <DescriptionText className="text-sm text-slate-500">
              文件大小: {file.size}
            </DescriptionText>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 示例 10: 在面包屑中使用
 */
export const Example10_InBreadcrumb = () => {
  const breadcrumbs = [
    { name: '项目', id: '1' },
    { name: '文件夹', id: '2' },
    { name: '子文件夹名称很长需要截断', id: '3' },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">在面包屑中使用</h3>

      <nav className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.id}>
            {index > 0 && <span className="text-slate-400">/</span>}
            <TruncateText
              maxWidth={80}
              smMaxWidth={100}
              mdMaxWidth={120}
              lgMaxWidth={150}
              className="text-slate-600 hover:text-slate-900"
            >
              {crumb.name}
            </TruncateText>
          </React.Fragment>
        ))}
      </nav>
    </div>
  );
};

/**
 * 完整示例页面
 */
export const TruncateTextExamples = () => {
  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">TruncateText 组件使用示例</h1>

      <Example1_Basic />
      <Example2_FileName />
      <Example3_Path />
      <Example4_Responsive />
      <Example5_NoTooltip />
      <Example6_CustomEllipsis />
      <Example7_Clip />
      <Example8_InTable />
      <Example9_InCard />
      <Example10_InBreadcrumb />
    </div>
  );
};