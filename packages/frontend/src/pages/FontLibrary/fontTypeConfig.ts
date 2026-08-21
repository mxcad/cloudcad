import {
  FileType,
  FileText,
  FileDigit,
  FileBox,
  FolderOpen,
  Layers,
  Shapes,
  Type,
} from 'lucide-react';
import type { TagVariant } from '@/components/ui/Tag';
import { t } from '@/languages';

// 字体文件类型配置 - 使用颜色和 lucide 图标
export function getFontTypes() {
  return [
    { value: '', label: t('全部格式'), color: '#6366f1', Icon: FolderOpen },
    { value: '.ttf', label: 'TTF', color: '#22c55e', Icon: Type },
    { value: '.otf', label: 'OTF', color: '#009cff', Icon: FileText },
    { value: '.woff', label: 'WOFF', color: '#f59e0b', Icon: FileBox },
    { value: '.woff2', label: 'WOFF2', color: '#f97316', Icon: FileBox },
    { value: '.eot', label: 'EOT', color: '#6366f1', Icon: FileDigit },
    { value: '.ttc', label: 'TTC', color: '#ec4899', Icon: Layers },
    { value: '.shx', label: 'SHX', color: '#06b6d4', Icon: Shapes },
  ];
}

const fontTypeVariants: Record<string, TagVariant> = {
  '.ttf': 'success',
  '.otf': 'info',
  '.woff': 'warning',
  '.woff2': 'warning',
  '.eot': 'primary',
  '.ttc': 'error',
  '.shx': 'info',
};

export const getFontTypeVariant = (extension: string): TagVariant => {
  return fontTypeVariants[extension.toLowerCase()] || 'primary';
};

export interface FontTypeInfo {
  color: string;
  label: string;
  Icon: React.ComponentType<{
    size?: number;
    className?: string;
    style?: React.CSSProperties;
  }>;
}

// 字体类型图标映射
export const getFontIcon = (extension: string): FontTypeInfo => {
  const type = getFontTypes().find((t) => t.value === extension.toLowerCase());
  if (type) {
    return { color: type.color, label: type.label, Icon: type.Icon };
  }
  return { color: '#6366f1', label: extension.toUpperCase(), Icon: FileType };
};
