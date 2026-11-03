import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { t } from '@/languages';
import { Card } from '@/components/ui/Card';
import { FeedbackQueryPanel } from '@/components/feedback/FeedbackQueryPanel';

/**
 * 匿名查询页（公开路由，无需登录）。
 *
 * 凭提交时返回的查询码（+ 留了联系方式则需匹配）查询反馈处理进度与奖励状态。
 * 这是未登录用户唯一的进度入口；登录用户可在「我的反馈」查看全部。
 * 查询表单与结果展示由 FeedbackQueryPanel 提供（与提交弹窗「查询进度」Tab 共用）。
 */
export const FeedbackQueryPage: React.FC = () => {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  }, [navigate]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
      style={{ background: 'var(--bg-primary)' }}
    >
      <Card className="w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--primary-500)]"
          >
            <ArrowLeft size={16} />
            {t('返回')}
          </button>
          <h1 className="text-lg font-semibold">{t('反馈进度查询')}</h1>
        </div>

        <FeedbackQueryPanel />
      </Card>
    </div>
  );
};

export default FeedbackQueryPage;
