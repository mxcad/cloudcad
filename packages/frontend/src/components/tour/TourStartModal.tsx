/**
 * TourStartModal - 首次登录引导提示弹窗
 * 当用户首次登录时显示，提示用户可以使用引导功能
 * 
 * 设计要点：
 * - 友好的欢迎界面
 * - 简洁的功能介绍
 * - 提供"立即查看"和"稍后再说"选项
 */
import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

// Lucide 图标导入
import { Compass } from 'lucide-react';
import { BookOpen } from 'lucide-react';
import { Target } from 'lucide-react';
import { Sparkles } from 'lucide-react';

/** z-index 层级 */
const START_MODAL_Z_INDEX = 10002;

interface TourStartModalProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调（稍后再说） */
  onDismiss: () => void;
  /** 立即查看回调 */
  onViewNow: () => void;
}

/** 功能特性列表 */
const features = [
  {
    icon: BookOpen,
    title: '业务流程教程',
    description: '学习文件上传、成员管理等核心功能',
  },
  {
    icon: Target,
    title: '交互式引导',
    description: '高亮目标元素，一步步引导操作',
  },
  {
    icon: Compass,
    title: '按需学习',
    description: '随时从引导中心选择需要的教程',
  },
];

export const TourStartModal: React.FC<TourStartModalProps> = ({
  isOpen,
  onDismiss,
  onViewNow,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onDismiss}
      title=""
      size="lg"
      zIndex={START_MODAL_Z_INDEX}
    >
      <div className="text-center">
        {/* 图标 */}
        <div
          className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
          style={{
            background: 'linear-gradient(135deg, var(--primary-100), var(--primary-50))',
            boxShadow: '0 8px 32px rgba(99, 102, 241, 0.2)',
          }}
        >
          <Sparkles size={36} style={{ color: 'var(--primary-500)' }} />
        </div>

        {/* 欢迎标题 */}
        <h2
          className="text-2xl font-bold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          欢迎使用 CloudCAD
        </h2>
        
        <p
          className="text-sm mb-6"
          style={{ color: 'var(--text-secondary)' }}
        >
          我们为您准备了新手引导，帮助您快速上手
        </p>

        {/* 功能特性 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {features.map((feature, index) => {
            const FeatureIcon = feature.icon;
            return (
              <div
                key={index}
                className="p-4 rounded-xl text-left"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: 'var(--primary-50)' }}
                >
                  <FeatureIcon size={20} style={{ color: 'var(--primary-500)' }} />
                </div>
                <h4
                  className="text-sm font-semibold mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {feature.title}
                </h4>
                <p
                  className="text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            onClick={onDismiss}
          >
            稍后再说
          </Button>
          <Button
            variant="primary"
            onClick={onViewNow}
          >
            立即查看引导
          </Button>
        </div>

        {/* 提示 */}
        <p
          className="mt-4 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          您可以随时从侧边栏的「帮助引导」入口访问引导中心
        </p>
      </div>
    </Modal>
  );
};

export default TourStartModal;
