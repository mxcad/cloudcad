import React from 'react';
import { MessageCircle } from 'lucide-react';
import { CheckCircle } from 'lucide-react';

interface ProfileWechatTabProps {
  wechatId?: string | null | undefined;
  loading: boolean;
  onBind: () => void;
  onUnbind: () => Promise<void>;
}

export const ProfileWechatTab: React.FC<ProfileWechatTabProps> = ({
  wechatId,
  loading,
  onBind,
  onUnbind,
}) => {
  return (
    <div className="tab-content animate-fade-in">
      <div className="wechat-bind-content">
        {wechatId ? (
          <div className="wechat-bound">
            <div className="success-icon">
              <CheckCircle size={48} />
            </div>
            <h3>微信已绑定</h3>
            <p className="bound-info">您可以使用微信快捷登录</p>
            <div className="benefits">
              <div className="benefit-item">
                <CheckCircle size={14} />
                <span>微信扫码快捷登录</span>
              </div>
              <div className="benefit-item">
                <CheckCircle size={14} />
                <span>无需记忆密码</span>
              </div>
              <div className="benefit-item">
                <CheckCircle size={14} />
                <span>账户安全提升</span>
              </div>
            </div>
            <button
              type="button"
              className="submit-button danger"
              onClick={onUnbind}
            >
              <span>解绑微信</span>
            </button>
          </div>
        ) : (
          <div className="wechat-unbound">
            <div className="unbound-icon">
              <MessageCircle size={64} />
            </div>
            <h3>绑定微信</h3>
            <p className="unbound-desc">
              绑定后可使用微信快捷登录，无需记忆密码
            </p>
            <div className="benefits">
              <div className="benefit-item">
                <CheckCircle size={14} />
                <span>扫码快捷登录</span>
              </div>
              <div className="benefit-item">
                <CheckCircle size={14} />
                <span>安全便捷</span>
              </div>
              <div className="benefit-item">
                <CheckCircle size={14} />
                <span>实时消息通知</span>
              </div>
            </div>
            <button
              type="button"
              className="submit-button wechat"
              disabled={loading}
              onClick={onBind}
            >
              <MessageCircle size={20} />
              <span>绑定微信</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
