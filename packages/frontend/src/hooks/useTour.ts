/**
 * 用户引导 Hook
 * 提供引导操作的便捷访问
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isActive, startTour, nextStep, skipTour } = useTour();
 *   
 *   return (
 *     <button onClick={() => startTour('file-upload')}>
 *       开始文件上传引导
 *     </button>
 *   );
 * }
 * ```
 */
export { useTour } from '../contexts/TourContext';

// 重新导出类型，方便使用
export type { 
  TourContextValue,
  TourGuide,
  TourStep,
  TourStorage,
  TourState,
  SkipCondition,
  TooltipPlacement,
  TourCategory,
} from '../types/tour';
