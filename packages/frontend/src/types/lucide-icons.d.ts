// lucide-react 子路径导入类型声明
// 允许直接导入单个图标以优化 bundle 大小

declare module 'lucide-react/dist/esm/icons/*' {
  import { LucideIcon } from 'lucide-react';
  const icon: LucideIcon;
  export default icon;
}
