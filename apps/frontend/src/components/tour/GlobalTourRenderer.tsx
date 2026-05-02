/**
 * GlobalTourRenderer - 全局引导渲染组件
 *
 * 在应用顶层渲染引导组件，确保在所有页面（包括 CAD 编辑器）都能正常显示
 *
 * 设计要点：
 * - 渲染 TourOverlay、TourTooltip、TourCenter、TourStartModal
 * - 使用 React Portal 渲染到 body 末尾，确保 DOM 顺序正确
 * - 使用最高层级 z-index 确保覆盖所有页面元素
 * - 通过 TourContext 获取引导状态
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useTour } from '../../contexts/TourContext';
import { TourOverlay } from './TourOverlay';
import { TourTooltip } from './TourTooltip';
import { TourCenter } from './TourCenter';
import { TourStartModal } from './TourStartModal';

/**
 * 全局引导渲染组件
 *
 * 必须在 TourProvider 内部使用
 */
export const GlobalTourRenderer: React.FC = () => {
  const {
    isActive: isTourActive,
    currentGuide,
    currentStep,
    resolvedCurrentStep,
    isTourCenterOpen,
    isStartModalOpen,
    openTourCenter,
    closeTourCenter,
    dismissStartModal,
    nextStep,
    skipTour,
    startTour,
  } = useTour();

  const location = useLocation();

  // 确保 Portal 容器在客户端渲染时才创建
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // 创建一个专用的容器元素
    const el = document.createElement('div');
    el.id = 'global-tour-portal';
    document.body.appendChild(el);
    setContainer(el);

    return () => {
      document.body.removeChild(el);
    };
  }, []);

  // 定义不应该显示首次引导弹框的路径
  const excludedPaths = [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/cad-editor',
  ];

  // 检查当前路径是否应该显示引导弹框
  const shouldShowStartModal = !excludedPaths.some(
    path => location.pathname === path || location.pathname.startsWith('/cad-editor/')
  );

  if (!container) {
    return null;
  }

  return createPortal(
    <>
      {/* 引导中心弹窗 */}
      <TourCenter
        isOpen={isTourCenterOpen}
        onClose={closeTourCenter}
      />

      {/* 首次登录引导提示弹窗 - 只在合适的页面显示 */}
      <TourStartModal
        isOpen={isStartModalOpen && shouldShowStartModal}
        onDismiss={dismissStartModal}
        onViewNow={() => {
          dismissStartModal();
          // 直接启动项目管理完整流程引导
          startTour('project-management-full');
        }}
      />

      {/* 引导遮罩层和提示气泡 */}
      {resolvedCurrentStep && currentGuide && (
        <TourOverlay
          step={resolvedCurrentStep}
          isActive={isTourActive}
          onSkip={skipTour}
          onSkipStep={nextStep}
          onNext={nextStep}
          onInteractionComplete={nextStep}
        >
          {({ targetRect, hasTarget }) => (
            <TourTooltip
              step={resolvedCurrentStep}
              currentStep={currentStep}
              totalSteps={currentGuide.steps.length}
              targetRect={targetRect}
              hasTarget={hasTarget}
              onNext={nextStep}
              onSkip={skipTour}
            />
          )}
        </TourOverlay>
      )}
    </>,
    container
  );
};

export default GlobalTourRenderer;
