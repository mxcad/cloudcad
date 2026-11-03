import React from 'react';
import { t } from '@/languages';
import { Modal } from '@/components/ui/Modal';
import { FeedbackQueryPanel } from '@/components/feedback/FeedbackQueryPanel';

interface FeedbackQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 预填查询码（成功视图「查询进度」入口带码打开） */
  initialCode?: string;
}

/**
 * 反馈进度查询弹窗（PC 端）。
 *
 * 独立弹框（与提交反馈弹窗平级）：凭查询码 + 可选联系方式查询处理进度与奖励状态。
 * 由提交反馈弹窗内的「查询进度」入口打开，也可从匿名查询页跳转（页面复用同一面板）。
 */
export const FeedbackQueryModal: React.FC<FeedbackQueryModalProps> = ({
  isOpen,
  onClose,
  initialCode,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('反馈进度查询')}
      maxWidth="max-w-[460px]"
    >
      {/* key 随开关切换：每次打开重置面板状态并应用 initialCode 预填 */}
      <FeedbackQueryPanel key={String(isOpen)} initialCode={initialCode} />
    </Modal>
  );
};
