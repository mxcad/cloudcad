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
  } = useTour();

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

      {/* 首次登录引导提示弹窗 */}
      <TourStartModal
        isOpen={isStartModalOpen}
        onDismiss={dismissStartModal}
        onViewNow={() => {
          dismissStartModal();
          openTourCenter();
        }}
      />

      {/* 引导遮罩层和提示气泡 */}
      {resolvedCurrentStep && currentGuide && (
        <TourOverlay
          step={resolvedCurrentStep}
          isActive={isTourActive}
          onSkip={skipTour}
          onSkipStep={nextStep}
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
