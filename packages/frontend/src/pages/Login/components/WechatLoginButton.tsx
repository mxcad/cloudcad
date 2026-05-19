import React from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface WechatLoginButtonProps {
  onWechatLogin: () => void;
}

export const WechatLoginButton: React.FC<WechatLoginButtonProps> = ({ onWechatLogin }) => {
  return (
    <>
      <div className="divider">
        <span>其他登录方式</span>
      </div>
      <Button
        variant="secondary"
        size="md"
        icon={MessageCircle}
        onClick={onWechatLogin}
        className="w-full justify-center"
      >
        微信登录
      </Button>
    </>
  );
};
